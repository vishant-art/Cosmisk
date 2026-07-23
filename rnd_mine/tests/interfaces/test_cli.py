# tests/interfaces/test_cli.py
"""Task 25: CLI with spend gates.

Every test here is hermetic: NO network, NO real Postgres, NO real fal call,
NO real migration run. `_build_services` is monkeypatched to return fakes;
`Orchestrator`, `run_migrations`, `read_balance`, `input`, and `require_ffmpeg`
are monkeypatched per-test as needed. The `plan` command's live LLM path is
exercised for real only in Task 26 (per the task-25 brief) -- it is never
called here.
"""
from __future__ import annotations

from dataclasses import dataclass

import pytest

from creative_studio.contracts import (
    Campaign,
    CharacterSheet,
    CreativeSpec,
    Product,
    Shot,
    ShotSpec,
    Timing,
    new_id,
)
from creative_studio.interfaces import cli
from creative_studio.orchestration.run_state import STEP_NAMES, RunState, StepState

# ---------------------------------------------------------------------------
# Fakes: settings, repos, run store
# ---------------------------------------------------------------------------


class FakeSettings:
    def __init__(
        self,
        migration_database_url: str = "postgres://fake-migration-dsn",
        database_url: str = "postgres://fake-pooler-dsn",
        fal_admin_key: str = "fake-admin-key",
    ) -> None:
        self.migration_database_url = migration_database_url
        self.database_url = database_url
        self.fal_admin_key = fal_admin_key


class FakeDocRepo:
    """Duck-typed stand-in for `DocRepository`/`MutableDocRepository`."""

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


def make_empty_repos(**overrides) -> FakeRepos:
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

    async def mark(self, state: RunState, step: str, **updates):
        state.steps[step] = state.steps[step].model_copy(update=updates)
        await self.save(state)
        return state


def make_services_factory(monkeypatch, *, repos, run_store, settings=None):
    settings = settings or FakeSettings()

    async def _factory():
        return cli.CLIServices(
            pool=None, repos=repos, r2=object(), adapter=object(),
            run_store=run_store, settings=settings,
        )

    monkeypatch.setattr(cli, "_build_services", _factory)
    return _factory


# ---------------------------------------------------------------------------
# Planning-contract fixtures (a minimal, coherent, contract-valid set)
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


def make_campaign(source: str, product_ids: list[str]) -> Campaign:
    return Campaign(
        id=new_id("campaign"),
        source=source,
        campaign_info={"campaignName": f"{source} campaign", "objective": "Conversions"},
        platforms={source: True},
        products=list(product_ids),
        audience={},
        creative_summary={},
        performance={},
        learnings={},
    )


def make_run_state(generation_id: str, creative_spec_id: str, status: str = "completed") -> RunState:
    state = RunState.new(generation_id, creative_spec_id)
    if status == "completed":
        for name in STEP_NAMES:
            state.steps[name] = StepState(status="done", attempts=1, artifacts={"uri": f"dry-run:{name}"})
    state.status = status
    return state


def make_mixed_run_state(generation_id: str, creative_spec_id: str) -> RunState:
    state = RunState.new(generation_id, creative_spec_id)
    state.steps["portrait"] = StepState(status="done", attempts=1, artifacts={"uri": "dry-run:portrait"})
    state.steps["shot1_keyframe"] = StepState(status="failed", attempts=3, error="programmed failure: boom")
    state.steps["shot2_keyframe"] = StepState(status="running", attempts=1)
    state.status = "failed"
    return state


class FakeOrchestrator:
    """Records every `run`/`resume`/`regen_shot` invocation."""

    calls: list[tuple] = []

    def __init__(self, services, workers) -> None:
        self.services = services
        self.workers = workers

    async def run(self, generation_id, task, mode):
        FakeOrchestrator.calls.append(("run", generation_id, mode))
        return make_run_state(generation_id, task.creative_spec_id, status="completed")

    async def resume(self, generation_id, task, mode):
        FakeOrchestrator.calls.append(("resume", generation_id, mode))
        return make_run_state(generation_id, task.creative_spec_id, status="completed")

    async def regen_shot(self, generation_id, shot_number, task, mode):
        FakeOrchestrator.calls.append(("regen_shot", generation_id, shot_number, mode))
        return make_run_state(generation_id, task.creative_spec_id, status="completed")


