# AI Layer — Integration Plan (rnd -> main code)

> How the validated `rnd/` experiments become part of the monorepo. This is a PLAN
> (per the workflow rule + CODE FREEZE on `apps/api/src`): no `apps/` edits yet.
> Each phase needs maintainer approval on a dedicated branch, verified against the
> Test Invariant. Last updated: 2026-06-12.

## Where we are

Validated in `rnd/` (Python): the L1 transform + typed contract (`meta_transform`),
the deterministic brain (`brain`), the live ingestion helpers (`meta_live`), the
combined live runner (`brain_real`), and the RAG chatbot (`chat`). All tested
(27 offline + live), run against real Meta data.

Main code today: `apps/api` (Fastify/TS) with a **dormant intelligence layer** wired
to a no-op seam `apps/api/src/services/intelligence-integration.ts`; `apps/web`
(Angular); `packages/types` (`@cosmisk/types`, exports `AiInsight`). No `apps/ai-layer`.
Stated intent (project history): integrate this work into `apps/ai-layer`, then retire
the equivalent dormant TS.

## The architecture decision (needs sign-off)

The experiments are Python + pandas; the app is TS. Two paths:

- **A) Python service `apps/ai-layer` (FastAPI).** Keep the Python as-is, expose HTTP
  endpoints, `apps/api` calls it at the existing seam. Matches the project's stated
  plan and the monorepo assessment's `apps/ai-service`. Keeps pandas/numeric tooling.
  **Recommended.**
- B) Port the logic to TS inside `apps/api`. No new service / network hop, but loses
  pandas, re-implements the transform + brain, and is much more work.

This plan assumes **A**. The seam stays the integration point: `intelligence-integration.ts`
calls `apps/ai-layer` over HTTP and returns `AiInsight[]` to `apps/web`.

## Module mapping (rnd -> apps/ai-layer)

| rnd module | becomes | notes |
|---|---|---|
| `meta_transform` (CampaignDayFact, Dataset, canonical fields) | `core/transform` | the typed L1 boundary; the contract everything shares |
| `meta_live` (fetch_envelope/fetch_dataset, FIELDS, attribution, list_accounts) | `ingestion/meta_client` | add async report jobs + persistence (below) |
| `brain` (statements, materiality gates, charts) | `analysis/brain` | emit **structured** insights (map to `AiInsight`), not prose; charts -> chart-data payloads |
| `chat` (context-injection RAG, model cfg, picker) | `chat/` + an HTTP endpoint | REPL/picker become request params; `build_context`/`complete` stay |
| `tests/` | service tests | port + add a CI lane |

## Proposed API surface (apps/ai-layer)

- `GET /accounts` — list ad accounts for a user/token (wraps `list_accounts`).
- `GET /insights/{account}?preset=last_30d` — deterministic brain statements as
  `AiInsight[]` + chart data (no LLM).
- `POST /chat` — `{account, message, history}` -> grounded analytical answer (the RAG).
- `POST /ingest/{account}` — refresh the persisted store (trailing-window UPSERT).

Outputs conform to `@cosmisk/types`; extend `AiInsight` if the brain's statement
shape needs more fields, so `apps/web` renders them unchanged.

## Production gaps to close (readiness checklist)

| # | Gap | Today (rnd) | Needed for prod |
|---|---|---|---|
| 1 | **Config/secrets** | repo-root `.env` + module consts (MODEL etc.) | service config / env; model + thresholds configurable |
| 2 | **Persistence / ingestion** | stateless; rolling `last_30d` re-pull, nothing stored | a store (SQLite/Postgres/parquet) + **trailing-window UPSERT** on `(account, campaign, date)` so history accumulates and recent days restate; **async report jobs** for big/long pulls (the 90d sync hit a Meta 500) |
| 3 | **LLM cost tracking** | `chat` calls OpenRouter directly | Architecture Rule #1 (no direct LLM calls; gateway only) — route through a shared gateway/cost-ledger or replicate cap+cost tracking in the service. Billing risk otherwise. |
| 4 | **Per-user Meta tokens** | one `META_ACCESS_TOKEN` in `.env` | prod stores encrypted per-user tokens in the DB; ai-layer must obtain the right token per request (call `apps/api`, or read the token store) |
| 5 | **Multi-tenancy** | single token/account | many users x many accounts; auth on the service; request-scoped tokens |
| 6 | **Auth between services** | n/a | `apps/api` <-> `apps/ai-layer` auth (shared secret / internal network) |
| 7 | **Packaging** | `sys.path.insert` hacks, scripts | proper Python package (`pyproject.toml`, real imports), `uv`/pip lock |
| 8 | **Deploy + CI** | run from `cos` venv locally | Dockerfile + Railway service; a turbo/CI lane; port the tests |

## Phased plan (each phase = its own approved branch)

- **Phase 0 (done):** validate in rnd; freeze the `CampaignDayFact`/`Dataset`
  contract and field choices (`meta-field-choices.md`); this plan.
