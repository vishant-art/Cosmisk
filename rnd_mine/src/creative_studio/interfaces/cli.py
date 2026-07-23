# src/creative_studio/interfaces/cli.py
"""`creative-studio` CLI (Task 25): `python -m creative_studio <command>`.

Every subcommand handler is `async def cmd_X(args, services_factory=None)`.
`services_factory` defaults to the module-level `_build_services` (looked up
fresh at call time, not bound at function-definition time), so a test can
either monkeypatch the module attribute `_build_services` and drive the
command through `main()`/`build_parser()`, or inject a fake factory directly.
`_build_services` is the ONLY place a real Postgres pool, R2 client, and fal
adapter are constructed -- everything else here is orchestration and printing.

Spend gate: `confirm_spend` is the single seam every paid path (`generate`,
`resume`, `regen`) runs through. A dry run (`RunMode(False, False)`) never
prompts -- it just states that no paid calls will be made. A live run prints
an itemized estimate plus the current fal balance (best-effort; `None` is
never treated as zero, it just skips the line) and requires a typed `y`
unless `--yes` was passed. `sync-shopify`'s `--live-images` gate is a much
smaller, separate confirmation (BiRefNet cutouts only, no video/voice), since
it does not go through `RunMode`/the generation orchestrator at all.

`require_ffmpeg()` runs at the top of `generate`/`resume`/`regen` -- those are
the only paths that ever touch the ffmpeg-based compositor (via `RealWorkers`
in a live run).
"""
from __future__ import annotations

import argparse
import asyncio
import inspect
from dataclasses import dataclass

from creative_studio.config import get_settings, require_ffmpeg
from creative_studio.generation.adapters.base import FalAdapter
from creative_studio.generation.adapters.balance import read_balance
from creative_studio.generation.workers import RealWorkers
from creative_studio.ingestion import google_ads, meta
from creative_studio.ingestion.brand_profile import build_brand_context, load_brand_profile
from creative_studio.ingestion.shopify import ShopifyClient, mirror_product_assets, normalize_product
from creative_studio.orchestration.orchestrator import (
    Orchestrator,
    RunMode,
    Services,
    compile_generation_task,
)
from creative_studio.orchestration.run_state import STEP_NAMES, RunStateStore
from creative_studio.planning.character_generator import plan_character_sheet
from creative_studio.planning.creative_intelligence import plan_creative_spec
from creative_studio.planning.llm import PlannerLLM
from creative_studio.planning.story_planner import plan_shot_spec
from creative_studio.prompts.registry import PromptRegistry
from creative_studio.replacement.pipeline import prepare_product_assets
from creative_studio.storage.db import create_pool
from creative_studio.storage.migrations_runner import run_migrations
from creative_studio.storage.r2 import R2Store
from creative_studio.storage.repositories import make_repositories

echo = print
input = input  # noqa: A001 -- explicit module-level alias, monkeypatchable like `echo`


# ---------------------------------------------------------------------------
# Services container + factory
# ---------------------------------------------------------------------------


@dataclass
class CLIServices:
    """Everything a CLI command needs. `pool` is kept alongside `repos`/
    `run_store` (which share it) purely so it can be closed when the command
    is done with it."""

    pool: object
    repos: object
    r2: object
    adapter: object
    run_store: object
    settings: object


async def _build_services() -> CLIServices:
    """Construct the real, Postgres/R2/fal-backed services for a live CLI
    invocation. The ONE seam every subcommand's DB/storage/adapter access
    goes through; monkeypatch this name (not its return value) to inject
    fakes in tests."""
    settings = get_settings()
    pool = await create_pool(settings.database_url)
    return CLIServices(
        pool=pool,
        repos=make_repositories(pool),
        r2=R2Store(settings),
        adapter=FalAdapter(settings),
        run_store=RunStateStore(pool),
        settings=settings,
    )


async def _maybe_close_pool(pool) -> None:
    if pool is None:
        return
    close = getattr(pool, "close", None)
    if close is None:
        return
    result = close()
    if inspect.isawaitable(result):
        await result


