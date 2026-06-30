# Creative Studio — Main-Repo Integration Plan (M4 promotion)

> How the built `rnd/creative/` pipeline gets promoted into the production monorepo as
> the **Creative Studio / M4 Generative Engine**. Companion: `creative-studio-db-design.md`.
> Drafted 2026-06-30 from a 4-strand read of `apps/ai-layer`, `apps/api` creative routes,
> the DB schema, and the product docs.
>
> **BUILD STATUS (2026-06-30): Phase A + C DONE and live-verified** on branch
> `feat/creative-studio-integration`. The full pipeline is ported into
> `apps/ai-layer/ai_layer/creative/` (+ `ai_layer/meta_creatives.py`); FastAPI endpoints
> `POST /creative/generate` + `GET /creative/jobs/{id}` + a `/creative/assets` static mount
> are live; 156 ai-layer tests pass (102 ported + 3 service + existing); one live run through
> the service path produced 2 multi-format ads ($0.81, 0 rejected) from real Meta winners.
> Hardened `_chat_json` with a JSON-parse retry (the LLM intermittently truncates JSON).
> **DEFERRED (per decisions):** Phase B object storage, DB persistence, the apps/api TS
> wiring, and Phase E delivery hooks. `rnd/creative/` left in place as the source until retired.

---

## 1. What this is

The pipeline at `rnd/creative/` is, per the docs, the **M4 "Generative Engine"** milestone
(SoW: "Creative Studio architecture, triggers, cloud upload"). Locked decision **D7** always
said: it lives in `rnd/` as R&D, and promotion into `apps/ai-layer` is "a later, separate
step." **This plan is that step.**

It is NOT a rewrite. The pipeline is Python (fal + OpenRouter + Pillow + ffmpeg); the natural
home is the existing Python service `apps/ai-layer`, with the TypeScript backend `apps/api`
owning auth, the DB, and the UI contract — calling the Python service over HTTP. This is the
**exact pattern the analytics/chat layer already uses** (flag-gated `AI_LAYER_URL`, thin TS
client, no-op-until-configured route module), so we are following a proven, low-risk template.

---

## 2. The three units (target architecture)

```
 apps/web (Angular)            apps/api (Fastify/TS)                 apps/ai-layer (Python/FastAPI)
 ─────────────────             ─────────────────────                ──────────────────────────────
 Creative Studio screens  ──>  /creative-studio routes        ──>   ai_layer.creative  (ported pipeline)
 (existing; {generation_id}    · owns auth, user scoping             · brand_brain / image / compositor
  + 5s status poll)            · owns the DB (studio_generations,     · verifier / video / voiceover
                               ·   studio_outputs, cost_ledger)       · Meta winner-creative fetch
                               · thin HTTP client (flag-gated)        · NEW endpoints (below)
                               · passes per-user Meta token           · uploads finished bytes to
                               · records cost_ledger rows                OBJECT STORAGE -> returns URLs
```

Data flow for one generation:
1. Web `POST /creative-studio/generate {brief, formats, metaAccountId}` → apps/api.
2. apps/api inserts a `studio_generations` row (`status=generating`) + `studio_outputs` rows,
   resolves the user's Meta token, and calls the Python service `POST /creative/generate`
   (async, returns a `job_id`). Returns `{ generation_id }` to web immediately.
3. Python runs the pipeline in the background (campaign-select → brand kit → backgrounds →
   composite → verify → multi-format → optional video+audio), **uploads each finished asset to
   object storage**, and records progress/results.
4. Web polls `GET /creative-studio/generation/:id`; apps/api reads its DB (and/or proxies the
   Python job status), returns per-format outputs with durable asset URLs.
5. apps/api writes one `cost_ledger` row per provider step.

---

## 3. Where it plugs into the existing Creative Studio