- **Phase 1 — Package. [DONE 2026-06-12]** `apps/ai-layer/` created: `pyproject.toml`
  (`cosmisk-ai-layer`, editable-installable), `ai_layer/` package with clean
  `from ai_layer import ...` imports (no `sys.path` hacks), centralized `config.py`,
  the **Python-side `cost_ledger.py`** (the chosen cost-tracking approach), and the
  ported modules + tests. Runs as `python -m ai_layer.<mod>`. **26 offline + 5 live
  tests pass**; cost ledger verified recording (stream + non-stream). `rnd/` stays as
  the sandbox in parallel; behaviour is identical. No `apps/api` / `apps/web` touched.
- **Phase 2 — Service. [DONE 2026-06-12]** FastAPI app (`ai_layer/api.py`) +
  `schemas.py` (Pydantic models + `AiInsight` cards): `/health`, `/accounts`,
  `/insights/{account}`, `/chat`, `/ingest/{account}`, `/cost`. `Dockerfile` added.
  Verified end-to-end against a running uvicorn (live ingest -> store -> insights ->
  chat -> cost).
- **Phase 3 — Persistence/ingestion. [DONE 2026-06-12]** `store.py` SQLite store with
  **trailing-window UPSERT** on `(account_id, campaign_id, date)`; `/ingest` accumulates
  history (e2e: 1,182 rows ingested, read back via `source=store`). Async report jobs
  for >30d backfills remain a documented follow-up (sync 90d 500s).
- **Phase 4 — Tenancy + cost. [DONE 2026-06-12]** Caller auth via `X-API-Key`
  (`AI_LAYER_API_KEY`); per-user Meta token via `X-Meta-Token` (service never touches
  the encrypted token DB); per-account LLM cost attribution in the ledger + `/cost`.
  (gap #3/#4/#5/#6). Still single-token env fallback for local dev.
- **Phase 5 — Wire the integration. [DONE 2026-06-13]** Flag-gated by `AI_LAYER_URL`
  (OFF by default = no behaviour change). **apps/api** (additive): `config.aiLayerUrl/
  aiLayerApiKey`, `services/ai-layer-client.ts` (HTTP client + `AiLayerError`),
  `boot/ai-layer-routes.ts` (`GET /ai-layer/insights` — auth, per-user Meta token,
  proxies the ai-layer cards, degrades gracefully), registered in `index.ts`, +
  `__tests__/ai-layer-routes.test.ts` (5 tests). **apps/web** (additive):
  `AiLayerInsightsComponent` (renders nothing when empty), `AI_LAYER_INSIGHTS`
  endpoint, dropped into the dashboard. Note: the actual `intelligence-integration.ts`
  seam is Watchdog/Report agent plumbing, so the frontend insights path
  (`/ai-layer/insights` -> dashboard) was the correct wiring, not that file.
  **Verified:** apps/api `tsc` clean, **399 default tests pass (+5, no regression)**,
  `madge` 0 cycles; apps/web production build green. (CI default-suite count moves
  400 -> 405; maintainer to update the Test Invariant doc.)
- **Phase 6 — Retire dormant TS. [PARTIAL 2026-06-13]** Removed the **provably-dead
  island** (verified: zero live importers, zero tests, only string/comment mentions):
  `services/{elite-intelligence, strategic-cognition, signal-discovery,
  intelligence-layer, quality-governance}/` + `quality-gated-runner.ts` =
  **16,901 LOC**. Post-delete: apps/api `tsc` clean, **399 tests pass (unchanged)**,
  `madge` 0 cycles. **KEPT** (NOT dormant — live-entangled, removing them changes
  behaviour, needs its own decoupling pass): `learning-engine` (← `morning-briefing`,
  `creative-strategist` via `routes/agent.ts`), `operator-experience` /
  `creative-intelligence` / `reality-testing` / `intelligence-persistence` (← live
  `routes/intelligence.ts`), the `intelligence-integration.ts` seam (← report-agent +
  watchdog), and `strategic-intelligence-engine`. The "0 callers, 17.8K safe" external
  estimate was WRONG (learning-engine is live-reachable); only the verified island was
  removed. Orphaned design doc `services/ELITE_INTELLIGENCE_DESIGN.md` left in place.

## Open decisions for sign-off

1. **A (Python service) vs B (TS port)?** Recommend A.
2. **LLM cost tracking** for the Python service: shared gateway vs Python-side ledger?
3. **Per-user Meta tokens**: ai-layer calls `apps/api` for the token, or reads the
   encrypted token store directly?
4. **Output contract**: extend `@cosmisk/types` `AiInsight` to cover brain statements +
   chat responses, or add new types?
5. **Service name/path**: `apps/ai-layer` (docs use this) vs `apps/ai-service`
   (monorepo assessment). Pick one.

## Constraints

- **CODE FREEZE**: no direct edits to `apps/api/src`, schema, routes, services, deps.
  Integration happens on maintainer branches, verified against the Test Invariant
  (default 400/9, pg 388/10, `tsc` baseline, `madge` 0 cycles).
- `rnd/` stays the experiment sandbox until Phase 1 lifts it; nothing in `apps/` is
  touched by this document.

## Immediate, safe next step

**Phase 1 (packaging)** is the only step that touches no existing `apps/` code and
unblocks the rest. On approval I can scaffold `apps/ai-layer/` (pyproject + package +
moved tests) as an additive change, leaving `rnd/` working in parallel.