def _orchestrator_services(services: CLIServices) -> Services:
    return Services(
        adapter=services.adapter, r2=services.r2, repos=services.repos,
        run_store=services.run_store, settings=services.settings,
    )


# ---------------------------------------------------------------------------
# Spend gate
# ---------------------------------------------------------------------------


def confirm_spend(mode: RunMode, settings, assume_yes: bool) -> bool:
    """Gate a paid `generate`/`resume`/`regen` invocation.

    Dry (neither flag): prints the no-spend notice and returns True with NO
    prompt -- `input` must never be called on a dry run. Otherwise prints an
    itemized estimate (images, video, or both) plus the current fal balance
    (skipped when unavailable), then requires a typed `y`/`Y` unless
    `assume_yes` -- anything else, including a bare Enter, aborts.
    """
    if not (mode.live_images or mode.live_video):
        echo("dry-run: no paid calls will be made")
        return True

    echo("Paid generation requested. Estimated spend:")
    if mode.live_images:
        echo("  portrait 1 + keyframes 3 ≈ $0.20-0.60; BiRefNet+BRIA ≈ $0.15")
    if mode.live_video:
        echo("  3 Seedance clips × ≈$1.21 = ≈$3.63; TTS ≈ $0.10")

    if mode.live_images and mode.live_video:
        echo("  total ≈ $4-5")
    elif mode.live_video:
        echo("  total ≈ $3.73")
    else:
        echo("  total ≈ $0.35-0.75")

    balance = read_balance(settings)
    if balance is not None:
        echo(f"  current fal balance: ${balance:.2f}")

    if assume_yes:
        return True

    answer = input("Proceed with paid generation? [y/N] ")
    return answer.strip().lower() == "y"


# ---------------------------------------------------------------------------
# Shared helpers: resolving planning contracts, run-state table printing
# ---------------------------------------------------------------------------


async def _find_latest(repo, creative_spec_id: str):
    """Scan `repo` (newest id first -- `list_ids` is already ORDER BY
    created_at DESC) for the first object whose `creative_spec_id` matches.
    Fine at R&D scale; see the task-25 brief."""
    for obj_id in await repo.list_ids(200):
        obj = await repo.get(obj_id)
        if obj is not None and obj.creative_spec_id == creative_spec_id:
            return obj
    return None


async def _resolve_planning_contracts(repos, creative_spec_id: str):
    """Return `(spec, sheet, shot_spec, product)` for `creative_spec_id`, or
    a helpful error message string if any piece is missing."""
    spec = await repos.creative_specs.get(creative_spec_id)
    if spec is None:
        return f"error: creative spec not found: {creative_spec_id}"

    sheet = await _find_latest(repos.character_sheets, spec.id)
    if sheet is None:
        return (
            f"error: no character sheet found for creative spec {spec.id}; "
            'run \'plan --product <id> --preference "<text>"\' first'
        )

    shot_spec = await _find_latest(repos.shot_specs, spec.id)
    if shot_spec is None:
        return (
            f"error: no shot spec found for creative spec {spec.id}; "
            'run \'plan --product <id> --preference "<text>"\' first'
        )

    product_id = spec.references.get("productId")
    product = await repos.products.get(product_id) if product_id else None
    if product is None:
        return f"error: product not found for creative spec {spec.id} (productId={product_id!r})"

    return spec, sheet, shot_spec, product


def _compile_task(spec, sheet, shot_spec, product, generation_id: str | None = None):
    """Compile the four planning contracts into a `GenerationTask`. When
    `generation_id` is given (resume/regen), the freshly-compiled task's id
    and `context.generationId` are rebound to it, so live assets land under
    the SAME r2:// prefix as the original run rather than a brand-new one."""
    task = compile_generation_task(spec, sheet, shot_spec, product)
    if generation_id is not None and generation_id != task.id:
        context = dict(task.context)
        context["generationId"] = generation_id
        task = task.model_copy(update={"id": generation_id, "context": context})
    return task


