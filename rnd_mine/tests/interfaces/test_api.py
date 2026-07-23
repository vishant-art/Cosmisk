# tests/interfaces/test_api.py
"""Task 26: FastAPI facade (`interfaces/api.py`).

Every test here is hermetic: NO network, NO real Postgres, NO real fal call.
`create_app(services_factory=...)` is handed a factory that returns fake
services (fake repos + fake run store), and `api.Orchestrator` is monkeypatched
to a `FakeOrchestrator` that records its `run(...)` call instead of spawning any
real work. The app is driven through `fastapi.testclient.TestClient`.

The `POST /generate` handler spawns the run with `asyncio.create_task` (fire
and forget) and returns 202 immediately, so the fake orchestrator's `run`
executes on the TestClient's background event loop AFTER the response returns.
Tests synchronize on a `threading.Event` (`FakeOrchestrator.started`) with a
short timeout rather than racing the loop.
"""
from __future__ import annotations

import threading
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient

from creative_studio.contracts import (
    AssetManifest,
    CharacterSheet,
    CreativeSpec,
    Product,
    Shot,
    ShotSpec,
    Timing,
    new_id,
)
from creative_studio.interfaces import api, cli
from creative_studio.orchestration.run_state import STEP_NAMES, RunState, StepState


# ---------------------------------------------------------------------------
# Fakes: repos, run store, orchestrator
# ---------------------------------------------------------------------------


class FakeDocRepo:
    def __init__(self, items=None) -> None:
        self._items: dict[str, object] = {obj.id: obj for obj in (items or [])}

    async def get(self, obj_id):
        return self._items.get(obj_id)

    async def list_ids(self, limit: int = 50):
        return list(self._items.keys())[:limit]

    async def insert(self, obj) -> None:
        self._items[obj.id] = obj

    async def upsert(self, obj) -> None:
        self._items[obj.id] = obj


@dataclass
class FakeRepos:
    brand_contexts: FakeDocRepo
    products: FakeDocRepo
    campaigns: FakeDocRepo
    creative_specs: FakeDocRepo
    character_sheets: FakeDocRepo
    shot_specs: FakeDocRepo
    asset_manifests: FakeDocRepo
    qa_reports: FakeDocRepo


def make_repos(**overrides) -> FakeRepos:
    defaults = dict(
        brand_contexts=FakeDocRepo(),
        products=FakeDocRepo(),
        campaigns=FakeDocRepo(),
        creative_specs=FakeDocRepo(),
        character_sheets=FakeDocRepo(),
        shot_specs=FakeDocRepo(),
        asset_manifests=FakeDocRepo(),
        qa_reports=FakeDocRepo(),
    )
    defaults.update(overrides)
    return FakeRepos(**defaults)


class FakeRunStore:
    def __init__(self, states=None) -> None:
        self._states: dict[str, RunState] = dict(states or {})

    async def load(self, generation_id: str):
        return self._states.get(generation_id)

    async def save(self, state: RunState) -> None:
        self._states[state.id] = state


def make_run_state(generation_id: str, creative_spec_id: str, status: str = "completed") -> RunState:
    state = RunState.new(generation_id, creative_spec_id)
    if status == "completed":
        for name in STEP_NAMES:
            state.steps[name] = StepState(status="done", attempts=1, artifacts={"uri": f"dry-run:{name}"})
    state.status = status
    return state


class FakeOrchestrator:
    """Records every `run(...)` invocation. `run` executes on the background
    event loop after the 202 returns, so tests wait on `started`."""

    calls: list[tuple] = []
    started = threading.Event()

    def __init__(self, services, workers) -> None:
        self.services = services
        self.workers = workers

    async def run(self, generation_id, task, mode):
        FakeOrchestrator.calls.append(("run", generation_id, mode.live_images, mode.live_video))
        FakeOrchestrator.started.set()
        return make_run_state(generation_id, task.creative_spec_id)


@pytest.fixture(autouse=True)
def _reset_fake_orchestrator():
    FakeOrchestrator.calls = []
    FakeOrchestrator.started = threading.Event()
    yield
    FakeOrchestrator.calls = []
    FakeOrchestrator.started = threading.Event()


# ---------------------------------------------------------------------------
# Planning-contract fixtures (minimal, contract-valid)
# ---------------------------------------------------------------------------


