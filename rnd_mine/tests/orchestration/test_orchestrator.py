# tests/orchestration/test_orchestrator.py
"""Task 20: asyncio Orchestrator engine tests.

These run the REAL `RunStateStore` against the throwaway test schema (the
session-scoped `repo_pool` fixture, DB-safe: only `creative_studio_test_*`
schemas), with a `FlakyFakeWorkers` double injected for the worker layer so
NO paid provider call ever happens here -- every worker resolves immediately
with a `"dry-run:*"` artifact stub.

`FlakyFakeWorkers` records an ordered call log (one entry per worker
invocation, including failed attempts) and can be programmed to raise on
specific `(step, attempt)` combinations, which is what drives the retry,
exhaustion, and resume assertions.
"""
from __future__ import annotations

import os

import pytest

from creative_studio.config import get_settings
from creative_studio.contracts import (
    CharacterSheet,
    CreativeSpec,
    Product,
    Shot,
    ShotSpec,
    Timing,
    new_id,
)
from creative_studio.orchestration.orchestrator import (
    Orchestrator,
    RunMode,
    Services,
    compile_generation_task,
)
from creative_studio.orchestration.run_state import STEP_NAMES, RunStateStore


# ---------------------------------------------------------------------------
# DB / event-loop gating (mirror tests/orchestration/test_run_state.py)
# ---------------------------------------------------------------------------

def _resolve_migration_dsn() -> str:
    try:
        return get_settings().migration_database_url
    except Exception:
        return os.environ.get("MIGRATION_DATABASE_URL", "")


skip_no_db = pytest.mark.skipif(
    not _resolve_migration_dsn(),
    reason="MIGRATION_DATABASE_URL not set; skipping live Postgres orchestrator tests",
)
asyncio_session = pytest.mark.asyncio(loop_scope="session")


@pytest.fixture(scope="session")
def store(repo_pool) -> RunStateStore:
    pool, schema = repo_pool
    return RunStateStore(pool, schema)


@pytest.fixture
def services(store) -> Services:
    # Dry-run orchestration only touches `run_store`; adapter/r2/repos/settings
    # are never reached because the injected workers are fakes.
    return Services(adapter=None, r2=None, repos=None, run_store=store, settings=None)


# ---------------------------------------------------------------------------
# Planning-contract fixtures (a coherent "luxury linen blazer" ad, mirroring
# tests/generation/test_builders.py, enriched with a portrait + product cutout
# so compile_generation_task's asset_references have something to carry).
# ---------------------------------------------------------------------------

def make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        marketing_objective={"objective": "Conversions"},
        product={"productId": "product_1"},
        audience={},
        messaging={"cta": "Shop Now", "coreMessage": "Premium tailoring made effortless."},
        creative_direction={"style": "Luxury UGC", "lighting": "Soft Natural"},
        platform={"platform": "Instagram", "aspectRatio": "9:16", "maxDuration": 10},
        voice_strategy={"energy": "High"},
        constraints={},
        references={},
    )


def make_sheet() -> CharacterSheet:
    return CharacterSheet(
        id=new_id("character"),
        creative_spec_id="creative_1",
        identity={"gender": "Female", "approximateAge": 27, "ethnicity": "South Asian"},
        appearance={"hair": {"color": "Dark Brown", "length": "Shoulder Length"}, "skinTone": "Medium"},
        wardrobe={},
        personality={"tone": "Warm"},
        expressions={},
        speaking_style={"pace": "Measured"},
        reference_assets={"primaryPortrait": {"r2Uri": "r2://bucket/creative-studio/runs/gen/portraits/primary.png"}},
        conditioning={},
        references={},
    )


def make_product() -> Product:
    return Product(
        id=new_id("product"),
        shopify={"vendor": "Meridian & Co"},
        commercial={"title": "Aria Signature Tailoring No. 4", "price": "249.00", "currency": "USD"},
        variants=[],
        collections=[],
        original_assets={"images": [{"r2Uri": "r2://bucket/products/product_1/original.jpg"}]},
        derived_assets={
            "dominantColors": ["charcoal grey", "navy"],
            "transparentCutout": "r2://bucket/products/product_1/cutouts/cutout.png",
        },
        placement_assets={},
        ai_metadata={"category": "Blazer"},
        provider_metadata={},
    )


def _shot(n: int, purpose: str, dur: float, **fields) -> Shot:
    return Shot(shot_number=n, purpose=purpose, duration=dur, **fields)


