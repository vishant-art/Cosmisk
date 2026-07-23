# tests/orchestration/test_orchestrator_hardening.py
"""Task 26 pre-live orchestrator hardening (closes Task 20's three review gaps).

Runs the REAL `RunStateStore` against the throwaway test schema (session-scoped
`repo_pool`, DB-safe: only `creative_studio_test_*` schemas), with fake workers
so NO paid provider call ever happens.

Gap 1 -- Portrait gate: in `live_images` mode a failed portrait must SKIP the
         three keyframe->replace->video chains (and the voice track) rather than
         spend on keyframes with no portrait to reference. Run fails; shot/voice
         steps stay pending.
Gap 2 -- Gather escape: an exception escaping the concurrent generation stage
         (e.g. a run_store save failure, which `_step` does NOT catch) must
         cancel the sibling chains, await their cancellation, persist a terminal
         "failed" status, and re-raise -- no leaked coroutines, no run left
         stuck "running".
Gap 3 -- Same-id guard: `run()` on a generation whose persisted status is
         "running" must raise a clear RuntimeError pointing at resume; `resume()`
         on the same state is the sanctioned path and proceeds.
"""
from __future__ import annotations

import asyncio
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
from creative_studio.orchestration.run_state import STEP_NAMES, RunState, RunStateStore
from creative_studio.storage.repositories import make_repositories


# ---------------------------------------------------------------------------
# DB / event-loop gating (mirror tests/orchestration/test_orchestrator.py)
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
def services(repo_pool, store, fake_r2) -> Services:
    pool, schema = repo_pool
    return Services(
        adapter=None, r2=fake_r2, repos=make_repositories(pool, schema),
        run_store=store, settings=None,
    )


# ---------------------------------------------------------------------------
# Minimal, contract-valid planning fixtures.
# ---------------------------------------------------------------------------

def make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        marketing_objective={"objective": "Conversions"},
        product={"productId": "product_1"},
        audience={},
        messaging={"cta": "Shop Now", "coreMessage": "Premium tailoring made effortless."},
        creative_direction={"style": "Luxury UGC"},
        platform={"platform": "Instagram"},
        voice_strategy={},
        constraints={},
        references={"productId": "product_1"},
    )


def make_sheet(spec_id: str) -> CharacterSheet:
    return CharacterSheet(
        id=new_id("character"),
        creative_spec_id=spec_id,
        identity={"gender": "Female", "approximateAge": 27},
        appearance={"hair": {"color": "Dark Brown"}},
        wardrobe={},
        personality={"tone": "Warm"},
        expressions={},
        speaking_style={"pace": "Measured"},
        reference_assets={"primaryPortrait": {"r2Uri": "r2://bucket/runs/gen/portraits/primary.png"}},
        conditioning={},
        references={},
    )


def make_product() -> Product:
    return Product(
        id="product_1",
        shopify={"vendor": "Meridian & Co"},
        commercial={"title": "Aria Signature Tailoring", "price": "249.00", "currency": "USD"},
        variants=[],
        collections=[],
        original_assets={"images": [{"r2Uri": "r2://bucket/products/product_1/original.jpg"}]},
        derived_assets={"transparentCutout": "r2://bucket/products/product_1/cutouts/cutout.png"},
        placement_assets={},
        ai_metadata={"category": "Blazer"},
        provider_metadata={},
    )


def _shot(n: int, purpose: str, dur: float, text: str) -> Shot:
    return Shot(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={}, camera={"movement": "Handheld"},
        character={}, product={"visibility": "High", "replacementRequired": True},
        dialogue={"spokenText": text},
    )


def make_shot_spec(spec_id: str, character_id: str) -> ShotSpec:
    return ShotSpec(
        id=new_id("shotspec"),
        creative_spec_id=spec_id,
        character_id=character_id,
        story_structure={},
        timing=Timing(total_duration=10, shot_durations=[3, 4, 3]),
        global_style={},
        shots=[
            _shot(1, "Hook", 3, "Look at this."),
            _shot(2, "Product", 4, "Feel the quality."),
            _shot(3, "CTA", 3, "Get yours today."),
        ],
        transition_rules={},
        rendering_rules={},
        references={},
    )


def make_task():
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()
    return compile_generation_task(spec, sheet, shot_spec, product)


# ---------------------------------------------------------------------------
# Fake workers.
# ---------------------------------------------------------------------------


class GateWorkers:
    """Dry-stub workers that count generation-stage calls and can be programmed
    to fail the portrait step."""

    def __init__(self, fail_portrait: bool = False) -> None:
        self.fail_portrait = fail_portrait
        self.portrait_calls = 0
        self.keyframe_calls = 0
        self.replace_calls = 0
        self.video_calls = 0
        self.voice_calls = 0

    async def portrait(self, task, mode) -> dict:
        self.portrait_calls += 1
        if self.fail_portrait:
            raise RuntimeError("programmed portrait failure")
        return {"uri": "dry-run:portrait"}

    async def keyframe(self, task, n, mode) -> dict:
        self.keyframe_calls += 1
        return {"uri": f"dry-run:keyframe{n}"}

    async def replace(self, task, n, artifacts, mode) -> dict:
        self.replace_calls += 1
        return {"uri": f"dry-run:replaced{n}"}

    async def video(self, task, n, artifacts, mode) -> dict:
        self.video_calls += 1
        return {"uri": f"dry-run:clip{n}"}

    async def voice(self, task, mode) -> dict:
        self.voice_calls += 1
        return {"uri": "dry-run:voice"}

    async def compose(self, task, artifacts, mode) -> dict:
        return {"uri": "dry-run:compose"}

    async def qa(self, task, artifacts, mode) -> dict:
        return {"uri": "dry-run:qa"}

    async def export(self, task, artifacts, mode) -> dict:
        return {"uri": "dry-run:export"}