| Existing seam (apps/api) | Status today | Plan |
|---|---|---|
| `routes/creative-studio.ts` (`/generate`, `/generation/:id`, `/generations`, `/score`) | REAL — fire-and-forget, calls `FluxProvider` inline for images; **video not generated**; persists `studio_generations`/`studio_outputs`; frontend polls | **Primary integration point.** Replace the inline single-provider generation with a call to the Python pipeline (full brand-kit → multi-format → video). Keep the route contract (`{generation_id}` + poll) unchanged so `apps/web` needs no rework. |
| `services/static-ad-generator.ts` + `routes/static-ads.ts` | **STUB** (`{ generated: [] }`) | Back it with the same Python pipeline (static formats), or leave deprecated in favor of `/creative-studio`. |
| `routes/creative-engine.ts` + `services/job-queue.ts` (sprint batch queue, `creative_jobs`/`creative_assets`, `api-providers.ts`) | REAL, mature | **Leave as-is.** Optionally, later, add the Python pipeline as a `CreativeProvider` in `api-providers.ts` so sprint jobs can use it. Out of scope for the first cut. |

The frontend already speaks the studio contract (`core/services/creative-studio.service.ts`:
`generate → {generation_id}`, `getGeneration(id)` poll, `StudioBrief/Generation/Output`). We
honor it exactly — no web changes required for the first cut beyond surfacing the richer output.

---

## 4. Work breakdown (phased, additive, flag-gated)

**Phase A — Port the pipeline into `apps/ai-layer` (Python, no apps/api touch)**
- Move `rnd/creative/src/*` → `apps/ai-layer/ai_layer/creative/` as a proper sub-package.
  Convert flat imports (`import config`) → package imports (`from ai_layer.creative import ...`);
  remove the `sys.path.insert` hacks.
- Move the shared Meta module `rnd/src/meta_creatives.py` → `ai_layer/meta_creatives.py`; have
  `campaign_select` consume the existing `ai_layer.meta_transform` (drop the rnd copy).
- Add deps to `pyproject.toml`: `pillow`, `fal-client`, `imageio-ffmpeg` (+ optional
  `opencv-python-headless`). Add `fal` + creative model-id config to `ai_layer/config.py`
  (service env, not repo-root `.env`). Update the `Dockerfile` (the bundled ffmpeg ships with
  `imageio-ffmpeg`, so no system ffmpeg needed).
- Port the 91 creative tests into `apps/ai-layer/tests/` (mock-based, $0).

**Phase B — Object storage + asset upload — DEFERRED (doc only, see DB design doc)**
- Would add an `ai_layer/storage.py` that uploads finished bytes to a bucket and returns durable
  URLs. **Not in the first cut** (D-db). Until then, the ai-layer serves assets from its own
  static mount (ephemeral).

**Phase C — FastAPI endpoints (Python)**
- `POST /creative/generate` → start a run (async; return `{job_id}`), inputs: brief, formats,
  images/concepts, video flags, optional `meta_account` for winner conditioning. Auth via the
  existing `X-API-Key` + per-request `X-Meta-Token`.
- `GET /creative/jobs/{job_id}` → status + per-format results (durable URLs, copy, QA verdicts,
  per-step costs).
- Async model: FastAPI `BackgroundTasks` (or a small in-process task store) — mirrors the
  existing single-worker, fire-and-forget pattern. See **Decision 2**.

**Phase D — Wire apps/api (TS) — PARTLY DEFERRED**
- First cut: a thin flag-gated `services/creative-gen-client.ts` (reuses `AI_LAYER_URL`) +
  `boot/creative-routes.ts` that can **trigger a run and proxy status/results** from the Python
  service — no-op until the flag is set, exactly like `ai-layer-routes.ts`. Optional for the
  very first cut (the Python service is independently runnable/testable).
- **DEFERRED (with the DB phase):** persisting to `studio_generations`/`studio_outputs`, writing
  `cost_ledger` rows, the additive Drizzle migration, and gating on the per-user daily cap.