def make_shot_spec() -> ShotSpec:
    shot1 = _shot(
        1, "Hook", 3,
        narrative={"summary": "Character notices the blazer.", "viewerEmotion": "Curiosity"},
        camera={"shotType": "Medium", "angle": "Eye Level", "movement": "Handheld"},
        character={"expression": "Excited", "gaze": "Camera", "action": "adjusts the sleeve"},
        product={"visibility": "High", "placement": "Worn", "replacementRequired": True},
        dialogue={"spokenText": "I wasn't expecting this to fit this well."},
        composition={"background": "Modern office", "subjectPosition": "Center"},
    )
    shot2 = _shot(
        2, "Product", 4,
        narrative={"summary": "Character showcases the tailored silhouette.", "viewerEmotion": "Confidence"},
        camera={"shotType": "Wide", "angle": "Low", "movement": "Slow push-in"},
        character={"expression": "Confident", "gaze": "Product", "action": "adjusts the cuff"},
        product={"visibility": "High", "placement": "Worn", "replacementRequired": True},
        dialogue={"spokenText": "Every stitch feels intentional"},
        composition={"background": "Sunlit corridor", "subjectPosition": "Center-left"},
    )
    shot3 = _shot(
        3, "CTA", 3,
        narrative={"summary": "Character smiles beside the product display.", "viewerEmotion": "Trust"},
        camera={"shotType": "Close-up", "angle": "Eye Level", "movement": "Static"},
        character={"expression": "Warm", "gaze": "Camera", "action": "smiles at the display"},
        product={"visibility": "Medium", "placement": "Displayed", "replacementRequired": False},
        dialogue={"spokenText": "You'll feel it the moment you put it on!"},
        composition={"background": "Clean studio backdrop", "subjectPosition": "Center"},
    )
    return ShotSpec(
        id=new_id("shotspec"),
        creative_spec_id="creative_1",
        character_id="character_1",
        story_structure={},
        timing=Timing(total_duration=10, shot_durations=[3, 4, 3]),
        global_style={"aspectRatio": "9:16", "fps": 30},
        shots=[shot1, shot2, shot3],
        transition_rules={},
        rendering_rules={},
        references={},
    )


def make_task():
    return compile_generation_task(make_spec(), make_sheet(), make_shot_spec(), make_product())


# ---------------------------------------------------------------------------
# FlakyFakeWorkers -- ordered call log + programmable per-(step, attempt) fails.
# ---------------------------------------------------------------------------

# Maps a run_state step name to the worker-call key FlakyFakeWorkers logs.
_STEP_URI = {
    "portrait": "dry-run:portrait",
    "shot1_keyframe": "dry-run:keyframe1",
    "shot1_replace": "dry-run:replaced1",
    "shot1_video": "dry-run:clip1",
    "shot2_keyframe": "dry-run:keyframe2",
    "shot2_replace": "dry-run:replaced2",
    "shot2_video": "dry-run:clip2",
    "shot3_keyframe": "dry-run:keyframe3",
    "shot3_replace": "dry-run:replaced3",
    "shot3_video": "dry-run:clip3",
    "voice": "dry-run:voice",
    "compose": "dry-run:compose",
    "qa": "dry-run:qa",
    "export": "dry-run:export",
}


class FlakyFakeWorkers:
    """Records every worker invocation (ordered `calls` log) and raises on
    programmed `(call-key, attempt-number)` combinations.

    `fail` maps a call key (e.g. "keyframe2", "portrait", "compose") to either
    the string "always" or a container of 1-based attempt numbers to fail on.
    The attempt counter is per call key and increments on every invocation, so
    it stays in lockstep with the orchestrator's per-step `attempts`.

    Each successful call returns a `{"uri": ..., "art:<key>": <key>}` dict --
    a distinct artifact per step, so the persisted state can be checked for
    lost updates.
    """

    def __init__(self, fail: dict | None = None) -> None:
        self.fail = fail or {}
        self.calls: list[str] = []
        self._counts: dict[str, int] = {}

    def _fire(self, key: str) -> None:
        self.calls.append(key)
        self._counts[key] = self._counts.get(key, 0) + 1
        attempt = self._counts[key]
        spec = self.fail.get(key)
        if spec == "always" or (spec is not None and spec != "always" and attempt in spec):
            raise RuntimeError(f"programmed failure: {key} attempt {attempt}")

    @staticmethod
    def _art(key: str, uri: str) -> dict:
        return {"uri": uri, f"art:{key}": key}

    async def portrait(self, task, mode) -> dict:
        self._fire("portrait")
        return self._art("portrait", "dry-run:portrait")

    async def keyframe(self, task, shot_number, mode) -> dict:
        key = f"keyframe{shot_number}"
        self._fire(key)
        return self._art(key, f"dry-run:keyframe{shot_number}")

    async def replace(self, task, shot_number, artifacts, mode) -> dict:
        key = f"replace{shot_number}"
        self._fire(key)
        return self._art(key, f"dry-run:replaced{shot_number}")

    async def video(self, task, shot_number, artifacts, mode) -> dict:
        key = f"video{shot_number}"
        self._fire(key)
        return self._art(key, f"dry-run:clip{shot_number}")

    async def voice(self, task, mode) -> dict:
        self._fire("voice")
        return self._art("voice", "dry-run:voice")

    async def compose(self, task, artifacts, mode) -> dict:
        self._fire("compose")
        return self._art("compose", "dry-run:compose")

    async def qa(self, task, artifacts, mode) -> dict:
        self._fire("qa")
        return self._art("qa", "dry-run:qa")

    async def export(self, task, artifacts, mode) -> dict:
        self._fire("export")
        return self._art("export", "dry-run:export")