@pytest.fixture(autouse=True)
def _reset_fake_orchestrator_calls():
    FakeOrchestrator.calls = []
    yield
    FakeOrchestrator.calls = []


def _planning_repos(spec, sheet, shot_spec, product) -> FakeRepos:
    return make_empty_repos(
        creative_specs=FakeDocRepo([spec]),
        character_sheets=FakeDocRepo([sheet]),
        shot_specs=FakeDocRepo([shot_spec]),
        products=FakeDocRepo([product]),
    )


# ---------------------------------------------------------------------------
# test_parser_routes_all_subcommands
# ---------------------------------------------------------------------------


def test_parser_routes_all_subcommands():
    parser = cli.build_parser()
    expectations = [
        (["migrate"], cli.cmd_migrate),
        (["sync-shopify"], cli.cmd_sync_shopify),
        (["seed-fixtures"], cli.cmd_seed_fixtures),
        (["plan", "--product", "p1", "--preference", "make it pop"], cli.cmd_plan),
        (["generate", "--spec", "spec1"], cli.cmd_generate),
        (["resume", "--run", "run1"], cli.cmd_resume),
        (["regen", "--run", "run1", "--shot", "2"], cli.cmd_regen),
        (["status", "--run", "run1"], cli.cmd_status),
    ]
    for argv, handler in expectations:
        args = parser.parse_args(argv)
        assert args.func is handler, argv


# ---------------------------------------------------------------------------
# test_migrate_calls_runner_with_migration_url
# ---------------------------------------------------------------------------


def test_migrate_calls_runner_with_migration_url(monkeypatch, capsys):
    recorded = {}

    def fake_run_migrations(dsn, schema="creative_studio"):
        recorded["dsn"] = dsn
        recorded["schema"] = schema
        return [1, 2, 3]

    fake_settings = FakeSettings(
        migration_database_url="postgres://THE-MIGRATION-URL",
        database_url="postgres://the-pooler-url",
    )
    monkeypatch.setattr(cli, "get_settings", lambda: fake_settings)
    monkeypatch.setattr(cli, "run_migrations", fake_run_migrations)

    with pytest.raises(SystemExit) as exc:
        cli.main(["migrate"])

    assert exc.value.code == 0
    assert recorded["dsn"] == "postgres://THE-MIGRATION-URL"
    assert recorded["dsn"] != fake_settings.database_url
    out = capsys.readouterr().out
    assert "1" in out and "2" in out and "3" in out


def test_migrate_prints_up_to_date_when_nothing_applied(monkeypatch, capsys):
    fake_settings = FakeSettings()
    monkeypatch.setattr(cli, "get_settings", lambda: fake_settings)
    monkeypatch.setattr(cli, "run_migrations", lambda dsn, schema="creative_studio": [])

    with pytest.raises(SystemExit) as exc:
        cli.main(["migrate"])

    assert exc.value.code == 0
    assert "up to date" in capsys.readouterr().out


def test_migrate_real_wrapper_survives_event_loop(monkeypatch, capsys):
    """Regression for the CRITICAL finding: `main()` drives every handler via
    `asyncio.run(...)`, and the REAL `run_migrations` (never monkeypatched
    here) itself calls `asyncio.run(...)` internally. Pre-fix, `cmd_migrate`
    called `run_migrations` directly from inside that running loop and blew
    up with `RuntimeError: asyncio.run() cannot be called from a running
    event loop`. Post-fix, `cmd_migrate` runs it via `asyncio.to_thread`,
    which gives the sync wrapper a fresh thread with no running loop, so this
    passes. Only the innermost async implementation is faked (to avoid a
    real Postgres connection); the sync wrapper executes for real."""
    from creative_studio.storage import migrations_runner

    async def fake_run_migrations_async(dsn, schema="creative_studio"):
        return [1]

    monkeypatch.setattr(migrations_runner, "_run_migrations_async", fake_run_migrations_async)

    fake_settings = FakeSettings(migration_database_url="postgres://fake-migration-dsn")
    monkeypatch.setattr(cli, "get_settings", lambda: fake_settings)
    # Deliberately NOT monkeypatching cli.run_migrations -- the real sync
    # wrapper must execute for this regression test to mean anything.

    with pytest.raises(SystemExit) as exc:
        cli.main(["migrate"])

    assert exc.value.code == 0
    assert "1" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# sync-shopify: the --live-images gate runs BEFORE any fetch/upsert/mirror
