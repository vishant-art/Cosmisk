# Connector ↔ AI-layer — Persistent Open Issues

**Purpose:** unresolved items that must NOT be lost between sessions. Each stays here **until
resolved**, then is struck through with the resolving commit/PR. Companion to the fact-shape
handover in `DEVIATIONS_FROM_AI_ANALY.md` and the design spec under `docs/superpowers/specs/`.

Last updated: 2026-07-01.

---

## Deferred-by-decision (resolve AFTER fact-shape redesign)

### I1 — Statefulness mismatch (connector stateless vs ai-layer accumulating store)
The ai-layer persists an **accumulating** SQLite store (`store.py`, trailing-window UPSERT). The
connector is **stateless** (fetch-on-demand). Blended/cross-channel metrics from `get_snapshot`
therefore have **no history** unless snapshots are persisted.
- Demo: on-demand live fetch is fine.
- Future: decide whether to persist `UnifiedSnapshot`/`Blended` into the store (or a parallel
  table) for history. **Resolve after fact-shape redesign** (per user direction).

### I2 — Meta ingestion duplicated ×3
`meta_transform`/`meta_live` logic exists in (1) `apps/ai-layer/ai_layer`, (2) `rnd/src`
(byte-identical), (3) `apps/connectors/connectors/meta` (async port → `UnifiedFact`). Costs: ~2×
Meta rate-limit burn when both the ai-layer path and the connector path run; version-drift risk
(all on Graph v23 today). **Resolve after fact-shape redesign.** Tied to OQ4 (dedup
`CampaignDayFact`) and to I7 (Approach C).

## Deployment blockers (must clear before ANY merge to `main` — `main` auto-deploys)

### I3 — ai-layer SQLite store needs a persistent Railway volume
`store.sqlite` + `cost_ledger.jsonl` live in the container's `./data/`. With auto-deploy, every
push **wipes** them: history lost (only ≤30d recoverable; 90-day backfill 500s), cost-cap tracking
resets. **Fix:** provision a Railway volume mounted at `/app/data` (or set `AI_LAYER_STORE_PATH` to
a volume path) before the ai-layer service is deployed.

### I4 — No LLM cap enforcement on the Python path (billing risk)
competitor-spy + two crons call OpenRouter "unbounded by design" — flagged as the #1 sign-off risk.
Violates the architecture rule (no uncapped LLM calls). **Fix:** add a daily-cap check before the
ai-layer goes live in prod.

### I5 — Connector bundling requires build-context change + a Railway dashboard setting
The ai-layer image build context is `apps/ai-layer`; `apps/connectors` is a sibling outside it.
Bundling needs (a) Dockerfile → repo-root context + `COPY apps/connectors apps/connectors` +
`pip install ./apps/connectors .`, **and** (b) the ai-layer Railway service's build-context/root
setting flipped to match. Both must land **atomically**, or auto-deploy crash-loops.

### I6 — ai_analy made 3 TS features depend on a reachable ai-layer
autopilot, competitor-spy, morning-briefing now degrade to non-AI templated content unless the
ai-layer is reachable — but the ai-layer has no Railway service and `AI_LAYER_URL` is empty in
prod. Merging ai_analy to (auto-deploying) `main` ships this regression. **Fix:** stand up the
ai-layer service + set `AI_LAYER_URL`/`AI_LAYER_API_KEY` before/with the merge.

## Readiness gaps (connector)

### I8 — Google Ads not live
`fetch_assets` returns `[]`; live data blocked on developer-token approval (days–weeks). By design
it stays `skipped`/`failed` and the snapshot still returns Meta+Shopify.

### I9 — Shopify never live-smoked
Built from scratch (no prior Python Shopify code); only offline mock tests. Needs one live smoke
before being demo-trusted.

### I10 — Single-tenant credentials on both sides
Connector reads one `.env` set (`BrandRef` overrides account *ids* but not tokens); ai-layer has a
single-token env fallback. Production wants per-brand encrypted tokens (the Neon `*_tokens` tables
already exist on the TS side). Multi-tenant token sourcing + OAuth refresh is unbuilt.

## Future / strategic

### I7 — Approach C: unify into one canonical fact type + None-safe brain
The clean long-term shape: a single semantic fact type (optional/provenance-aware) shared by
ai-layer + connector + rnd, with a None-safe brain, subsuming `CampaignDayFact` and `UnifiedFact`
and resolving I2 + OQ4 at once. Large AI-side change; out of scope for the demo. Revisit post-demo.