class SlowWorkers(GateWorkers):
    """Generation-stage workers that yield mid-flight, so that when one chain's
    persistence raises, the sibling chains are genuinely suspended and their
    cancellation is observable."""

    async def keyframe(self, task, n, mode) -> dict:
        self.keyframe_calls += 1
        await asyncio.sleep(0.05)
        return {"uri": f"dry-run:keyframe{n}"}

    async def video(self, task, n, artifacts, mode) -> dict:
        self.video_calls += 1
        await asyncio.sleep(0.05)
        return {"uri": f"dry-run:clip{n}"}

    async def voice(self, task, mode) -> dict:
        self.voice_calls += 1
        await asyncio.sleep(0.05)
        return {"uri": "dry-run:voice"}


# ---------------------------------------------------------------------------
# Gap 1: portrait gate
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_portrait_failure_skips_shot_chains(services):
    task = make_task()
    gen_id = task.context["generationId"]
    workers = GateWorkers(fail_portrait=True)
    orch = Orchestrator(services, workers)

    state = await orch.run(gen_id, task, RunMode(live_images=True, live_video=False))

    # run failed on the portrait step
    assert state.status == "failed"
    assert state.steps["portrait"].status == "failed"
    assert workers.portrait_calls == 3  # retryLimit 2 -> 3 attempts

    # NONE of the keyframe/replace/video workers were ever called: no spend on
    # keyframes that have no portrait to reference.
    assert workers.keyframe_calls == 0
    assert workers.replace_calls == 0
    assert workers.video_calls == 0
    # voice is skipped too (the whole generation stage is gated off).
    assert workers.voice_calls == 0

    # every shot + voice step left pending (resumable once portrait succeeds).
    for n in (1, 2, 3):
        assert state.steps[f"shot{n}_keyframe"].status == "pending"
        assert state.steps[f"shot{n}_replace"].status == "pending"
        assert state.steps[f"shot{n}_video"].status == "pending"
    assert state.steps["voice"].status == "pending"
    for name in ("compose", "qa", "export"):
        assert state.steps[name].status == "pending"

    # persisted state matches
    loaded = await services.run_store.load(gen_id)
    assert loaded.status == "failed"
    assert loaded.steps["portrait"].status == "failed"


@skip_no_db
@asyncio_session
async def test_dry_portrait_never_gates(services):
    """A dry run's portrait can't fail, so the gate never triggers and the full
    pipeline still completes (regression guard for the gate change)."""
    task = make_task()
    gen_id = task.context["generationId"]
    workers = GateWorkers(fail_portrait=False)
    orch = Orchestrator(services, workers)

    state = await orch.run(gen_id, task, RunMode())

    assert state.status == "completed"
    assert workers.keyframe_calls == 3
    assert workers.voice_calls == 1
    for name in STEP_NAMES:
        assert state.steps[name].status == "done", name


# ---------------------------------------------------------------------------
# Gap 2: gather escape -> cancel siblings, persist failed, re-raise
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_gather_escape_cancels_and_persists_failed(services, store, monkeypatch):
    task = make_task()
    gen_id = task.context["generationId"]
    workers = SlowWorkers()
    orch = Orchestrator(services, workers)

    # Make the store's save raise exactly ONCE, mid-chains (portrait already
    # done, a shot keyframe just entered "running"). `_step` does not catch a
    # persistence failure, so it escapes its chain into the concurrent stage.
    original_save = store.save
    flag = {"raised": False}

    async def flaky_save(state):
        steps = state.steps
        if (not flag["raised"]
                and steps["portrait"].status == "done"
                and any(steps[f"shot{n}_keyframe"].status == "running" for n in (1, 2, 3))):
            flag["raised"] = True
            raise RuntimeError("boom: run_store save failed mid-chains")
        return await original_save(state)

    monkeypatch.setattr(store, "save", flaky_save)

    tasks_before = {t for t in asyncio.all_tasks()}

    with pytest.raises(RuntimeError, match="boom"):
        await orch.run(gen_id, task, RunMode())

    assert flag["raised"], "the flaky save never fired; the test did not exercise the escape path"

    # No leaked generation-stage coroutines: every task the run created is done.
    await asyncio.sleep(0)
    leaked = [t for t in asyncio.all_tasks() if t not in tasks_before and not t.done()]
    assert leaked == [], f"leaked tasks: {leaked}"

    # A terminal failed status was persisted despite the escape (via the restored
    # save on the same store -- the one-shot failure already fired).
    loaded = await store.load(gen_id)
    assert loaded is not None
    assert loaded.status == "failed"


# ---------------------------------------------------------------------------
# Gap 3: same-id concurrency guard
# ---------------------------------------------------------------------------

@skip_no_db
@asyncio_session
async def test_run_refuses_when_already_running(services, store):
    task = make_task()
    gen_id = task.context["generationId"]

    # Persist a run already marked "running" (a live run in progress, or a
    # crashed run that never reached a terminal status).
    running = RunState.new(gen_id, task.creative_spec_id)
    running.status = "running"
    await store.save(running)

    orch = Orchestrator(services, GateWorkers())

    # run() must refuse and point at resume.
    with pytest.raises(RuntimeError, match="resume"):
        await orch.run(gen_id, task, RunMode())

    # resume() is the sanctioned path and drives it to completion.
    resumed = await orch.resume(gen_id, task, RunMode())
    assert resumed.status == "completed"
    for name in STEP_NAMES:
        assert resumed.steps[name].status == "done", name
