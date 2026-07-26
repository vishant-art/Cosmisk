# AI Layer — Integration Plan (rnd -> main code)

> How the validated `rnd/` experiments become part of the monorepo. This is a PLAN
> (per the workflow rule + CODE FREEZE on `apps/api/src`): no `apps/` edits yet.
> Each phase needs maintainer approval on a dedicated branch, verified against the
> Test Invariant. Last updated: 2026-06-12.

## Running it locally (ONE command)

`cd apps/api && npm run dev` boots **both** services together via `apps/api/dev.mjs`
(supervisor): the Python ai-layer (uvicorn :8077) and the Node api (tsx watch :3000),
logs interleaved in one terminal, Ctrl+C stops both. `npm run dev:api` runs the api alone.

The `/ai-layer/*` routes are flag-gated on `AI_LAYER_URL`; the env is wired in
`apps/api/.env` (`AI_LAYER_URL=http://127.0.0.1:8077`, `AI_LAYER_API_KEY=testkey`,
`META_ACCESS_TOKEN`, `DEMO_ACCOUNT_ID`) and root `.env` (`AI_LAYER_API_KEY=testkey` for the
Python side; it already had `OPENROUTER_API_KEY` + `META_ACCESS_TOKEN`). `AI_LAYER_API_KEY`
must match on both sides.

Notes:
- Full api boot is slow (~30–40s: LLM gateway, crons, audit scheduler, Neon DB) — the
  ai-layer (:8077) comes up in ~3s, the api (:3000) a bit later. Watch for
  `[ai-layer] ai-layer routes enabled` then `Cosmisk server running on port 3000`.
- If a `npm run dev` was already running, restart it to pick up an `.env` change
  (`tsx watch` only reloads on source edits, not `.env`).
- If the `cos` venv is missing, `dev.mjs` warns and starts the api alone (degraded).
- `start-ai-layer.ps1` at the repo root still exists as a standalone way to run just the
  Python service if needed.

Verified end-to-end (2026-06-13) from a single `npm run dev`: `/ai-layer/insights?demo=1`
→ 6 cards, `/ai-layer/chat` (demo) → grounded answer ("blended ROAS … 3.60").

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

## "Continue without Meta login" (demo creds) + full smoke [DONE 2026-06-13]

A user who hasn't connected Meta can still see real insights via the shared dev/testing
token. **Additive, dev-gated, contained to the ai-layer insights path.**

- **apps/api `config.ts`**: `metaAccessToken` (= `META_ACCESS_TOKEN`, the dev/testing
  agency token) and `demoAccountId` (= `DEMO_ACCOUNT_ID`, default `act_1738503939658460`).
  **Empty `metaAccessToken` in prod ⇒ demo mode is OFF** (the gate). Note: `apps/api/.env`
  does not carry `META_ACCESS_TOKEN`; it must be set in the service env to enable demo.
- **`boot/ai-layer-routes.ts`**: `GET /ai-layer/insights?demo=1` — when the user has no
  Meta token AND `demo=1` AND `config.metaAccessToken` is set, fall back to the dev token
  + `demoAccountId` (account_id optional in demo; explicit `account_id` still honoured).
  Response carries `demo: true`. Without the opt-in, behaviour is unchanged
  (`meta_connected: false`). account_id is now required only once a token is present.