def _truncate(value: str | None, length: int = 60) -> str:
    text = value or ""
    return text if len(text) <= length else text[: length - 3] + "..."


def _artifact_uri(step) -> str:
    artifacts = step.artifacts or {}
    return artifacts.get("uri", "") if isinstance(artifacts, dict) else ""


def _print_run_state_table(state) -> None:
    echo(f"{'step':<16} {'status':<10} {'attempts':<9} {'error':<60} artifact")
    for name in STEP_NAMES:
        step = state.steps[name]
        error = _truncate(step.error)
        artifact = _truncate(_artifact_uri(step))
        echo(f"{name:<16} {step.status:<10} {step.attempts:<9} {error:<60} {artifact}")


def _report_run_result(state) -> int:
    echo(f"status: {state.status}")
    _print_run_state_table(state)
    return 0 if state.status == "completed" else 1


# ---------------------------------------------------------------------------
# migrate
# ---------------------------------------------------------------------------


async def cmd_migrate(args, services_factory=None) -> int:
    settings = get_settings()
    applied = run_migrations(settings.migration_database_url)
    if applied:
        echo(f"applied migrations: {', '.join(str(v) for v in applied)}")
    else:
        echo("up to date")
    return 0


# ---------------------------------------------------------------------------
# sync-shopify
# ---------------------------------------------------------------------------


async def cmd_sync_shopify(args, services_factory=None) -> int:
    build = services_factory or _build_services
    services = await build()
    try:
        settings = services.settings
        client = ShopifyClient(settings)

        shop_meta = await client.fetch_shop()
        profile = load_brand_profile()
        brand = build_brand_context(shop_meta, profile, {"shopify": {"connected": True}})
        await services.repos.brand_contexts.upsert(brand)

        raw_products = await client.fetch_products(limit=args.limit)

        if args.live_images and raw_products:
            echo(f"BiRefNet cutout extraction ≈ $0.01-0.05/product x {len(raw_products)} products")
            balance = read_balance(settings)
            if balance is not None:
                echo(f"current fal balance: ${balance:.2f}")
            if not args.yes:
                answer = input("Proceed with paid cutout extraction? [y/N] ")
                if answer.strip().lower() != "y":
                    echo("aborted: no paid calls were made")
                    return 1

        rows = []
        for raw in raw_products:
            product = normalize_product(raw)
            product = await mirror_product_assets(product, services.r2, brand.id)
            if args.live_images:
                product = await prepare_product_assets(services.adapter, services.r2, product, brand.id)
            await services.repos.products.upsert(product)
            rows.append((product.id, product.commercial.get("title", ""), "yes" if product.has_cutout else "no"))

        echo(f"{'product_id':<24} {'title':<40} cutout")
        for pid, title, cutout in rows:
            echo(f"{pid:<24} {title[:40]:<40} {cutout}")
        return 0
    finally:
        await _maybe_close_pool(services.pool)


# ---------------------------------------------------------------------------
# seed-fixtures
# ---------------------------------------------------------------------------


async def cmd_seed_fixtures(args, services_factory=None) -> int:
    build = services_factory or _build_services
    services = await build()
    try:
        product_ids = await services.repos.products.list_ids(100)

        count = 0
        for raw in meta.load_fixture():
            campaign = meta.normalize_campaign(raw, product_ids)
            await services.repos.campaigns.upsert(campaign)
            count += 1
        for raw in google_ads.load_fixture():
            campaign = google_ads.normalize_campaign(raw, product_ids)
            await services.repos.campaigns.upsert(campaign)
            count += 1

        echo(f"seeded {count} campaigns")
        return 0
    finally:
        await _maybe_close_pool(services.pool)


# ---------------------------------------------------------------------------
# plan
# ---------------------------------------------------------------------------


