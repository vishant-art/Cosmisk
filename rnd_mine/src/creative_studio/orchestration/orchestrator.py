# src/creative_studio/orchestration/orchestrator.py
"""The asyncio Orchestrator engine (Task 20): the pipeline's coordination core.

`compile_generation_task` compiles the four approved planning contracts
(`CreativeSpec`, `CharacterSheet`, `ShotSpec`, `Product`) into a single
`GenerationTask` -- the config-only work order the orchestrator executes.

`Orchestrator` drives that work order through the fixed 14-step
`run_state.STEP_NAMES` graph with durable, resumable, selectively
regenerable steps:

    portrait                                    (await, first)
       |
       +-- gather --> shot1: keyframe -> replace -> video
                  |-- shot2: keyframe -> replace -> video
                  |-- shot3: keyframe -> replace -> video
                  +-- voice
       |
    compose -> qa -> export                     (sequential, after)

Every step is persisted through the injected `RunStateStore` so a crashed or
failed run can be `resume`d (pending/failed steps only, continuing each
step's retry budget) or a single shot `regen_shot`-ed (reset that shot plus
everything downstream, then re-run). The actual provider work is delegated to
an injected `workers` object (a fake in tests, `generation.workers.RealWorkers`
in production) so the engine here never makes a paid call itself.

Concurrency safety: the three shot chains and the voice step run concurrently
under `asyncio.gather`, and they all mutate one shared `RunState` and persist
it through the store's read-modify-write `save()`. A single per-instance
`asyncio.Lock` serializes every `mark`/`save`, so concurrent chains can never
interleave a stale snapshot over a fresher one and lose an update.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass

from creative_studio.contracts import (
    CharacterSheet,
    CreativeSpec,
    GenerationTask,
    Product,
    ShotSpec,
    ShotTask,
    new_id,
)
from creative_studio.orchestration.run_state import STEP_NAMES, RunState, reset_shot

# The 11 generation steps that must all be `done` before compose may run:
# portrait, the nine shot steps, and voice (STEP_NAMES[:11]).
_COMPOSE_PREREQS: tuple[str, ...] = STEP_NAMES[:11]

# The steps a `live_images` resume/regen depends on: a `"dry-run:*"` stub
# left `done` on any of these under a live mode is the dry->live upgrade
# trap (Task-26-review Fix 3) -- see `_refuse_dry_to_live_upgrade` below.
_IMAGE_MODE_DEPENDENCIES: tuple[str, ...] = (
    "portrait",
    "shot1_keyframe", "shot2_keyframe", "shot3_keyframe",
    "shot1_replace", "shot2_replace", "shot3_replace",
)
# `live_video` depends on everything `live_images` does PLUS the clips and
# voice track (a live clip renders from a keyframe/replace image; a dry stub
# there is not a valid conditioning image).
_VIDEO_MODE_DEPENDENCIES: tuple[str, ...] = _IMAGE_MODE_DEPENDENCIES + (
    "shot1_video", "shot2_video", "shot3_video", "voice",
)


@dataclass
class RunMode:
    """Which stages spend real money.

    `live_images` gates portrait / keyframe / replace; `live_video` gates the
    video clips AND the voice track. compose/qa/export never spend -- they act
    on whatever artifacts exist (in a dry run, the `"dry-run:*"` stubs).
    """

    live_images: bool = False
    live_video: bool = False


def _refuse_dry_to_live_upgrade(state: RunState, mode: RunMode) -> None:
    """Refuse a `resume`/`regen_shot` that would silently upgrade a dry-
    completed step to live in place.

    A step already `done` with a `"dry-run:*"` stub artifact is, to
    `_step`, simply finished -- resuming/regenerating with `mode.live_images`
    or `mode.live_video` set would skip straight past it (never re-running
    it live) and then spend real money on whatever steps ARE still pending,
    before failing downstream once a live step (e.g. `compose`) hits a stub
    uri it can't actually download. There is no safe in-place upgrade path:
    the only sanctioned fix is a fresh `generate` with the desired live
    flags from the start.

    Checks exactly the steps the REQUESTED mode depends on (`_VIDEO_MODE_
    DEPENDENCIES` when `mode.live_video`, else `_IMAGE_MODE_DEPENDENCIES`
    when `mode.live_images`); a dry run (`mode` all-False) never checks
    anything, since it can never be "upgrading" to live.
    """
    if mode.live_video:
        steps_to_check = _VIDEO_MODE_DEPENDENCIES
    elif mode.live_images:
        steps_to_check = _IMAGE_MODE_DEPENDENCIES
    else:
        return

    for name in steps_to_check:
        step = state.steps.get(name)
        if step is None or step.status != "done":
            continue
        uri = (step.artifacts or {}).get("uri")
        if isinstance(uri, str) and uri.startswith("dry-run:"):
            raise RuntimeError(
                f"cannot resume/regenerate run {state.id!r} live: step {name!r} "
                f"is already 'done' with a dry-run stub artifact ({uri!r}), and "
                "a dry artifact cannot be upgraded to live in place. Start a "
                "fresh 'generate' with the desired --live-images/--live-video "
                "flags in ONE invocation instead."
            )


@dataclass
class Services:
    """The shared, injected collaborators the orchestrator and real workers use."""

    adapter: object
    r2: object
    repos: object
    run_store: object
    settings: object


def compile_generation_task(
    spec: CreativeSpec,
    sheet: CharacterSheet,
    shot_spec: ShotSpec,
    product: Product,
) -> GenerationTask:
    """Compile the four approved planning contracts into one `GenerationTask`.

    The task carries only configuration and references -- the planning objects
    themselves stay with the worker layer. `context.generationId` equals the
    task id, so a run and its work order share one identifier. `None` asset
    references (a missing portrait or product cutout) are dropped rather than
    emitted as null.
    """
    gen_id = new_id("generation")

    shot_tasks = [
        ShotTask(
            shot_number=shot.shot_number,
            duration=shot.duration,
            purpose=shot.purpose,
            image_task={"needsProductReplacement": shot.product.get("replacementRequired", True)},
            video_task={"cameraMovement": shot.camera.get("movement")},
            voice_task={"script": shot.dialogue.get("spokenText")},
            product_task={
                "productId": product.id,
                "cutoutUri": product.derived_assets.get("transparentCutout"),
                "placementRequired": True,
            },
            synchronization={},
        )
        for shot in shot_spec.shots
    ]

    asset_references = {
        "characterPortrait": (sheet.reference_assets.get("primaryPortrait") or {}).get("r2Uri"),
        "productCutout": product.derived_assets.get("transparentCutout"),
    }
    asset_references = {k: v for k, v in asset_references.items() if v is not None}

    return GenerationTask(
        id=gen_id,
        creative_spec_id=spec.id,
        context={
            "generationId": gen_id,
            "platform": spec.platform.get("platform"),
            "language": spec.generation_context.get("language"),
            "creativeStyle": spec.creative_direction.get("style"),
        },
        global_configuration={
            "resolution": "1080x1920",
            "fps": 30,
            "duration": shot_spec.timing.total_duration,
            "aspectRatio": "9:16",
        },
        shot_tasks=shot_tasks,
        asset_references=asset_references,
        references={
            "creativeSpecId": spec.id,
            "characterId": sheet.id,
            "shotSpecId": shot_spec.id,
            "productId": product.id,
        },
    )


class Orchestrator:
    """Drives a `GenerationTask` through the 14-step run-state graph.

    Construct once per logical engine with the shared `Services` and a
    `workers` object exposing the async worker methods (`portrait`, `keyframe`,
    `replace`, `video`, `voice`, `compose`, `qa`, `export`). The per-instance
    `asyncio.Lock` guards all state persistence.
    """

    def __init__(self, services: Services, workers) -> None:
        self.services = services
        self.workers = workers
        self._lock = asyncio.Lock()

    # -- public entry points -------------------------------------------------

    async def run(self, generation_id: str, task: GenerationTask, mode: RunMode) -> RunState:
        """Start (or transparently continue a non-running) run for `generation_id`.

        Refuses a run whose persisted status is already `"running"`: that means
        either a live run is genuinely in flight or a prior run crashed mid-flight
        without reaching a terminal status. Either way, starting over would double
        up on spend and race two writers on one `RunState`. `resume()` is the
        sanctioned way to continue such a run (it re-runs only pending/failed
        steps); this guard applies to `run()` only, never `resume()`.
        """
        state = await self.services.run_store.load(generation_id)
        if state is not None and state.status == "running":
            raise RuntimeError(
                f"run {generation_id!r} is already marked 'running' -- either a run "
                f"is in progress or a previous one crashed mid-flight. Use resume() "
                f"to continue it; run() refuses to start over a 'running' run."
            )
        if state is None:
            state = RunState.new(generation_id, task.creative_spec_id)
        return await self._execute(state, task, mode)

    async def resume(self, generation_id: str, task: GenerationTask, mode: RunMode) -> RunState:
        """Resume an existing run: re-run only pending/failed steps, continuing
        each step's retry budget against the `task` passed here. Errors if the
        run was never persisted.

        Under a live mode, refuses outright (`_refuse_dry_to_live_upgrade`) if
        any step that mode depends on is already `done` with a dry-run stub --
        `resume` would otherwise skip straight past it, never re-running it
        live."""
        state = await self.services.run_store.load(generation_id)
        if state is None:
            raise ValueError(f"cannot resume unknown run: {generation_id!r}")
        _refuse_dry_to_live_upgrade(state, mode)
        return await self._execute(state, task, mode)

    async def regen_shot(
        self, generation_id: str, shot_number: int, task: GenerationTask, mode: RunMode
    ) -> RunState:
        """Regenerate exactly one shot: reset its three steps plus
        compose/qa/export, persist the reset, then run the flow (which now
        re-runs only that shot chain and the tail).

        The dry->live upgrade check runs AFTER `reset_shot` so the shot being
        regenerated (now back to `pending`, about to be legitimately re-run
        under `mode`) never triggers it -- only some OTHER step the requested
        mode depends on (portrait, another shot's keyframe/replace, voice)
        left `done` with a dry-run stub does."""
        state = await self.services.run_store.load(generation_id)
        if state is None:
            raise ValueError(f"cannot regenerate a shot of unknown run: {generation_id!r}")
        reset_shot(state, shot_number)
        _refuse_dry_to_live_upgrade(state, mode)
        async with self._lock:
            await self.services.run_store.save(state)
        return await self._execute(state, task, mode)

    # -- execution graph -----------------------------------------------------

    async def _execute(self, state: RunState, task: GenerationTask, mode: RunMode) -> RunState:
        max_attempts = int(task.execution_rules.get("retryLimit", 2)) + 1

        await self._set_status(state, "running")

        # portrait first (all keyframes reference it)
        await self._step(state, "portrait", lambda: self.workers.portrait(task, mode), max_attempts)

        # Portrait gate: every keyframe conditions on the character portrait, so
        # a portrait that did not complete dooms the run. Rather than spend on
        # three keyframe->replace->video chains (and the voice track) that can
        # never yield a usable ad, skip the whole concurrent generation stage --
        # its steps stay `pending`, resumable once portrait succeeds. In a dry
        # run the portrait worker returns a stub and can't fail, so this never
        # triggers there.
        if state.steps["portrait"].status == "done":
            await self._generation_stage(state, task, mode, max_attempts)

        # compose -> qa -> export, sequential, each gated on its prerequisites
        await self._tail(state, task, mode, max_attempts)

        final = "completed" if all(s.status == "done" for s in state.steps.values()) else "failed"
        await self._set_status(state, final)
        return state

    async def _generation_stage(
        self, state: RunState, task: GenerationTask, mode: RunMode, max_attempts: int
    ) -> None:
        """Run the three shot chains + the voice track concurrently.

        The chains are launched as explicit `asyncio.Task`s (not bare coroutines
        handed straight to `gather`) precisely so a fault that ESCAPES a chain
        can be contained. `_step` swallows worker failures, but a persistence
        failure (a `run_store` save raising) is not a worker failure: it escapes
        the chain. Bare `gather` would then propagate that exception while
        leaving the sibling chains running in the background over a run still
        marked `"running"`. Instead: cancel the siblings, await their
        cancellation so nothing leaks, persist a terminal `"failed"` status, and
        re-raise the original fault.
        """
        tasks = [
            asyncio.create_task(self._shot_chain(state, 1, task, mode, max_attempts)),
            asyncio.create_task(self._shot_chain(state, 2, task, mode, max_attempts)),
            asyncio.create_task(self._shot_chain(state, 3, task, mode, max_attempts)),
            asyncio.create_task(
                self._step(state, "voice", lambda: self.workers.voice(task, mode), max_attempts)
            ),
        ]
        try:
            await asyncio.gather(*tasks)
        except BaseException:
            for t in tasks:
                t.cancel()
            # Drain the cancellations before touching the store, so no sibling
            # write can land after our terminal "failed" write.
            await asyncio.gather(*tasks, return_exceptions=True)
            try:
                await self._set_status(state, "failed")
            except BaseException:
                pass  # best-effort terminal save; must never mask the original fault
            raise

    async def _shot_chain(
        self, state: RunState, n: int, task: GenerationTask, mode: RunMode, max_attempts: int
    ) -> None:
        keyframe, replace, video = f"shot{n}_keyframe", f"shot{n}_replace", f"shot{n}_video"

        # Threaded in fresh on every call (not cached from an earlier step in
        # this same run) so a keyframe worker always sees the portrait step's
        # CURRENT persisted artifacts -- on resume the portrait step is
        # already `done`/`skipped` and the worker's own `self.sheet` never
        # regains the generated portrait, so this is the only way a resumed
        # live keyframe still gets a reference image.
        portrait_artifacts = dict(state.steps["portrait"].artifacts)
        await self._step(
            state, keyframe,
            lambda: self.workers.keyframe(task, n, portrait_artifacts, mode),
            max_attempts,
        )
        if state.steps[keyframe].status != "done":
            return

        keyframe_artifacts = dict(state.steps[keyframe].artifacts)
        await self._step(
            state, replace,
            lambda: self.workers.replace(task, n, keyframe_artifacts, mode),
            max_attempts,
        )
        if state.steps[replace].status != "done":
            return

        replace_artifacts = dict(state.steps[replace].artifacts)
        await self._step(
            state, video,
            lambda: self.workers.video(task, n, replace_artifacts, mode),
            max_attempts,
        )

    async def _tail(
        self, state: RunState, task: GenerationTask, mode: RunMode, max_attempts: int
    ) -> None:
        if all(state.steps[name].status == "done" for name in _COMPOSE_PREREQS):
            artifacts = self._done_artifacts(state)
            await self._step(
                state, "compose", lambda: self.workers.compose(task, artifacts, mode), max_attempts
            )
        if state.steps["compose"].status != "done":
            return

        artifacts = self._done_artifacts(state)
        await self._step(state, "qa", lambda: self.workers.qa(task, artifacts, mode), max_attempts)
        if state.steps["qa"].status != "done":
            return

        # QA's verdict gates export: an explicit `approved: False` blocks it
        # outright (a deliverable built on a failed QA report is worse than no
        # deliverable). `approved` missing/None (a fake worker with no verdict
        # opinion, or any pre-existing state written before this gate existed)
        # keeps the old behavior -- export still runs.
        if state.steps["qa"].artifacts.get("approved") is False:
            await self._mark(
                state, "export", status="skipped", error="blocked by QA: not approved",
            )
            return

        artifacts = self._done_artifacts(state)
        await self._step(
            state, "export", lambda: self.workers.export(task, artifacts, mode), max_attempts
        )

    # -- per-step wrapper ----------------------------------------------------

    async def _step(self, state: RunState, name: str, invoke, max_attempts: int) -> None:
        """Run one step with retries, persisting every transition.

        Skips immediately if the step is already `done`. Otherwise attempts up
        to `max_attempts` total, counting from the step's CURRENT `attempts`
        (so a resumed step continues its budget rather than resetting). If the
        budget is already spent, the step is marked failed without running.
        """
        if state.steps[name].status == "done":
            return

        while True:
            step = state.steps[name]
            if max_attempts - step.attempts <= 0:
                if step.status != "failed":
                    await self._mark(
                        state, name, status="failed",
                        error=step.error or "retry budget exhausted",
                    )
                return

            attempt_no = step.attempts + 1
            await self._mark(state, name, status="running", attempts=attempt_no)
            try:
                artifacts = await invoke()
            except Exception as exc:  # noqa: BLE001 -- any worker failure is a step failure
                if attempt_no >= max_attempts:
                    await self._mark(state, name, status="failed", error=str(exc)[:500])
                    return
                # budget remains: loop and retry
            else:
                # Clear any error left by an earlier failed attempt (e.g. a
                # step that failed on a prior run and now succeeds on resume).
                await self._mark(state, name, status="done", artifacts=artifacts or {}, error=None)
                return

    # -- persistence (serialized) --------------------------------------------

    async def _mark(self, state: RunState, step: str, **updates) -> None:
        async with self._lock:
            await self.services.run_store.mark(state, step, **updates)

    async def _set_status(self, state: RunState, status: str) -> None:
        async with self._lock:
            state.status = status
            await self.services.run_store.save(state)

    @staticmethod
    def _done_artifacts(state: RunState) -> dict:
        """A snapshot keyed by step name of every currently-`done` step's
        artifacts -- the merged input handed to compose/qa/export."""
        return {
            name: dict(step.artifacts)
            for name, step in state.steps.items()
            if step.status == "done"
        }