- **`services/ai-layer-client.ts`**: default `source` flipped **live → store** (the warm
  store is the fast request path per gap #2; live falls back automatically when empty).
  Timeout 30s → 45s. A cold live pull (~30s+) was the cause of the first smoke's timeout;
  pre-`/ingest` warms the store so reads are ~2s.
- **apps/web `ai-layer-insights.component.ts`**: when no account is connected, shows a
  "Continue without Meta login" button → loads `?demo=1`; cards badged **"Demo data"**.
- **Tests**: `__tests__/ai-layer-routes.test.ts` now 7 (was 5): +demo fallback, +account
  override; the 400 case updated (account_id only required with a token). `config.js`
  mocked per-file so the demo path is deterministic.

**Full cross-service smoke (PASS, 2026-06-13):** tokenless user (JWT) →
`GET /ai-layer/insights?demo=1` → dev creds → ai-layer store (1,193 rows, last 30d) →
deterministic brain → **6 real AiInsight cards** (Overview ₹51.99L spend / ₹1.87Cr rev /
ROAS ~3.6, -32% revenue Trend, best/worst campaign, budget concentration, bad-day alert),
`demo: true`, **~2.0s** latency. Verified: apps/api `tsc` 0 errors, **401 default tests
pass** (+2, 0 fail), `madge` 0 cycles.

> **Scope note / follow-up:** this is contained to the ai-layer insights card. An
> app-wide "demo mode" (dashboard KPIs, analytics, etc. on dev creds) would mean teaching
> the shared token helpers (`getMetaTokenForUser` / `getUserMetaToken`) the same fallback,
> which touches many frozen routes — deferred pending a decision. Background `/ingest`
> (cron) to keep the store warm is the remaining production task for snappy reads.

## Chat wiring + tab surfaces [DONE 2026-06-13]

Before this, only the dashboard insight card reached the Python ai-layer; the brain/
analytics tabs and chat were all old TS, and the Python `/chat` RAG was unreachable from
the web app (apps/api only proxied `/ai-layer/insights`). Now wired, additively:

- **apps/api**: `services/ai-layer-client.ts` adds `fetchAiLayerChat()` (POST the Python
  `/chat`, 60s timeout, store source, full-data). `boot/ai-layer-routes.ts` extracts a
  shared `resolveMetaToken(userId, demoMode)` (per-user token → dev-creds demo fallback →
  null) used by both routes, and adds **`POST /ai-layer/chat`** (auth, demo-aware,
  history capped at 20 turns, graceful degrade with a friendly message). Tests:
  `__tests__/ai-layer-routes.test.ts` **5 → 13** (added the full chat suite).
- **apps/web**: new **AI Chat** tab — `features/ai-chat/ai-chat.component.ts` (chat UI:
  bubbles, suggestions, typing indicator, model+session-cost footer; auto-demo with a
  "Demo data" badge when no account is connected), route `/app/ai-chat`, sidebar item
  under Intelligence (LIVE badge). The Python deterministic-brain cards
  (`AiLayerInsightsComponent`, already demo-aware) are now also mounted on the **Brain**
  and **Analytics** tabs (existing UI untouched, cards on top). Registered the
  `MessageCircle` + `BrainCircuit` lucide icons (the dashboard's `brain-circuit` was
  previously unregistered → blank).

**What now reaches the Python services from the website:** dashboard insight card, Brain
tab cards, Analytics tab cards, and the AI Chat tab (RAG). The old TS brain-patterns /
analytics / agent endpoints still back the rest of those tabs (not ripped out).

**Live chat smoke (PASS, 2026-06-13):** tokenless user → `POST /ai-layer/chat`
(`demo:true`) → dev creds → ai-layer store → context-injection RAG → gemini-2.5-flash.
Turn 1 named the best campaign (5.06 ROAS) + spend↑/ROAS↓ trend; turn 2 (history passed)
returned worst campaigns with real numbers + a pause recommendation. **Caveat:** full-data
mode on the large demo account (1,193 rows / 84 campaigns) ⇒ **~18-20s and ~$0.045 per
turn** (context is re-sent every turn). Fine on small accounts; for big accounts consider
a summarized-context mode or a per-turn context cache. Verified: apps/api `tsc` 0 errors,
**407 default tests pass** (+6), `madge` 0 cycles; apps/web prod build green.

## Chat cost controls: summary mode + session cache [DONE 2026-06-13]

The full-data chat re-sent the whole dataset every turn (~$0.045, ~18-20s on the big
demo account). Two additive controls, **default behaviour unchanged (full context)**:

- **Summary mode (opt-in button).** `chat.build_context(full=False)` already emits
  aggregates-only (account + per-campaign + daily totals, no per-row dump). Exposed via
  `ChatRequest.context_mode` ("full" default | "summary"). The web **AI Chat** header has
  a "Summary mode: OFF/ON" toggle (default OFF = full, as before). Live: full **$0.045**
  vs summary **$0.0023** per turn (~19x cheaper input), and faster.
- **Session context cache** (`apps/ai-layer/ai_layer/context_cache.py`). Builds the
  snapshot once per `session_id` (TTL 30m, in-memory, bounded), reuses it byte-identical
  across turns: no per-turn refetch/rebuild, and a stable system prefix so **Gemini 2.5
  Flash implicit caching** (automatic on OpenRouter, needs a >=1024-token identical
  prefix with the question pushed last — verified vs OpenRouter docs) discounts the
  repeated prefix on turns 2+. The web client generates a `session_id` per chat and echoes
  the one returned each turn. Live: turn 2 returned `cached:true`.
  - **Ledger caveat:** the Python cost ledger bills static price x prompt_tokens, so it
    does NOT yet credit the implicit-cache input discount (our number is an upper bound;
    OpenRouter's actual bill is lower on cached turns). Summary mode's saving IS reflected
    (fewer tokens). Multi-worker deploys need a shared cache (SQLite/Redis) — documented.

Wiring: `ChatRequest` +context_mode/+session_id, `ChatResponse` +session_id/+context_mode/
+cached; apps/api `fetchAiLayerChat` + `/ai-layer/chat` thread both through and echo back;
the AI Chat component adds the toggle + per-session id + a mode/cached footer. Tests:
ai-layer **+9** (context_cache unit + build-once integration + summary-leaner), apps/api
chat route **+1** (summary/session forwarding). Verified: ai-layer **47 pass**, apps/api
`tsc` 0 + **408 tests** + `madge` 0 cycles, apps/web prod build green.

## Real OpenRouter cost + Refresh button [DONE 2026-06-13]

**Ledger now bills OpenRouter's authoritative cost.** OpenRouter returns `usage.cost`
(real USD, already net of prompt-cache discounts) and `usage.cost_details.cache_discount`
in every response (the `usage:{include:true}` flag is deprecated/auto-on; verified vs
OpenRouter docs). `chat._record_cost` reads them off the usage object (OpenAI SDK keeps
unknown fields via `extra='allow'`; falls back to `model_extra`) and passes them to
`cost_ledger.record(cost_usd_actual=, cache_discount_usd=)`, which records the real cost
tagged `priced="openrouter"` (+ `cache_discount_usd` when present). If the provider omits
cost we fall back to the static estimate (`priced="estimated"`) so nothing is lost. Live:
a chat turn recorded `priced:"openrouter", cost_usd:0.002348`. Note: Gemini implicit
caching is best-effort, so `cache_discount` is only populated on turns the provider
actually discounts (often null) — but the recorded `cost` is always the true charge.

**Refresh button = the only live pull; everything else reads the cache.** New
`POST /ai-layer/refresh` (`{account_id?, demo?}`) → `ingestAiLayer` → ai-layer `/ingest`
(live Meta pull, UPSERT into the store). After it returns the store holds the latest
numbers, so the normal cached reads (`/insights` source=store, `/chat` session cache) are
fresh. Until pressed, cached data is used. Web: a **Refresh** button (spinner, `refresh-cw`)
on the **AI Layer Insights** card (so it's on Brain/Analytics/Dashboard) reloads the cards
after refresh; on **AI Chat** it ingests, starts a new `session_id` (next turn rebuilds
from the fresh store), and drops a "↻ Refreshed with live data through <date> (N rows)"
note. Demo-aware (dev creds). Live: refresh returned `refreshed:true, rowsUpserted:1193,
until:2026-06-12` in ~54s (a real live pull — hence the spinner/disabled state).

Tests: ai-layer **+3** (cost-ledger estimate-vs-actual, total mixes both); apps/api chat
route **+5** (refresh: auth, no-token, ingest, demo, degrade). Verified: ai-layer **50
pass**, apps/api `tsc` 0 + **413 tests** + route-suite **19** + `madge` 0 cycles, apps/web
prod build green.

## Streaming chat, markdown, 3-tab Gemini migration, analytics graphs [DONE 2026-06-13]

A batch of UX + migration work, all routing LLM through the **Python ai-layer / OpenRouter
Gemini** (never the dead Anthropic gateway):

- **3 tabs migrated to Python/Gemini** (autopilot, watchdog/briefing, competitor-spy). They
  were dead because the TS gateway runs on Anthropic (no credits). Rather than add OpenRouter
  to the TS gateway, added a generic **`POST /complete`** to the ai-layer (OpenRouter Gemini +
  Python ledger) and a drop-in `createViaAiLayer()` (same opts shape as `createMessage`,
  returns an Anthropic-`Message`-shaped object so `extractText` is unchanged). Swapped the 3
  call sites (`competitor-spy.ts`, `autopilot-engine.ts`, `morning-briefing.ts`) — one
  identifier each; the TS gateway is untouched and still backs the other ~21 callers. Trade-off:
  these 3 bypass the gateway's per-user cap; cost is tracked in the Python ledger instead.
- **Streaming chat.** ai-layer `chat.stream_answer()` + `POST /chat/stream` (StreamingResponse,
  session-cache aware, session/mode/cached in headers). apps/api `POST /ai-layer/chat/stream`
  proxies the stream (Readable.fromWeb) and forwards the headers. The web chat uses `fetch` +
  ReadableStream to render tokens live.
- **Markdown rendering.** Added `marked` + `DOMPurify` to apps/web; assistant bubbles render
  sanitized Markdown (bold/bullets/tables). The chat system prompt now asks for Markdown.
- **Length + token cap.** chat `MAX_TOKENS=1500`; system prompt defaults to **~10 sentences**
  (expand only when asked).
- **Chat persistence.** New root `ChatStateService` (signals + localStorage) holds the
  conversation, session id, and summary toggle — survives tab switches and reloads. Added a
  Clear button.
- **Analytics graphs.** New `fetchAiLayerChartData` + `GET /ai-layer/analytics` (daily series +
  totals from the brain). The Analytics tab now feeds its trend chart + KPI tiles from the
  ai-layer when no Meta account is connected (demo creds), so the graphs render without a login.
  CTR/CPA aren't in the brain totals, so those stay flat. **Dropped the duplicate
  `<app-ai-layer-insights/>` card from Analytics** (kept on Brain + Dashboard).

Verified: ai-layer **51 pytest**, apps/api `tsc` 0 + **413 vitest** + `madge` 0, apps/web prod
build green. Live smoke (all via Python/Gemini): `/complete` → real text ($6.8e-5); demo
`/chat/stream` → streamed Markdown with session headers (`x-context-mode: summary`); demo
`/ai-layer/analytics` → 31 daily points + totals (spend ₹51.99L, ROAS 3.6, 84 campaigns).

> Note: the 3 migrated tabs' *frontend read paths* still show DB/Meta data; the **generation**
> steps now use Gemini, so triggering them (cron / competitor-spy analyze) no longer 400s on
> Anthropic. Anthropic is still dry for the other ~21 TS callers — migrate the gateway itself or
> top up credits when that matters.

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