def _i(calls: list[str], key: str) -> int:
    return calls.index(key)


# ---------------------------------------------------------------------------
# compile_generation_task
# ---------------------------------------------------------------------------

def test_compile_generation_task():
    spec = make_spec()
    sheet = make_sheet()
    shot_spec = make_shot_spec()
    product = make_product()

    task = compile_generation_task(spec, sheet, shot_spec, product)

    # 3 shot tasks, numbered 1..3 (also implies the GenerationTask validator passed).
    assert [t.shot_number for t in task.shot_tasks] == [1, 2, 3]
    assert len(task.shot_tasks) == 3

    # generationId echoed into context and equal to the task id.
    assert task.context["generationId"] == task.id
    assert task.context["platform"] == "Instagram"
    assert task.context["language"] == "English"
    assert task.context["creativeStyle"] == "Luxury UGC"

    # global configuration
    assert task.global_configuration == {
        "resolution": "1080x1920", "fps": 30, "duration": 10, "aspectRatio": "9:16",
    }

    # per-shot task wiring
    t1 = task.shot_tasks[0]
    assert t1.duration == 3
    assert t1.purpose == "Hook"
    assert t1.image_task == {"needsProductReplacement": True}
    assert t1.video_task == {"cameraMovement": "Handheld"}
    assert t1.voice_task == {"script": "I wasn't expecting this to fit this well."}
    assert t1.product_task["productId"] == product.id
    assert t1.product_task["cutoutUri"] == "r2://bucket/products/product_1/cutouts/cutout.png"
    assert t1.product_task["placementRequired"] is True
    # shot3 opted out of replacement
    assert task.shot_tasks[2].image_task == {"needsProductReplacement": False}

    # asset_references carry portrait + cutout, no None values
    assert task.asset_references == {
        "characterPortrait": "r2://bucket/creative-studio/runs/gen/portraits/primary.png",
        "productCutout": "r2://bucket/products/product_1/cutouts/cutout.png",
    }

    # lineage references
    assert task.references == {
        "creativeSpecId": spec.id,
        "characterId": sheet.id,
        "shotSpecId": shot_spec.id,
        "productId": product.id,
    }
    assert task.creative_spec_id == spec.id

    # execution_rules defaults
    assert task.execution_rules["retryLimit"] == 2
    assert task.execution_rules["requiresQA"] is True


def test_compile_drops_none_asset_references():
    spec = make_spec()
    sheet = make_sheet()
    sheet.reference_assets = {}  # no portrait
    shot_spec = make_shot_spec()
    product = make_product()
    product.derived_assets = {"dominantColors": ["charcoal grey"]}  # no cutout

    task = compile_generation_task(spec, sheet, shot_spec, product)

    assert task.asset_references == {}  # both dropped because both were None