# work, so a decline aborts the whole command with zero side effects.
# ---------------------------------------------------------------------------


def test_sync_live_images_decline_aborts_everything(monkeypatch, capsys):
    class FakeShopifyClient:
        calls: list[str] = []

        def __init__(self, settings) -> None:
            FakeShopifyClient.calls.append("init")

        async def fetch_shop(self):
            FakeShopifyClient.calls.append("fetch_shop")
            return {}

        async def fetch_products(self, limit):
            FakeShopifyClient.calls.append("fetch_products")
            return []

    prepare_calls: list[str] = []

    async def fake_prepare(adapter, r2, product, brand_id):
        prepare_calls.append(product.id)
        return product

    repos = make_empty_repos()
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "ShopifyClient", FakeShopifyClient)
    monkeypatch.setattr(cli, "prepare_product_assets", fake_prepare)
    monkeypatch.setattr(cli, "read_balance", lambda settings: None)
    monkeypatch.setattr(cli, "input", lambda prompt="": "n")

    with pytest.raises(SystemExit) as exc:
        cli.main(["sync-shopify", "--live-images"])

    assert exc.value.code == 1
    assert FakeShopifyClient.calls == []
    assert prepare_calls == []
    assert repos.brand_contexts._items == {}
    assert repos.products._items == {}
    assert "aborted" in capsys.readouterr().out


def test_sync_live_images_yes_runs_prepare(monkeypatch, capsys):
    from creative_studio.contracts import BrandContext

    raw_products = [{"id": "raw1"}, {"id": "raw2"}]
    products_by_raw_id = {"raw1": make_product("product_1"), "raw2": make_product("product_2")}

    class FakeShopifyClient:
        def __init__(self, settings) -> None:
            pass

        async def fetch_shop(self):
            return {"name": "Test Shop", "url": "https://test.myshopify.com", "currencyCode": "USD"}

        async def fetch_products(self, limit):
            return raw_products

    def fake_normalize_product(raw):
        return products_by_raw_id[raw["id"]]

    async def fake_mirror(product, r2, brand_id):
        return product

    prepare_calls: list[str] = []

    async def fake_prepare(adapter, r2, product, brand_id):
        prepare_calls.append(product.id)
        return product.model_copy(update={"derived_assets": {"transparentCutout": "r2://fake/cutout.png"}})

    brand = BrandContext(
        id=new_id("brand"),
        business={"brandName": "Test Brand", "industry": "Fashion & Apparel"},
        branding={}, audience={}, creative_guidelines={}, user_preferences={},
        platform_connections={"shopify": {"connected": True}},
    )

    repos = make_empty_repos()
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "ShopifyClient", FakeShopifyClient)
    monkeypatch.setattr(cli, "normalize_product", fake_normalize_product)
    monkeypatch.setattr(cli, "mirror_product_assets", fake_mirror)
    monkeypatch.setattr(cli, "prepare_product_assets", fake_prepare)
    monkeypatch.setattr(cli, "load_brand_profile", lambda: {})
    monkeypatch.setattr(cli, "build_brand_context", lambda shop_meta, profile, connections: brand)
    monkeypatch.setattr(cli, "read_balance", lambda settings: 10.0)

    def _boom(prompt: str = "") -> str:
        raise AssertionError("input() must not be called when --yes is passed")

    monkeypatch.setattr(cli, "input", _boom)

    with pytest.raises(SystemExit) as exc:
        cli.main(["sync-shopify", "--live-images", "--yes"])

    assert exc.value.code == 0
    assert prepare_calls == ["product_1", "product_2"]
    assert len(repos.products._items) == 2
    out = capsys.readouterr().out
    assert "yes" in out