def make_product(product_id: str = "product_1") -> Product:
    return Product(
        id=product_id,
        shopify={},
        commercial={"title": "Test Blazer", "price": "199.00", "currency": "USD"},
        variants=[],
        collections=[],
        original_assets={"images": [{"r2Uri": "r2://bucket/products/product_1/original.jpg"}]},
        derived_assets={},
        placement_assets={},
        ai_metadata={},
        provider_metadata={},
    )


def make_spec(product_id: str = "product_1") -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        marketing_objective={"objective": "Conversions"},
        product={"productId": product_id},
        audience={},
        messaging={"cta": "Shop Now", "coreMessage": "Premium tailoring made effortless."},
        creative_direction={"style": "Luxury UGC"},
        platform={"platform": "Instagram"},
        voice_strategy={},
        constraints={},
        references={"productId": product_id},
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
        reference_assets={},
        conditioning={},
        references={},
    )


def _shot(n: int, purpose: str, dur: float, text: str) -> Shot:
    return Shot(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={}, camera={}, character={}, product={},
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


def make_manifest(spec_id: str, generation_id: str) -> AssetManifest:
    return AssetManifest(
        id=new_id("manifest"),
        creative_spec_id=spec_id,
        source="export",
        image_assets=[
            {"type": "keyframe", "shotNumber": n, "r2Uri": f"dry-run:replaced{n}"} for n in (1, 2, 3)
        ],
        video_assets=[
            {"type": "shot_clip", "shotNumber": n, "r2Uri": f"dry-run:clip{n}"} for n in (1, 2, 3)
        ],
        audio_assets=[{"type": "voiceover", "r2Uri": "dry-run:voice"}],
        deliverables={"primaryVideo": {"r2Uri": "dry-run:compose"}},
        references={"creativeSpecId": spec_id, "generationId": generation_id},
    )


def _planning_repos(spec, sheet, shot_spec, product) -> FakeRepos:
    return make_repos(
        creative_specs=FakeDocRepo([spec]),
        character_sheets=FakeDocRepo([sheet]),
        shot_specs=FakeDocRepo([shot_spec]),
        products=FakeDocRepo([product]),
    )


def build_app(monkeypatch, *, repos=None, run_store=None):
    repos = repos if repos is not None else make_repos()
    run_store = run_store if run_store is not None else FakeRunStore()

    async def factory():
        return cli.CLIServices(
            pool=None, repos=repos, r2=object(), adapter=object(),
            run_store=run_store, settings=object(),
        )

    monkeypatch.setattr(api, "Orchestrator", FakeOrchestrator)
    return api.create_app(services_factory=factory)


# ---------------------------------------------------------------------------
# POST /generate
# ---------------------------------------------------------------------------


def test_generate_dry_returns_202_and_spawns_run(monkeypatch):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()
    app = build_app(monkeypatch, repos=_planning_repos(spec, sheet, shot_spec, product))

    with TestClient(app) as client:
        resp = client.post("/generate", json={"creativeSpecId": spec.id})
        assert resp.status_code == 202
        run_id = resp.json()["runId"]
        assert run_id.startswith("generation_")

        assert FakeOrchestrator.started.wait(2.0), "orchestrator.run never executed"

    assert len(FakeOrchestrator.calls) == 1
    kind, generation_id, live_images, live_video = FakeOrchestrator.calls[0]
    assert kind == "run"
    assert generation_id == run_id
    assert live_images is False and live_video is False


def test_generate_live_without_confirm_header_402(monkeypatch):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()
    app = build_app(monkeypatch, repos=_planning_repos(spec, sheet, shot_spec, product))

    with TestClient(app) as client:
        resp = client.post("/generate", json={"creativeSpecId": spec.id, "liveImages": True})

    assert resp.status_code == 402
    assert "X-Confirm-Spend" in resp.json()["detail"]
    # never spawned
    assert not FakeOrchestrator.started.wait(0.3)
    assert FakeOrchestrator.calls == []


def test_generate_live_with_confirm_header_202(monkeypatch):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()
    app = build_app(monkeypatch, repos=_planning_repos(spec, sheet, shot_spec, product))

    with TestClient(app) as client:
        resp = client.post(
            "/generate",
            json={"creativeSpecId": spec.id, "liveVideo": True},
            headers={"X-Confirm-Spend": "yes"},
        )
        assert resp.status_code == 202
        assert FakeOrchestrator.started.wait(2.0)

    assert len(FakeOrchestrator.calls) == 1
    _, _, live_images, live_video = FakeOrchestrator.calls[0]
    assert live_images is False and live_video is True


def test_generate_live_without_ffmpeg_400(monkeypatch):
    """Final-review Fix 5: a live flag must also require ffmpeg/ffprobe on
    PATH, checked (like the spend gate) BEFORE lineage resolution or
    spawning -- `shutil.which` monkeypatched to report neither binary
    present."""
    from creative_studio import config as config_module

    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()
    app = build_app(monkeypatch, repos=_planning_repos(spec, sheet, shot_spec, product))
    monkeypatch.setattr(config_module.shutil, "which", lambda exe: None)

    with TestClient(app) as client:
        resp = client.post(
            "/generate",
            json={"creativeSpecId": spec.id, "liveVideo": True},
            headers={"X-Confirm-Spend": "yes"},
        )

    assert resp.status_code == 400
    assert "ffmpeg" in resp.json()["detail"]
    # never spawned
    assert not FakeOrchestrator.started.wait(0.3)
    assert FakeOrchestrator.calls == []


def test_generate_dry_unaffected_by_missing_ffmpeg(monkeypatch):
    """A dry request never touches `require_ffmpeg()` at all -- missing
    ffmpeg must not block it."""
    from creative_studio import config as config_module

    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()
    app = build_app(monkeypatch, repos=_planning_repos(spec, sheet, shot_spec, product))
    monkeypatch.setattr(config_module.shutil, "which", lambda exe: None)

    with TestClient(app) as client:
        resp = client.post("/generate", json={"creativeSpecId": spec.id})
        assert resp.status_code == 202
        assert FakeOrchestrator.started.wait(2.0), "orchestrator.run never executed"


def test_generate_unknown_spec_404(monkeypatch):
    app = build_app(monkeypatch, repos=make_repos())
    with TestClient(app) as client:
        resp = client.post("/generate", json={"creativeSpecId": "no-such-spec"})
    assert resp.status_code == 404
    assert "no-such-spec" in resp.json()["detail"]
    assert FakeOrchestrator.calls == []


def test_generate_missing_sheet_404(monkeypatch):
    # spec exists but no character sheet -> lineage cannot resolve -> 404
    spec = make_spec()
    product = make_product()
    repos = make_repos(creative_specs=FakeDocRepo([spec]), products=FakeDocRepo([product]))
    app = build_app(monkeypatch, repos=repos)
    with TestClient(app) as client:
        resp = client.post("/generate", json={"creativeSpecId": spec.id})
    assert resp.status_code == 404
    assert FakeOrchestrator.calls == []


# ---------------------------------------------------------------------------
# GET /runs/{run_id}
# ---------------------------------------------------------------------------


def test_get_run_returns_camelcase_state(monkeypatch):
    state = make_run_state("generation_abc", "creative_xyz", status="completed")
    run_store = FakeRunStore({"generation_abc": state})
    app = build_app(monkeypatch, run_store=run_store)

    with TestClient(app) as client:
        resp = client.get("/runs/generation_abc")

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "generation_abc"
    assert body["creativeSpecId"] == "creative_xyz"  # camelCase alias
    assert body["status"] == "completed"
    assert set(body["steps"].keys()) == set(STEP_NAMES)
    assert body["steps"]["portrait"]["status"] == "done"


def test_get_run_404(monkeypatch):
    app = build_app(monkeypatch, run_store=FakeRunStore())
    with TestClient(app) as client:
        resp = client.get("/runs/does-not-exist")
    assert resp.status_code == 404
    assert "does-not-exist" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# GET /runs/{run_id}/manifest
# ---------------------------------------------------------------------------


def test_get_manifest_returns_doc(monkeypatch):
    spec_id = "creative_xyz"
    run_id = "generation_abc"
    manifest = make_manifest(spec_id, run_id)
    # add a decoy manifest for a different run to prove the scan filters by run
    decoy = make_manifest("creative_other", "generation_other")
    repos = make_repos(asset_manifests=FakeDocRepo([decoy, manifest]))
    app = build_app(monkeypatch, repos=repos)

    with TestClient(app) as client:
        resp = client.get(f"/runs/{run_id}/manifest")

    assert resp.status_code == 200
    body = resp.json()
    assert body["creativeSpecId"] == spec_id
    assert body["references"]["generationId"] == run_id
    assert body["id"] == manifest.id


def test_get_manifest_404(monkeypatch):
    decoy = make_manifest("creative_other", "generation_other")
    repos = make_repos(asset_manifests=FakeDocRepo([decoy]))
    app = build_app(monkeypatch, repos=repos)
    with TestClient(app) as client:
        resp = client.get("/runs/generation_missing/manifest")
    assert resp.status_code == 404
