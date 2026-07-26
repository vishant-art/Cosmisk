> **Status: ✅ IMPLEMENTED (2026-05-31)** — the llm-gateway rate limiter shipped (commit `1521cce`); see `19_05/rate_limiting/implementation_plan.md` for post-ship status.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Implementation Plan — `services/llm-gateway.ts` (2026-05-02)

## Unique essence preserved

**Shipped artifact (commit `1521cce`):** new file `server/src/services/llm-gateway.ts` (~250 LOC) exposing one function `createMessage({ userId, operation, request })` that every LLM call site uses. It enforces:
1. Per-user daily $ cap before the call (extends `cost_ledger` / `checkDailyLimit` to all 24 sites).
2. Org-wide RPM via `bottleneck` `minTime`.
3. Org-wide ITPM via `bottleneck` weighted reservoir, weight = pre-flight `countTokens` estimate.
4. SDK `maxRetries: 3` reactive retry on 429/5xx.
5. Cost-ledger write after every success from `response.usage` × per-model price.
6. Clean app-level 429 mapping when SDK retries exhausted.
- Final assertion: `rg "new Anthropic\(" server/src/` returns exactly one hit (the gateway).

**PRICING (cents per 1M tokens; src `anthropic_rate_limits.md` + `shared/models.md`):**
- `opus-4-7` & `opus-4-6`: in 500, out 2500, cacheWrite 625, cacheRead 50
- `sonnet-4-6`: in 300, out 1500, cacheWrite 375, cacheRead 30
- `haiku-4-5`: in 100, out 500, cacheWrite 125, cacheRead 10

**LIMITS_BY_TIER (rpm / itpm / otpm):** Tier1 sonnet & opus {50 / 30_000 / 8_000}, haiku {50 / 50_000 / 10_000}; Tier2 all {1000 / 450_000 / 90_000}; Tier3/4 elided. `config.anthropicTier` default 1.

**DAILY_COST_LIMITS (cents; lifted from `job-queue.ts:23-30`):** free 500, solo 5_000, growth 20_000, agency 100_000; `DEFAULT_DAILY_LIMIT` 1_000.

**Client/limiters:** `new Anthropic({ maxRetries: 3, timeout: 600_000 })`. One Bottleneck per model class (sonnet/opus/haiku), `maxConcurrent: 5`, `reservoirRefreshInterval: 60_000`. `modelClass()` via startsWith.

**Errors:** `DailyCapExceededError` → 429 `daily_llm_cap`; `UpstreamRateLimitedError` → 429 `upstream_rate_limited` (`retryAfterSeconds`, default 60). Mapped once in `index.ts` `setErrorHandler`.

**Error-mapper body contracts (from §4 line 238; mapped once in `index.ts` `setErrorHandler`):**
- `DailyCapExceededError → 429 { error: 'daily_llm_cap', current_cents, cap_cents, resets_at }`
- `UpstreamRateLimitedError → 429 { error: 'upstream_rate_limited', retry_after_seconds }`

**24 migrated call sites (from `findings.md` §1):**
- Services (10): `audit-agent.ts:506`, `agent-memory.ts:123`, `ad-watchdog.ts:245`, `content-agent.ts:151`, `autopilot-engine.ts:238`, `creative-strategist.ts:98`, `report-agent.ts:159`, `morning-briefing.ts:251`, `sprint-planner.ts:241,447`, `sales-agent.ts:416`.
- Routes (8): `ai.ts:327,391`, `competitor-spy.ts:94`, `content.ts:325,617`, `creative-studio.ts:70,300,393`, `google-ads.ts:199`, `reports.ts:570`, `score.ts:126,221`, `tiktok-ads.ts:266`.
- Bootstrap: `index.ts:643`.
- Routes pass `request.user.id` (JWT plugin); cron services read userId from job context (`sprint.user_id`, `brand.user_id`).

**Model-string fixes in same commit set (`findings.md` §4):** `audit-agent.ts:506`, `index.ts:643`, `creative-studio.ts:300` — all `claude-sonnet-4-20250514` → `claude-sonnet-4-6`.

**Other files touched:**
- `config.ts`: add `anthropicTier` (env `ANTHROPIC_TIER`, default 1) + optional `llmDailyUsdCapOverride`.
- `job-queue.ts`: replace local `DAILY_COST_LIMITS`/`getDailySpendCents`/`getUserDailyLimit`/`checkDailyLimit` with imports from `llm-gateway.ts`.
- `claude-helpers.ts`: left alone (only exports `extractText`).
- `package.json`: add `bottleneck` `^2.19.5`.
- `db/schema.ts`: no change for v1 — `cost_ledger(user_id, created_at)` index is a separate task (`suggested.md` Phase 1.1).

**Decisions / rationale:**
- SDK 0.78 does not surface response headers → `anthropic-ratelimit-*` header logging skipped in v1.
- `@anthropic-ai/sdk` v0.78 several versions behind — flagged, out of scope.
- Cost-cap semantics: default = **pooled** (provider-agnostic, matches existing behavior).
- Pre-flight `countTokens` adds 50–200 ms; heuristic alternative `max_tokens * 1.2 + chars/3.5`.
- Gemini parity optional: `audit-agent.ts:480` (`analyzeWithGemini`) + `visual-analyzer.ts`; Gemini free-tier RPM 15 for `gemini-1.5-flash`, `cost_cents=0` for free-tier Flash.

**Rollout order:** land gateway+tests (no consumers) → switch `morning-briefing.ts` cold path first (watch 24h) → 9 services → 8 routes (`ai.ts` last) → `index.ts:643`. Each step independently revertable.

**Manual verification procedures (§8):**
- **Cap:** insert a `cost_ledger` row just under the free-tier $5 cap (free=500 cents); next call returns the `daily_llm_cap` 429.
- **Burst:** 60 `POST /ai/chat` in 5s → first ~5 land immediately, rest queue, none 500 (validates Bottleneck `minTime`/`maxConcurrent=5`).
- **Upstream-429 trick:** set `ANTHROPIC_TIER=0` (synthetic, below tier 1) so the local reservoir under-counts and a real Anthropic 429 eventually fires → SDK retries (3) → if still 429, gateway maps to the `upstream_rate_limited` 429 (exercises SDK-retry-exhausted → `UpstreamRateLimitedError` path).

**Tests** (`server/src/__tests__/llm-gateway.test.ts`, Vitest, mocked SDK, no live network): cost_ledger row per call; `DailyCapExceededError` gate (cap reads `users.plan`); bottleneck weight = `countTokens`; ITPM reservoir release at 60s tick (fake timers); SDK `RateLimitError` → `UpstreamRateLimitedError`; route 429 mapping; `maxRetries` override propagation; model-class routing (`opus-4-7` + `opus-4-6` share Opus limiter, `sonnet-4-6` uses Sonnet limiter).

## Pointer
- IMPLEMENTED → see: SHIPPED commit `1521cce`; `19_05/rate_limiting/implementation_plan.md` (post-ship status).