def test_sync_dry_never_prompts(monkeypatch, capsys):
    from creative_studio.contracts import BrandContext

    raw_products = [{"id": "raw1"}]
    product = make_product("product_1")

    class FakeShopifyClient:
        def __init__(self, settings) -> None:
            pass

        async def fetch_shop(self):
            return {"name": "Test Shop", "url": "https://test.myshopify.com", "currencyCode": "USD"}

        async def fetch_products(self, limit):
            return raw_products

    async def fake_mirror(product_, r2, brand_id):
        return product_

    prepare_calls: list[str] = []

    async def fake_prepare(adapter, r2, product_, brand_id):
        prepare_calls.append(product_.id)
        return product_

    brand = BrandContext(
        id=new_id("brand"),
        business={"brandName": "Test Brand", "industry": "Fashion & Apparel"},
        branding={}, audience={}, creative_guidelines={}, user_preferences={},
        platform_connections={"shopify": {"connected": True}},
    )

    repos = make_empty_repos()
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "ShopifyClient", FakeShopifyClient)
    monkeypatch.setattr(cli, "normalize_product", lambda raw: product)
    monkeypatch.setattr(cli, "mirror_product_assets", fake_mirror)
    monkeypatch.setattr(cli, "prepare_product_assets", fake_prepare)
    monkeypatch.setattr(cli, "load_brand_profile", lambda: {})
    monkeypatch.setattr(cli, "build_brand_context", lambda shop_meta, profile, connections: brand)

    def _boom(prompt: str = "") -> str:
        raise AssertionError("input() must not be called without --live-images")

    monkeypatch.setattr(cli, "input", _boom)

    with pytest.raises(SystemExit) as exc:
        cli.main(["sync-shopify"])

    assert exc.value.code == 0
    assert prepare_calls == []
    assert len(repos.products._items) == 1


# ---------------------------------------------------------------------------
# test_dry_generate_skips_prompt
# ---------------------------------------------------------------------------


def test_dry_generate_skips_prompt(monkeypatch, capsys):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()

    repos = _planning_repos(spec, sheet, shot_spec, product)
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "require_ffmpeg", lambda: None)
    monkeypatch.setattr(cli, "Orchestrator", FakeOrchestrator)

    def _boom(prompt: str = "") -> str:
        raise AssertionError("input() must not be called on a dry run")

    monkeypatch.setattr(cli, "input", _boom)

    with pytest.raises(SystemExit) as exc:
        cli.main(["generate", "--spec", spec.id])

    assert exc.value.code == 0
    assert len(FakeOrchestrator.calls) == 1
    mode = FakeOrchestrator.calls[0][2]
    assert mode.live_images is False
    assert mode.live_video is False

    out = capsys.readouterr().out
    assert "dry-run: no paid calls will be made" in out
    assert "status: completed" in out
    for name in STEP_NAMES:
        assert name in out


# ---------------------------------------------------------------------------
# test_live_gate_blocks_without_confirmation
# ---------------------------------------------------------------------------


def test_live_gate_blocks_without_confirmation(monkeypatch, capsys):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()

    repos = _planning_repos(spec, sheet, shot_spec, product)
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "require_ffmpeg", lambda: None)
    monkeypatch.setattr(cli, "Orchestrator", FakeOrchestrator)
    monkeypatch.setattr(cli, "read_balance", lambda settings: 42.5)
    monkeypatch.setattr(cli, "input", lambda prompt="": "n")

    with pytest.raises(SystemExit) as exc:
        cli.main(["generate", "--spec", spec.id, "--live-video"])

    assert exc.value.code == 1
    assert FakeOrchestrator.calls == []

    out = capsys.readouterr().out
    assert "$3.63" in out
    assert "balance" in out.lower()
    assert "42.5" in out


# ---------------------------------------------------------------------------
# test_live_gate_yes_flag_bypasses_prompt
# ---------------------------------------------------------------------------


def test_live_gate_yes_flag_bypasses_prompt(monkeypatch, capsys):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()

    repos = _planning_repos(spec, sheet, shot_spec, product)
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "require_ffmpeg", lambda: None)
    monkeypatch.setattr(cli, "Orchestrator", FakeOrchestrator)
    monkeypatch.setattr(cli, "read_balance", lambda settings: 10.0)

    def _boom(prompt: str = "") -> str:
        raise AssertionError("input() must not be called when --yes is passed")

    monkeypatch.setattr(cli, "input", _boom)

    with pytest.raises(SystemExit) as exc:
        cli.main(["generate", "--spec", spec.id, "--live-video", "--yes"])

    assert exc.value.code == 0
    assert len(FakeOrchestrator.calls) == 1
    mode = FakeOrchestrator.calls[0][2]
    assert mode.live_video is True