**Phase E — Delivery hooks (M4 "cloud upload" → client channels) — DEFERRED**
- The durable asset URLs feed the existing client touchpoints: the WhatsApp "THE ONE THING" PNG
  card, the weekly HTML report thumbnails, and the dashboard Creative Deep-Dive
  `[VIEW REPLACEMENT]`. Wiring those is a later step once assets are durably hosted.

---

## 5. Hard constraints we must honor (from the docs)

- **CODE FREEZE / maintainer workflow.** No ad-hoc edits to `apps/api/src`, schema, routes,
  services, or deps. Everything additive, on a dedicated branch, flag-gated, with the
  **Test Invariant** green (default 400/9, pg 388/10, `tsc --noEmit` baseline, `madge` 0 cycles).
- **NO MEDIOCRE OUTPUTS — reject, don't log.** The verifier stays fail-closed (max 2 retries then
  reject). A rejected creative never reaches a client.
- **NO DIRECT LLM CALLS.** The brain/VLM LLM traffic must be cost-tracked. The established Python
  pattern is the ai-layer's own cost recording → unify creative LLM + fal spend into the TS
  `cost_ledger` (api_provider `flux`/`seedance`/`gemini`, operation `image_gen`/`video_gen`/…).
  See **Decision 4**.
- **Per-user multi-tenancy.** Scope every row by `request.user.id`; pass the user's decrypted Meta
  token as `X-Meta-Token` (the pipeline currently uses one global `META_ACCESS_TOKEN`).
- **Plan-tier daily $ cap.** Creative generation spends real money — gate it behind the existing
  `checkLimit`/`incrementUsage` (`creative_count`) like the other generators.

---

## 6. Decisions (LOCKED 2026-06-30)

| # | Decision | Locked choice |
|---|---|---|
| D-scope | First-cut scope | **Full M4 in one go** — images + multi-format + video + native audio + voiceover + Meta-winner conditioning, all ported and wired. |
| D-home | Service home | **Reuse the existing `apps/ai-layer` service** — add creative endpoints there, reuse `AI_LAYER_URL`, one Dockerfile/deploy. Adds `fal-client`/`pillow`/`imageio-ffmpeg` to that service. |
| D-cost | Cost tracking | **Python `cost_ledger` only** for now — the pipeline keeps its own per-run ledger + the ai-layer JSONL ledger; NOT written to the TS `cost_ledger` DB yet. (Consistent with deferring DB; can unify later.) |
| D-db | DB + object storage | **DEFERRED — design documented, not built yet.** See `creative-studio-db-design.md`. The first cut does NOT persist runs to `studio_generations`/`studio_outputs` and does NOT add a bucket. |
| D-async | Async model | FastAPI background task; job status polled from the Python service (`GET /creative/jobs/{id}`). |

### What this means for the build (revised)
- **IN the first cut:** Phase A (port the full pipeline into `apps/ai-layer`) + Phase C (FastAPI
  endpoints). Assets are served **from the ai-layer itself** via a FastAPI static mount
  (e.g. `{AI_LAYER_URL}/creative/assets/<run>/<file>`) — **ephemeral** (lost on redeploy), which
  is acceptable until the deferred storage/DB phase lands. Costs recorded in the Python ledger.
- **DEFERRED (doc only):** Phase B (object storage / durable URLs) and the apps/api **DB
  persistence** (`studio_generations`/`studio_outputs` writes, `cost_ledger` rows, migrations).
  The apps/api flag-gated client/route can be a thin trigger-and-proxy now; full persistence and
  the WhatsApp/HTML delivery hooks (Phase E) come with the DB phase.

---

## 7. What I will NOT do until you say "build it"

This is still a plan. No code, no file moves, no schema changes yet. On your go I'll execute
Phase A (port the full pipeline into `apps/ai-layer`) then Phase C (endpoints), additively on a
dedicated branch, with the ported tests passing, checking in at each phase boundary. The DB +
object-storage phase stays documented for when you want it.
