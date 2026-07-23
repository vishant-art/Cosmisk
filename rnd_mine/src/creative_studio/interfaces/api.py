# src/creative_studio/interfaces/api.py
"""FastAPI facade over the Creative Studio pipeline (Task 26).

A thin, localhost-only R&D HTTP surface (NO auth) over the same services the
CLI drives. `create_app(services_factory=None)` mirrors the CLI's factory seam:
it defaults to `cli._build_services` (the ONE place a real Postgres pool, R2
client, and fal adapter are constructed), and a test injects a fake factory
instead. The services are built once in the app lifespan and shared across
requests; the pool is closed on shutdown.

Routes:
  POST /generate  -- body `{creativeSpecId, liveImages?, liveVideo?}`. A live
                     flag (`liveImages`/`liveVideo`) requires header
                     `X-Confirm-Spend: yes`, else 402 -- the HTTP analogue of
                     the CLI's typed-`y` spend gate. A live flag also requires
                     `ffmpeg`/`ffprobe` on PATH (`config.require_ffmpeg()`,
                     the same check the CLI's generate/resume/regen run at
                     their own top) -- missing either binary -> 400, checked
                     BEFORE lineage resolution or spawning, same as the spend
                     gate. Resolves the creative spec's lineage (the SAME
                     `cli.resolve_lineage` scan the CLI uses), compiles the
                     `GenerationTask`, and spawns `Orchestrator.run(...)` as a
                     fire-and-forget task so the (minutes-long) run outlives
                     the request; returns 202 `{runId}`. An unknown or
                     unresolvable spec -> 404.
  GET  /runs/{id}          -- the `RunState` as camelCase JSON, or 404.
  GET  /runs/{id}/manifest -- the `AssetManifest` whose
                              `references.generationId` matches, or 404.

Spawned runs are held in `app.state.background_tasks` so the loop keeps a
strong reference to each (an unreferenced task can be garbage-collected
mid-flight) until it finishes and the done-callback discards it.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException, Request

from creative_studio.config import require_ffmpeg
from creative_studio.contracts.base import CamelModel
from creative_studio.generation.workers import RealWorkers
from creative_studio.interfaces.cli import (
    _build_services,
    _maybe_close_pool,
    _orchestrator_services,
    resolve_lineage,
)
from creative_studio.orchestration.orchestrator import (
    Orchestrator,
    RunMode,
    compile_generation_task,
)


class GenerateRequest(CamelModel):
    """`POST /generate` body. camelCase over the wire (`creativeSpecId`,
    `liveImages`, `liveVideo`) via the `CamelModel` alias generator."""

    creative_spec_id: str
    live_images: bool = False
    live_video: bool = False


def create_app(services_factory=None) -> FastAPI:
    """Build the FastAPI app. `services_factory` (default `cli._build_services`)
    is an async callable returning a `CLIServices`; it is awaited ONCE in the
    lifespan, and the resulting pool is closed on shutdown. Tests pass a factory
    that returns fake, in-memory services."""
    factory = services_factory or _build_services

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.services = await factory()
        app.state.background_tasks = set()
        try:
            yield
        finally:
            await _maybe_close_pool(getattr(app.state.services, "pool", None))

    app = FastAPI(title="Creative Studio", lifespan=lifespan)

    @app.post("/generate", status_code=202)
    async def generate(
        request: Request,
        body: GenerateRequest,
        x_confirm_spend: str | None = Header(default=None),
    ):
        services = request.app.state.services

        # Spend gate: any live stage requires an explicit confirmation header,
        # BEFORE we resolve lineage or spawn anything.
        if (body.live_images or body.live_video) and x_confirm_spend != "yes":
            raise HTTPException(
                status_code=402, detail="spend not confirmed; set X-Confirm-Spend: yes"
            )

        # A live run's compose step shells out to ffmpeg/ffprobe (via
        # RealWorkers, same as the CLI's generate/resume/regen) -- fail fast
        # with a clear 400 here rather than minutes into a spawned background
        # run that can only ever reach a "failed" compose step.
        if body.live_images or body.live_video:
            try:
                require_ffmpeg()
            except RuntimeError as exc:
                raise HTTPException(status_code=400, detail=str(exc)) from exc

        resolved = await resolve_lineage(services.repos, body.creative_spec_id)
        if isinstance(resolved, str):
            raise HTTPException(status_code=404, detail=resolved)
        spec, sheet, shot_spec, product = resolved

        task = compile_generation_task(spec, sheet, shot_spec, product)
        mode = RunMode(live_images=body.live_images, live_video=body.live_video)

        orch_services = _orchestrator_services(services)
        workers = RealWorkers(orch_services, spec, sheet, shot_spec, product)
        orchestrator = Orchestrator(orch_services, workers)

        run_task = asyncio.create_task(orchestrator.run(task.id, task, mode))
        request.app.state.background_tasks.add(run_task)
        run_task.add_done_callback(request.app.state.background_tasks.discard)

        return {"runId": task.id}

    @app.get("/runs/{run_id}")
    async def get_run(request: Request, run_id: str):
        services = request.app.state.services
        state = await services.run_store.load(run_id)
        if state is None:
            raise HTTPException(status_code=404, detail=f"run not found: {run_id}")
        return state.model_dump(by_alias=True)

    @app.get("/runs/{run_id}/manifest")
    async def get_manifest(request: Request, run_id: str):
        services = request.app.state.services
        for manifest_id in await services.repos.asset_manifests.list_ids(200):
            manifest = await services.repos.asset_manifests.get(manifest_id)
            if manifest is not None and manifest.references.get("generationId") == run_id:
                return manifest.to_doc()
        raise HTTPException(status_code=404, detail=f"no manifest for run: {run_id}")

    return app