# ---------------------------------------------------------------------------
# test_status_table
# ---------------------------------------------------------------------------


def test_status_table(monkeypatch, capsys):
    state = make_mixed_run_state("gen_1", "creative_1")
    run_store = FakeRunStore({"gen_1": state})
    make_services_factory(monkeypatch, repos=make_empty_repos(), run_store=run_store)

    with pytest.raises(SystemExit) as exc:
        cli.main(["status", "--run", "gen_1"])

    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "portrait" in out
    assert "shot1_keyframe" in out
    assert "shot2_keyframe" in out
    assert "done" in out
    assert "failed" in out
    assert "running" in out


def test_status_unknown_run_errors(monkeypatch, capsys):
    make_services_factory(monkeypatch, repos=make_empty_repos(), run_store=FakeRunStore())

    with pytest.raises(SystemExit) as exc:
        cli.main(["status", "--run", "does-not-exist"])

    assert exc.value.code == 1
    assert "does-not-exist" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# test_generate_missing_sheet_errors_helpfully
# ---------------------------------------------------------------------------


def test_generate_missing_sheet_errors_helpfully(monkeypatch, capsys):
    spec = make_spec()
    product = make_product()
    repos = make_empty_repos(
        creative_specs=FakeDocRepo([spec]),
        products=FakeDocRepo([product]),
    )
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "require_ffmpeg", lambda: None)

    with pytest.raises(SystemExit) as exc:
        cli.main(["generate", "--spec", spec.id])

    assert exc.value.code == 1
    out = capsys.readouterr().out
    assert "plan" in out


def test_generate_unknown_spec_errors(monkeypatch, capsys):
    make_services_factory(monkeypatch, repos=make_empty_repos(), run_store=FakeRunStore())
    monkeypatch.setattr(cli, "require_ffmpeg", lambda: None)

    with pytest.raises(SystemExit) as exc:
        cli.main(["generate", "--spec", "no-such-spec"])

    assert exc.value.code == 1
    assert "no-such-spec" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# resume / regen: bound to the existing run id, not a fresh one
# ---------------------------------------------------------------------------


def test_resume_calls_orchestrator_resume_bound_to_run_id(monkeypatch, capsys):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()

    prior_state = make_run_state("existing_run_1", spec.id, status="failed")
    run_store = FakeRunStore({"existing_run_1": prior_state})
    repos = _planning_repos(spec, sheet, shot_spec, product)
    make_services_factory(monkeypatch, repos=repos, run_store=run_store)
    monkeypatch.setattr(cli, "require_ffmpeg", lambda: None)
    monkeypatch.setattr(cli, "Orchestrator", FakeOrchestrator)

    with pytest.raises(SystemExit) as exc:
        cli.main(["resume", "--run", "existing_run_1"])

    assert exc.value.code == 0
    assert len(FakeOrchestrator.calls) == 1
    kind, generation_id, mode = FakeOrchestrator.calls[0]
    assert kind == "resume"
    assert generation_id == "existing_run_1"


def test_regen_calls_orchestrator_regen_shot(monkeypatch, capsys):
    spec = make_spec()
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)
    product = make_product()

    prior_state = make_run_state("existing_run_2", spec.id, status="completed")
    run_store = FakeRunStore({"existing_run_2": prior_state})
    repos = _planning_repos(spec, sheet, shot_spec, product)
    make_services_factory(monkeypatch, repos=repos, run_store=run_store)
    monkeypatch.setattr(cli, "require_ffmpeg", lambda: None)
    monkeypatch.setattr(cli, "Orchestrator", FakeOrchestrator)

    with pytest.raises(SystemExit) as exc:
        cli.main(["regen", "--run", "existing_run_2", "--shot", "2", "--yes"])

    assert exc.value.code == 0
    assert len(FakeOrchestrator.calls) == 1
    kind, generation_id, shot_number, mode = FakeOrchestrator.calls[0]
    assert kind == "regen_shot"
    assert generation_id == "existing_run_2"
    assert shot_number == 2