async def cmd_plan(args, services_factory=None) -> int:
    build = services_factory or _build_services
    services = await build()
    try:
        repos = services.repos

        brand_ids = await repos.brand_contexts.list_ids(1)
        if not brand_ids:
            echo("error: no brand context found; run 'sync-shopify' first")
            return 1
        brand = await repos.brand_contexts.get(brand_ids[0])

        product = await repos.products.get(args.product)
        if product is None:
            echo(f"error: product not found: {args.product}")
            return 1

        campaigns = []
        for campaign_id in await repos.campaigns.list_ids(50):
            campaign = await repos.campaigns.get(campaign_id)
            if campaign is not None:
                campaigns.append(campaign)

        llm = PlannerLLM(services.settings)
        registry = PromptRegistry()

        spec = await plan_creative_spec(
            llm, registry, brand, product, campaigns, args.preference, args.platform, args.language,
        )
        await repos.creative_specs.insert(spec)

        sheet = await plan_character_sheet(llm, registry, spec, brand)
        await repos.character_sheets.insert(sheet)

        shot_spec = await plan_shot_spec(llm, registry, spec, sheet)
        await repos.shot_specs.insert(shot_spec)

        echo(f"creativeSpecId: {spec.id}")
        echo(f"characterSheetId: {sheet.id}")
        echo(f"shotSpecId: {shot_spec.id}")
        echo(f"objective: {spec.marketing_objective.get('objective', '')}")
        echo(f"hook: {spec.messaging.get('coreMessage') or spec.messaging.get('cta', '')}")
        for shot in shot_spec.shots:
            echo(f"  shot {shot.shot_number} ({shot.purpose}): {shot.dialogue.get('spokenText', '')}")

        return 0
    finally:
        await _maybe_close_pool(services.pool)


# ---------------------------------------------------------------------------
# generate / resume / regen
# ---------------------------------------------------------------------------


async def cmd_generate(args, services_factory=None) -> int:
    require_ffmpeg()
    build = services_factory or _build_services
    services = await build()
    try:
        resolved = await _resolve_planning_contracts(services.repos, args.spec)
        if isinstance(resolved, str):
            echo(resolved)
            return 1
        spec, sheet, shot_spec, product = resolved

        mode = RunMode(live_images=args.live_images, live_video=args.live_video)
        if not confirm_spend(mode, services.settings, args.yes):
            return 1

        task = _compile_task(spec, sheet, shot_spec, product)
        workers = RealWorkers(services, spec, sheet, shot_spec, product)
        orch = Orchestrator(_orchestrator_services(services), workers)

        spending = mode.live_images or mode.live_video
        balance_before = read_balance(services.settings) if spending else None

        state = await orch.run(task.id, task, mode)

        balance_after = read_balance(services.settings) if spending else None

        code = _report_run_result(state)
        if balance_before is not None and balance_after is not None:
            echo(f"balance delta: {balance_after - balance_before:.2f}")
        return code
    finally:
        await _maybe_close_pool(services.pool)


async def cmd_resume(args, services_factory=None) -> int:
    require_ffmpeg()
    build = services_factory or _build_services
    services = await build()
    try:
        run_state = await services.run_store.load(args.run)
        if run_state is None:
            echo(f"error: run not found: {args.run}")
            return 1

        resolved = await _resolve_planning_contracts(services.repos, run_state.creative_spec_id)
        if isinstance(resolved, str):
            echo(resolved)
            return 1
        spec, sheet, shot_spec, product = resolved

        mode = RunMode(live_images=args.live_images, live_video=args.live_video)
        if not confirm_spend(mode, services.settings, args.yes):
            return 1

        task = _compile_task(spec, sheet, shot_spec, product, generation_id=args.run)
        workers = RealWorkers(services, spec, sheet, shot_spec, product)
        orch = Orchestrator(_orchestrator_services(services), workers)

        state = await orch.resume(args.run, task, mode)
        return _report_run_result(state)
    finally:
        await _maybe_close_pool(services.pool)


