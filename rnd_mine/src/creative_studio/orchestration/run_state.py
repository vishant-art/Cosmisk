# src/creative_studio/orchestration/run_state.py
"""Durable run state for the generation orchestrator (Task 20).

`RunState` tracks per-step progress (pending/running/done/failed/skipped) for a
single generation run through the fixed `STEP_NAMES` pipeline, and
`RunStateStore` persists/reloads it from the `generation_runs` table so a run
can be resumed or a single shot regenerated without redoing the whole pipeline.
"""
from __future__ import annotations
import json
import re
from typing import Literal
import asyncpg
from pydantic import Field
from creative_studio.contracts.base import CamelModel

_IDENTIFIER_RE = re.compile(r"^[a-z_][a-z0-9_]*$")

STEP_NAMES: tuple[str, ...] = (
    "portrait",
    "shot1_keyframe", "shot1_replace", "shot1_video",
    "shot2_keyframe", "shot2_replace", "shot2_video",
    "shot3_keyframe", "shot3_replace", "shot3_video",
    "voice", "compose", "qa", "export",
)

_SHOT_STEPS: dict[int, tuple[str, str, str]] = {
    1: ("shot1_keyframe", "shot1_replace", "shot1_video"),
    2: ("shot2_keyframe", "shot2_replace", "shot2_video"),
    3: ("shot3_keyframe", "shot3_replace", "shot3_video"),
}

class StepState(CamelModel):
    status: Literal["pending", "running", "done", "failed", "skipped"] = "pending"
    attempts: int = 0
    error: str | None = None
    artifacts: dict = Field(default_factory=dict)

class RunState(CamelModel):
    id: str
    creative_spec_id: str
    status: str = "pending"
    steps: dict[str, StepState]

    @classmethod
    def new(cls, generation_id: str, creative_spec_id: str) -> RunState:
        return cls(
            id=generation_id,
            creative_spec_id=creative_spec_id,
            status="pending",
            steps={name: StepState() for name in STEP_NAMES},
        )

def reset_shot(state: RunState, shot_number: int) -> RunState:
    """Reset one shot's 3 generation steps plus compose/qa/export back to
    pending, so the orchestrator will regenerate that shot and re-run everything
    downstream of it (a stale composited video/QA/export can't be trusted once
    one of its source shots changes). Mutates and returns `state`."""
    if shot_number not in _SHOT_STEPS:
        raise ValueError(f"invalid shot_number: {shot_number!r}; expected 1, 2, or 3")
    for name in (*_SHOT_STEPS[shot_number], "compose", "qa", "export"):
        state.steps[name] = StepState()
    state.status = "pending"
    return state

class RunStateStore:
    def __init__(self, pool: asyncpg.Pool, schema: str = "creative_studio"):
        if not _IDENTIFIER_RE.match(schema):
            raise ValueError(f"invalid schema name: {schema!r}")
        self.pool = pool
        self.schema = schema

    async def save(self, state: RunState) -> None:
        steps_json = json.dumps(
            {name: step.model_dump(mode="json", by_alias=True) for name, step in state.steps.items()}
        )
        await self.pool.execute(
            f"INSERT INTO {self.schema}.generation_runs (id, creative_spec_id, status, steps) "
            f"VALUES ($1, $2, $3, $4::jsonb) "
            f"ON CONFLICT (id) DO UPDATE SET "
            f"creative_spec_id = EXCLUDED.creative_spec_id, "
            f"status = EXCLUDED.status, "
            f"steps = EXCLUDED.steps, "
            f"updated_at = now()",
            state.id, state.creative_spec_id, state.status, steps_json,
        )

    async def load(self, generation_id: str) -> RunState | None:
        row = await self.pool.fetchrow(
            f"SELECT id, creative_spec_id, status, steps "
            f"FROM {self.schema}.generation_runs WHERE id = $1",
            generation_id,
        )
        if row is None:
            return None
        raw_steps = json.loads(row["steps"])
        steps = {name: StepState.model_validate(value) for name, value in raw_steps.items()}
        return RunState(
            id=row["id"],
            creative_spec_id=row["creative_spec_id"],
            status=row["status"],
            steps=steps,
        )

    async def mark(self, state: RunState, step: str, **updates) -> RunState:
        if step not in state.steps:
            raise ValueError(f"unknown step: {step!r}")
        state.steps[step] = state.steps[step].model_copy(update=updates)
        await self.save(state)
        return state