def test_regen_shot_choice_rejected():
    with pytest.raises(SystemExit) as exc:
        cli.main(["regen", "--run", "x", "--shot", "4"])
    assert exc.value.code == 2


# ---------------------------------------------------------------------------
# seed-fixtures
# ---------------------------------------------------------------------------


def test_seed_fixtures_upserts_and_prints_count(monkeypatch, capsys):
    product = make_product()
    repos = make_empty_repos(products=FakeDocRepo([product]))
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())

    monkeypatch.setattr(cli.meta, "load_fixture", lambda: [{"raw": "meta1"}])
    monkeypatch.setattr(cli.google_ads, "load_fixture", lambda: [{"raw": "g1"}, {"raw": "g2"}])

    def fake_meta_normalize(raw, product_ids):
        assert product_ids == [product.id]
        return make_campaign("meta", product_ids)

    def fake_google_normalize(raw, product_ids):
        assert product_ids == [product.id]
        return make_campaign("google", product_ids)

    monkeypatch.setattr(cli.meta, "normalize_campaign", fake_meta_normalize)
    monkeypatch.setattr(cli.google_ads, "normalize_campaign", fake_google_normalize)

    with pytest.raises(SystemExit) as exc:
        cli.main(["seed-fixtures"])

    assert exc.value.code == 0
    assert len(repos.campaigns._items) == 3
    assert "3" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# plan: hermetic -- planners themselves are monkeypatched, never called for real
# ---------------------------------------------------------------------------


def test_plan_prints_summary_and_inserts(monkeypatch, capsys):
    product = make_product()
    from creative_studio.contracts import BrandContext

    brand = BrandContext(
        id=new_id("brand"),
        business={"brandName": "Test Brand", "industry": "Fashion & Apparel"},
        branding={}, audience={}, creative_guidelines={}, user_preferences={},
        platform_connections={"shopify": {"connected": True}},
    )
    repos = make_empty_repos(
        products=FakeDocRepo([product]),
        brand_contexts=FakeDocRepo([brand]),
    )
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())
    monkeypatch.setattr(cli, "PlannerLLM", lambda settings: object())
    monkeypatch.setattr(cli, "PromptRegistry", lambda: object())

    spec = make_spec(product.id)
    sheet = make_sheet(spec.id)
    shot_spec = make_shot_spec(spec.id, sheet.id)

    async def fake_plan_creative_spec(llm, registry, brand_, product_, campaigns, preference, platform, language):
        assert product_.id == product.id
        assert preference == "make it luxurious"
        return spec

    async def fake_plan_character_sheet(llm, registry, spec_, brand_):
        assert spec_.id == spec.id
        return sheet

    async def fake_plan_shot_spec(llm, registry, spec_, sheet_):
        assert sheet_.id == sheet.id
        return shot_spec

    monkeypatch.setattr(cli, "plan_creative_spec", fake_plan_creative_spec)
    monkeypatch.setattr(cli, "plan_character_sheet", fake_plan_character_sheet)
    monkeypatch.setattr(cli, "plan_shot_spec", fake_plan_shot_spec)

    with pytest.raises(SystemExit) as exc:
        cli.main(["plan", "--product", product.id, "--preference", "make it luxurious"])

    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert spec.id in out
    assert sheet.id in out
    assert shot_spec.id in out
    assert "Look at this." in out


def test_plan_missing_product_errors(monkeypatch, capsys):
    from creative_studio.contracts import BrandContext

    brand = BrandContext(
        id=new_id("brand"),
        business={"brandName": "Test Brand", "industry": "Fashion & Apparel"},
        branding={}, audience={}, creative_guidelines={}, user_preferences={},
        platform_connections={"shopify": {"connected": True}},
    )
    repos = make_empty_repos(brand_contexts=FakeDocRepo([brand]))
    make_services_factory(monkeypatch, repos=repos, run_store=FakeRunStore())

    with pytest.raises(SystemExit) as exc:
        cli.main(["plan", "--product", "no-such-product", "--preference", "text"])

    assert exc.value.code == 1
    assert "no-such-product" in capsys.readouterr().out