# ---------------------------------------------------------------------------
# run: happy path
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_happy_path_order(services):
    task = make_task()
    gen_id = task.context["generationId"]
    workers = FlakyFakeWorkers()
    orch = Orchestrator(services, workers)

    state = await orch.run(gen_id, task, RunMode())

    # every step done, run completed
    assert state.status == "completed"
    for name in STEP_NAMES:
        assert state.steps[name].status == "done", name
        assert state.steps[name].attempts == 1

    calls = workers.calls
    # portrait before any keyframe
    assert _i(calls, "portrait") < min(_i(calls, "keyframe1"), _i(calls, "keyframe2"), _i(calls, "keyframe3"))
    # per-shot keyframe < replace < video
    for n in (1, 2, 3):
        assert _i(calls, f"keyframe{n}") < _i(calls, f"replace{n}") < _i(calls, f"video{n}")
    # compose after all videos and voice
    latest_gen = max(_i(calls, "video1"), _i(calls, "video2"), _i(calls, "video3"), _i(calls, "voice"))
    assert _i(calls, "compose") > latest_gen
    # qa after compose, export after qa
    assert _i(calls, "qa") > _i(calls, "compose")
    assert _i(calls, "export") > _i(calls, "qa")


# ---------------------------------------------------------------------------
# run: retry then success
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_retry_then_success(services):
    task = make_task()
    gen_id = task.context["generationId"]
    workers = FlakyFakeWorkers(fail={"keyframe2": {1}})  # fail first attempt only
    orch = Orchestrator(services, workers)

    state = await orch.run(gen_id, task, RunMode())

    assert state.status == "completed"
    assert state.steps["shot2_keyframe"].status == "done"
    assert state.steps["shot2_keyframe"].attempts == 2  # 1 fail + 1 success
    # keyframe2 was invoked exactly twice
    assert workers.calls.count("keyframe2") == 2


# ---------------------------------------------------------------------------
# run: exhausted retries -> chain short-circuits, run fails
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_exhausted_retries_fail_run(services):
    task = make_task()
    gen_id = task.context["generationId"]
    workers = FlakyFakeWorkers(fail={"keyframe2": "always"})
    orch = Orchestrator(services, workers)

    state = await orch.run(gen_id, task, RunMode())

    assert state.status == "failed"

    kf2 = state.steps["shot2_keyframe"]
    assert kf2.status == "failed"
    assert kf2.attempts == 3  # retryLimit 2 -> 3 attempts
    assert kf2.error and "programmed failure" in kf2.error

    # downstream of the failed keyframe stays pending
    assert state.steps["shot2_replace"].status == "pending"
    assert state.steps["shot2_video"].status == "pending"

    # the other two shots completed
    for name in ("shot1_keyframe", "shot1_replace", "shot1_video",
                 "shot3_keyframe", "shot3_replace", "shot3_video",
                 "portrait", "voice"):
        assert state.steps[name].status == "done", name

    # tail never ran
    for name in ("compose", "qa", "export"):
        assert state.steps[name].status == "pending", name

    # replace2/video2 were never invoked (short-circuit)
    assert "replace2" not in workers.calls
    assert "video2" not in workers.calls

    # persisted state matches
    loaded = await services.run_store.load(gen_id)
    assert loaded.status == "failed"
    assert loaded.steps["shot2_keyframe"].status == "failed"


# ---------------------------------------------------------------------------
# resume: continues the retry budget from the resume task, then completes
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_resume_completes(services):
    # First run with retryLimit 0 so a single programmed failure exhausts.
    task0 = make_task()
    task0 = task0.model_copy(update={"execution_rules": {**task0.execution_rules, "retryLimit": 0}})
    gen_id = task0.context["generationId"]
    workers = FlakyFakeWorkers(fail={"keyframe2": {1}})  # only attempt 1 fails
    orch = Orchestrator(services, workers)

    first = await orch.run(gen_id, task0, RunMode())
    assert first.status == "failed"
    assert first.steps["shot2_keyframe"].status == "failed"
    assert first.steps["shot2_keyframe"].attempts == 1

    # Resume with a fresh task carrying retryLimit 2: budget = 3 - 1 = 2 remaining.
    task2 = task0.model_copy(update={"execution_rules": {**task0.execution_rules, "retryLimit": 2}})
    resumed = await orch.resume(gen_id, task2, RunMode())

    assert resumed.status == "completed"
    # attempts continued (no reset): 1 from the first run + 1 successful on resume.
    assert resumed.steps["shot2_keyframe"].attempts == 2
    assert resumed.steps["shot2_keyframe"].status == "done"
    # the stale error from the first run's failure is cleared on success
    assert resumed.steps["shot2_keyframe"].error is None
    assert workers.calls.count("keyframe2") == 2


@skip_no_db
@asyncio_session
async def test_resume_unknown_run_raises(services):
    task = make_task()
    orch = Orchestrator(services, FlakyFakeWorkers())
    with pytest.raises(Exception):
        await orch.resume(new_id("gen"), task, RunMode())


