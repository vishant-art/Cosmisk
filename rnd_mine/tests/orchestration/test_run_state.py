from __future__ import annotations
import os
import pytest
from creative_studio.config import get_settings
from creative_studio.contracts.base import new_id
from creative_studio.orchestration.run_state import (
    STEP_NAMES, StepState, RunState, RunStateStore, reset_shot,
)

def _resolve_migration_dsn() -> str:
    try:
        return get_settings().migration_database_url
    except Exception:
        return os.environ.get("MIGRATION_DATABASE_URL", "")

pytestmark = pytest.mark.skipif(
    not _resolve_migration_dsn(),
    reason="MIGRATION_DATABASE_URL not set; skipping live Postgres run-state tests",
)
asyncio_session = pytest.mark.asyncio(loop_scope="session")

DONE_STEPS = (
    "shot1_keyframe", "shot1_replace", "shot1_video",
    "shot3_keyframe", "shot3_replace", "shot3_video",
    "compose", "qa", "export",
)
SHOT2_STEPS = ("shot2_keyframe", "shot2_replace", "shot2_video")

@pytest.fixture(scope="session")
def store(repo_pool):
    pool, schema = repo_pool
    return RunStateStore(pool, schema)

def make_state(**over) -> RunState:
    d = dict(generation_id=new_id("gen"), creative_spec_id=new_id("creative"))
    d.update(over)
    return RunState.new(d["generation_id"], d["creative_spec_id"])

def test_new_state_all_pending():
    state = make_state()
    assert set(state.steps) == set(STEP_NAMES)
    assert len(state.steps) == 14
    assert state.status == "pending"
    for name in STEP_NAMES:
        step = state.steps[name]
        assert step.status == "pending"
        assert step.attempts == 0
        assert step.error is None
        assert step.artifacts == {}

@asyncio_session
async def test_save_load_round_trip(store):
    state = make_state()
    await store.save(state)

    loaded = await store.load(state.id)

    assert loaded is not None
    assert loaded.id == state.id
    assert loaded.creative_spec_id == state.creative_spec_id
    assert loaded.status == state.status
    assert loaded.steps == state.steps

@asyncio_session
async def test_mark_persists(store):
    state = make_state()
    await store.save(state)

    updated = await store.mark(state, "shot2_video", status="failed", attempts=2, error="boom")
    assert updated.steps["shot2_video"].status == "failed"
    assert updated.steps["shot2_video"].attempts == 2
    assert updated.steps["shot2_video"].error == "boom"

    reloaded = await store.load(state.id)
    marked = reloaded.steps["shot2_video"]
    assert marked.status == "failed"
    assert marked.attempts == 2
    assert marked.error == "boom"

    for name in STEP_NAMES:
        if name == "shot2_video":
            continue
        untouched = reloaded.steps[name]
        assert untouched.status == "pending"
        assert untouched.attempts == 0
        assert untouched.error is None
        assert untouched.artifacts == {}

def test_reset_shot_resets_exactly_six():
    state = make_state()
    for name in DONE_STEPS:
        state.steps[name] = StepState(status="done", attempts=1, artifacts={"uri": f"r2://{name}"})
    for name in SHOT2_STEPS:
        state.steps[name] = StepState(status="failed", attempts=3, error="boom")
    state.status = "failed"

    result = reset_shot(state, 2)

    assert result is state
    assert result.status == "pending"
    for name in (*SHOT2_STEPS, "compose", "qa", "export"):
        step = result.steps[name]
        assert step.status == "pending"
        assert step.attempts == 0
        assert step.error is None
        assert step.artifacts == {}

    for name in ("shot1_keyframe", "shot1_replace", "shot1_video",
                 "shot3_keyframe", "shot3_replace", "shot3_video"):
        assert result.steps[name].status == "done"

    assert result.steps["portrait"].status == "pending"
    assert result.steps["voice"].status == "pending"

@asyncio_session
async def test_mark_unknown_step_raises(store):
    state = make_state()
    with pytest.raises(ValueError):
        await store.mark(state, "not_a_real_step", status="done")

@pytest.mark.parametrize("bad_shot", [0, 4, -1, 99])
def test_reset_bad_shot_raises(bad_shot):
    state = make_state()
    with pytest.raises(ValueError):
        reset_shot(state, bad_shot)