async def cmd_regen(args, services_factory=None) -> int:
    require_ffmpeg()
    build = services_factory or _build_services
    services = await build()
    try:
        run_state = await services.run_store.load(args.run)
        if run_state is None:
            echo(f"error: run not found: {args.run}")
            return 1

        resolved = await _resolve_planning_contracts(services.repos, run_state.creative_spec_id)
        if isinstance(resolved, str):
            echo(resolved)
            return 1
        spec, sheet, shot_spec, product = resolved

        mode = RunMode(live_images=args.live_images, live_video=args.live_video)
        if not confirm_spend(mode, services.settings, args.yes):
            return 1

        task = _compile_task(spec, sheet, shot_spec, product, generation_id=args.run)
        workers = RealWorkers(services, spec, sheet, shot_spec, product)
        orch = Orchestrator(_orchestrator_services(services), workers)

        state = await orch.regen_shot(args.run, args.shot, task, mode)
        return _report_run_result(state)
    finally:
        await _maybe_close_pool(services.pool)


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------


async def cmd_status(args, services_factory=None) -> int:
    build = services_factory or _build_services
    services = await build()
    try:
        state = await services.run_store.load(args.run)
        if state is None:
            echo(f"error: run not found: {args.run}")
            return 1
        echo(f"run: {state.id}  status: {state.status}")
        _print_run_state_table(state)
        return 0
    finally:
        await _maybe_close_pool(services.pool)


# ---------------------------------------------------------------------------
# argparse wiring
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="creative-studio")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_migrate = subparsers.add_parser("migrate", help="apply pending schema migrations")
    p_migrate.set_defaults(func=cmd_migrate)

    p_sync = subparsers.add_parser("sync-shopify", help="ingest Shopify products + brand context")
    p_sync.add_argument("--limit", type=int, default=10)
    p_sync.add_argument("--live-images", action="store_true")
    p_sync.add_argument("--yes", action="store_true")
    p_sync.set_defaults(func=cmd_sync_shopify)

    p_seed = subparsers.add_parser("seed-fixtures", help="seed Meta + Google campaign fixtures")
    p_seed.set_defaults(func=cmd_seed_fixtures)

    p_plan = subparsers.add_parser("plan", help="run the planning chain for one product")
    p_plan.add_argument("--product", required=True)
    p_plan.add_argument("--preference", required=True)
    p_plan.add_argument("--platform", default="Instagram")
    p_plan.add_argument("--language", default="English")
    p_plan.set_defaults(func=cmd_plan)

    p_generate = subparsers.add_parser("generate", help="run generation for a creative spec")
    p_generate.add_argument("--spec", required=True)
    p_generate.add_argument("--live-images", action="store_true")
    p_generate.add_argument("--live-video", action="store_true")
    p_generate.add_argument("--yes", action="store_true")
    p_generate.set_defaults(func=cmd_generate)

    p_resume = subparsers.add_parser("resume", help="resume a pending/failed run")
    p_resume.add_argument("--run", required=True)
    p_resume.add_argument("--live-images", action="store_true")
    p_resume.add_argument("--live-video", action="store_true")
    p_resume.add_argument("--yes", action="store_true")
    p_resume.set_defaults(func=cmd_resume)

    p_regen = subparsers.add_parser("regen", help="regenerate one shot of a run")
    p_regen.add_argument("--run", required=True)
    p_regen.add_argument("--shot", type=int, required=True)
    p_regen.add_argument("--live-images", action="store_true")
    p_regen.add_argument("--live-video", action="store_true")
    p_regen.add_argument("--yes", action="store_true")
    p_regen.set_defaults(func=cmd_regen)

    p_status = subparsers.add_parser("status", help="print a run's step table")
    p_status.add_argument("--run", required=True)
    p_status.set_defaults(func=cmd_status)

    return parser


def main(argv: list[str] | None = None) -> None:
    parser = build_parser()
    args = parser.parse_args(argv)
    code = asyncio.run(args.func(args))
    raise SystemExit(code if code is not None else 0)


if __name__ == "__main__":
    main()