# ---------------------------------------------------------------------------
# regen_shot: re-runs exactly the target shot chain + compose/qa/export
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_regen_shot_resets_exactly(services):
    task = make_task()
    gen_id = task.context["generationId"]

    # complete a full run first
    workers_a = FlakyFakeWorkers()
    first = await Orchestrator(services, workers_a).run(gen_id, task, RunMode())
    assert first.status == "completed"

    # regen shot 2 with a fresh worker so its call log is only the regen work
    workers_b = FlakyFakeWorkers()
    regened = await Orchestrator(services, workers_b).regen_shot(gen_id, 2, task, RunMode())

    assert regened.status == "completed"

    assert set(workers_b.calls) == {
        "keyframe2", "replace2", "video2", "compose", "qa", "export",
    }
    # chain ordering + tail after the regenerated shot
    assert _i(workers_b.calls, "keyframe2") < _i(workers_b.calls, "replace2") < _i(workers_b.calls, "video2")
    assert _i(workers_b.calls, "compose") > _i(workers_b.calls, "video2")
    assert _i(workers_b.calls, "qa") > _i(workers_b.calls, "compose")
    assert _i(workers_b.calls, "export") > _i(workers_b.calls, "qa")

    # nothing outside shot2 + tail was touched
    for forbidden in ("portrait", "voice",
                      "keyframe1", "replace1", "video1",
                      "keyframe3", "replace3", "video3"):
        assert forbidden not in workers_b.calls, forbidden


# ---------------------------------------------------------------------------
# concurrency: every step's artifacts survive the parallel gather (the lock)
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_concurrent_marks_not_lost(services):
    task = make_task()
    gen_id = task.context["generationId"]
    workers = FlakyFakeWorkers()  # distinct artifacts per step
    orch = Orchestrator(services, workers)

    state = await orch.run(gen_id, task, RunMode())
    assert state.status == "completed"

    # Re-load from Postgres: every step must be done and carry its OWN artifacts
    # (would fail if concurrent read-modify-write saves clobbered each other).
    loaded = await services.run_store.load(gen_id)
    assert loaded is not None
    for name in STEP_NAMES:
        step = loaded.steps[name]
        assert step.status == "done", name
        assert step.artifacts.get("uri") == _STEP_URI[name], name
        assert step.artifacts.get(f"art:{_worker_key(name)}") == _worker_key(name), name


def _worker_key(step_name: str) -> str:
    """Map a run_state step name to the FlakyFakeWorkers call key."""
    mapping = {
        "portrait": "portrait", "voice": "voice",
        "compose": "compose", "qa": "qa", "export": "export",
    }
    if step_name in mapping:
        return mapping[step_name]
    # shot{n}_{kind} -> {kind}{n}, with keyframe/replace/video naming
    shot = step_name[4]
    kind = step_name.split("_", 1)[1]
    return f"{kind}{shot}"


# ---------------------------------------------------------------------------
# RealWorkers, driven through the orchestrator in DRY mode: no adapter / R2 /
# money touched, but the real worker bodies run and a full 14-step dry-run
# e2e must complete (with the correct dry stub uris + Task 22-24 markers).
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_real_workers_dry_e2e(services):
    from creative_studio.generation.workers import RealWorkers

    spec, sheet, shot_spec, product = make_spec(), make_sheet(), make_shot_spec(), make_product()
    task = compile_generation_task(spec, sheet, shot_spec, product)
    gen_id = task.context["generationId"]
    orch = Orchestrator(services, RealWorkers(services, spec, sheet, shot_spec, product))

    state = await orch.run(gen_id, task, RunMode())  # dry: live_images=False, live_video=False

    assert state.status == "completed"
    for name in STEP_NAMES:
        assert state.steps[name].status == "done", name

    assert state.steps["portrait"].artifacts["uri"] == "dry-run:portrait"
    assert state.steps["shot1_keyframe"].artifacts["uri"] == "dry-run:keyframe1"
    # even the dry keyframe builds a real image prompt (pure, no I/O)
    assert state.steps["shot1_keyframe"].artifacts["promptText"]
    assert state.steps["shot2_replace"].artifacts["uri"] == "dry-run:replaced2"
    assert state.steps["shot3_video"].artifacts["uri"] == "dry-run:clip3"
    assert state.steps["voice"].artifacts["uri"] == "dry-run:voice"
    for name in ("compose", "qa", "export"):
        assert state.steps[name].artifacts["uri"] == f"dry-run:{name}"
        assert state.steps[name].artifacts["pending"] == "Task 22-24"
