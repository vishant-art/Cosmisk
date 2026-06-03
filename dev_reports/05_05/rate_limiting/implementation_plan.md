> **Status: ✅ IMPLEMENTED (2026-05-31)** — the llm-gateway rate limiter shipped (commit `1521cce`); see `19_05/rate_limiting/implementation_plan.md` for post-ship status.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Implementation Plan — `services/llm-gateway.ts` (2026-05-02)

What Track B does, file by file. **Not yet executed.** Owner approval gates this per `CLAUDE.md` and the open questions in § 9.

---

## 1. Goal

A single function — `createMessage({ userId, operation, request })` — that every LLM call site in the server uses. It enforces:

1. **Per-user daily $ cap** before the call (extending `cost_ledger` / `checkDailyLimit` to all 24 sites).
2. **Org-wide RPM** via `bottleneck` `minTime`.
3. **Org-wide ITPM** via `bottleneck` weighted reservoir, weight = pre-flight `countTokens` estimate.
4. **Reactive retry on 429/5xx** via the SDK's `maxRetries: 3`.
5. **Cost-ledger write** after every successful call, computed from `response.usage` × per-model price.
6. **Clean app-level 429 mapping** when the SDK's retries are exhausted.

By the end of Track B, `grep -r "new Anthropic" server/src` returns exactly one hit (the gateway).

---

## 2. New file: `server/src/services/llm-gateway.ts` (~250 LOC)

Sketch — final shape decided during implementation; this is the design contract.

```ts
// server/src/services/llm-gateway.ts
import Anthropic from '@anthropic-ai/sdk';
import Bottleneck from 'bottleneck';
import { config } from '../config.js';
import { getDb } from '../db/index.js';
import { logger } from '../utils/logger.js';

// ---- Pricing (cents per 1M tokens) ----
// Source: dev_reports/rate_limiting/anthropic_rate_limits.md and shared/models.md
const PRICING = {
  'claude-opus-4-7':   { in: 500, out: 2500, cacheWrite: 625, cacheRead: 50 },
  'claude-opus-4-6':   { in: 500, out: 2500, cacheWrite: 625, cacheRead: 50 },
  'claude-sonnet-4-6': { in: 300, out: 1500, cacheWrite: 375, cacheRead: 30 },
  'claude-haiku-4-5':  { in: 100, out: 500,  cacheWrite: 125, cacheRead: 10 },
} as const;

// ---- Tier-driven Anthropic limits per model class ----
// shared with anthropic_rate_limits.md § 2
const LIMITS_BY_TIER: Record<number, Record<ModelClass, { rpm: number; itpm: number; otpm: number }>> = {
  1: { sonnet: { rpm: 50,   itpm: 30_000,    otpm: 8_000   },
       opus:   { rpm: 50,   itpm: 30_000,    otpm: 8_000   },
       haiku:  { rpm: 50,   itpm: 50_000,    otpm: 10_000  } },
  2: { sonnet: { rpm: 1000, itpm: 450_000,   otpm: 90_000  },
       opus:   { rpm: 1000, itpm: 450_000,   otpm: 90_000  },
       haiku:  { rpm: 1000, itpm: 450_000,   otpm: 90_000  } },
  3: { /* … */ },
  4: { /* … */ },
};

type ModelClass = 'sonnet' | 'opus' | 'haiku';
function modelClass(model: string): ModelClass { /* startsWith match */ }

// ---- Plan-tier daily caps in cents ----
// Lifted from services/job-queue.ts:23-30
export const DAILY_COST_LIMITS: Record<string, number> = {
  free: 500, solo: 5_000, growth: 20_000, agency: 100_000,
};
const DEFAULT_DAILY_LIMIT = 1_000;

// ---- Shared client ----
const client = new Anthropic({
  apiKey: config.anthropicApiKey,
  maxRetries: 3,            // 429/5xx auto-retry, respects retry-after
  timeout: 600_000,         // 10 min — same as SDK default; explicit for clarity
});

// ---- Limiter per model class ----
const tier = config.anthropicTier ?? 1;
const limiters: Record<ModelClass, Bottleneck> = {
  sonnet: new Bottleneck({
    minTime: 60_000 / LIMITS_BY_TIER[tier].sonnet.rpm,
    reservoir: LIMITS_BY_TIER[tier].sonnet.itpm,
    reservoirRefreshAmount: LIMITS_BY_TIER[tier].sonnet.itpm,
    reservoirRefreshInterval: 60_000,
    maxConcurrent: 5,
  }),
  // opus, haiku same shape …
};

// ---- Cost-ledger helpers (lifted from job-queue.ts) ----
export function getDailySpendCents(userId: string): number { /* same as job-queue.ts */ }
export function getUserDailyLimit(userId: string): number { /* same */ }
export function checkDailyLimit(userId: string): { allowed: boolean; spent: number; limit: number; remaining: number } { /* same */ }

interface CostLedgerInsert {
  userId: string;
  operation: string;
  apiProvider: 'anthropic' | 'gemini';
  costCents: number;
  metadata: Record<string, unknown>;
}
function recordCost(row: CostLedgerInsert): void { /* INSERT INTO cost_ledger */ }

// ---- Public API ----
export interface CreateMessageOptions {
  userId: string;
  operation: string;
  request: Anthropic.MessageCreateParams;
  /** Override SDK default maxRetries for this call (e.g., 5 for cron). */
  maxRetries?: number;
  /** Skip pre-flight countTokens — use heuristic. */
  estimateTokens?: number;
}

export async function createMessage(opts: CreateMessageOptions): Promise<Anthropic.Message> {
  // 1. Per-user cap
  const cap = checkDailyLimit(opts.userId);
  if (!cap.allowed) {
    throw new DailyCapExceededError(cap);   // routes map to 429
  }

  // 2. Pre-flight token estimate (or heuristic)
  const inputTokens = opts.estimateTokens
    ?? (await client.messages.countTokens(opts.request)).input_tokens;

  // 3. Rate-limited dispatch
  const cls = modelClass(opts.request.model);
  let response: Anthropic.Message;
  try {
    response = await limiters[cls].schedule(
      { weight: inputTokens, priority: 5 },
      () => client.messages.create(opts.request, { maxRetries: opts.maxRetries }),
    );
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      throw new UpstreamRateLimitedError(err); // routes map to 429 with retry-after
    }
    throw err;
  }

  // 4. Cost ledger
  const cost = computeCostCents(opts.request.model, response.usage);
  recordCost({
    userId: opts.userId, operation: opts.operation,
    apiProvider: 'anthropic', costCents: cost,
    metadata: { model: opts.request.model, usage: response.usage },
  });

  // 5. Optional: log anthropic-ratelimit-* headers at debug
  // (response object does not surface headers in 0.78; skip in v1)

  return response;
}

export class DailyCapExceededError extends Error {
  constructor(public cap: ReturnType<typeof checkDailyLimit>) { super('daily_llm_cap'); }
}
export class UpstreamRateLimitedError extends Error {
  retryAfterSeconds: number;
  constructor(public cause: Anthropic.RateLimitError) {
    super('upstream_rate_limited');
    this.retryAfterSeconds = /* parse from cause.headers if available, default 60 */;
  }
}
```

---

## 3. Migration of the 24 call sites

Each site changes the same way. Worked example using `services/creative-strategist.ts:98`:

**Before:**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

async function suggestAngles(brief: string, userId: string) {
  const response = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    messages: [{ role: 'user', content: brief }],
  });
  return response;
}
```

**After:**

```ts
import { createMessage } from './llm-gateway.js';

async function suggestAngles(brief: string, userId: string) {
  return createMessage({
    userId,
    operation: 'creative-strategist.suggestAngles',
    request: {
      model: 'claude-opus-4-6',
      max_tokens: 16000,
      messages: [{ role: 'user', content: brief }],
    },
  });
}
```

The full list (paths + lines from `findings.md` § 1):

**Services (10 files):** `audit-agent.ts:506`, `agent-memory.ts:123`, `ad-watchdog.ts:245`, `content-agent.ts:151`, `autopilot-engine.ts:238`, `creative-strategist.ts:98`, `report-agent.ts:159`, `morning-briefing.ts:251`, `sprint-planner.ts:241,447`, `sales-agent.ts:416`.

**Routes (8 files):** `ai.ts:327,391`, `competitor-spy.ts:94`, `content.ts:325,617`, `creative-studio.ts:70,300,393`, `google-ads.ts:199`, `reports.ts:570`, `score.ts:126,221`, `tiktok-ads.ts:266`.

**Bootstrap:** `index.ts:643` (1 site).

**Routes pass `request.user.id`** (already on the Fastify request from the JWT plugin).
**Cron-driven services** read the user id from the job context (e.g. `sprint.user_id`, `brand.user_id`). All 10 services already have a `userId` parameter or job row in scope — no signature change needed beyond the `operation` string.

**Model-string fix in the same commit set** (per `findings.md` § 4):

| File | Line | From | To |
|---|---|---|---|
| `audit-agent.ts` | 506 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| `index.ts` | 643 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| `creative-studio.ts` | 300 | `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |

---

## 4. Other files touched

| File | Change |
|---|---|
| `server/src/config.ts` | Add `anthropicTier: number` (env `ANTHROPIC_TIER`, default 1). Add optional `llmDailyUsdCapOverride: number \| null`. |
| `server/src/services/job-queue.ts` | Replace local `DAILY_COST_LIMITS`, `getDailySpendCents`, `getUserDailyLimit`, `checkDailyLimit` with `import` from `llm-gateway.ts`. Single existing caller (the queue itself) keeps working. |
| `server/src/utils/claude-helpers.ts` | Leave alone — only exports `extractText`, no logic to fold in. |
| `server/package.json` | Add `"bottleneck": "^2.19.5"` to `dependencies`. |
| `server/src/db/schema.ts` | **No change** for v1. Index on `cost_ledger(user_id, created_at)` is a separate task, already on Phase 1.1 of `suggested.md`. |
| Routes that surface 429 to clients | Add an error mapper at the Fastify error-handler level: `DailyCapExceededError` → `429 { error: 'daily_llm_cap', current_cents, cap_cents, resets_at }`; `UpstreamRateLimitedError` → `429 { error: 'upstream_rate_limited', retry_after_seconds }`. Single change in `index.ts` `setErrorHandler`. |

---

## 5. Gemini parity (optional, recommended)

If owner approves expanding scope (open question § 9.4):

- `server/src/audit/audit-agent.ts:480` — `analyzeWithGemini`. Wrap in `createMessageGemini({ userId, operation, request })` that:
  - Calls `checkDailyLimit` (shared cap with Anthropic — open question whether the cap is per-provider or pooled).
  - Has its own simple `Bottleneck` (Gemini free-tier RPM is 15 for `gemini-1.5-flash`, very strict). One limiter, no model-class split.
  - Writes `cost_ledger` with `api_provider='gemini'`, `cost_cents=0` for free-tier Flash, otherwise pricing from Google's docs.
- `server/src/services/visual-analyzer.ts` — same wrap.

If owner declines, Gemini stays as-is and the cost ceiling continues to leak there. Document the gap in this folder and revisit.

---

## 6. Tests (`server/src/__tests__/llm-gateway.test.ts` — new file)

Vitest is already installed. Mock the SDK with `vitest`'s module mocking; do not call the real Anthropic API.

| Test | What it verifies |
|---|---|
| `creates one cost_ledger row per successful call` | Cost write happens after the SDK returns; cents math matches `response.usage` × `PRICING`. |
| `denies with DailyCapExceededError when cost_ledger today >= cap` | Pre-call gate works. Cap reads `users.plan`. |
| `weights bottleneck job by countTokens result` | Mock `countTokens` to return 50_000; assert `limiter.schedule` was called with `weight: 50_000`. |
| `releases ITPM reservoir at 60s tick` | Two large calls in row exceed reservoir; second one waits ~60s. Use Vitest fake timers. |
| `wraps SDK RateLimitError as UpstreamRateLimitedError` | Mock SDK to throw after exhausting retries; gateway throws app error with `retryAfterSeconds`. |
| `route 429 mapping` | Integration: hit a route, capped user → response status 429, body matches contract. |
| `cron path with elevated maxRetries override` | `createMessage({ ..., maxRetries: 5 })` propagates to SDK call. |
| `model-class routing` | `claude-opus-4-7` and `claude-opus-4-6` share the Opus limiter; `claude-sonnet-4-6` uses the Sonnet limiter. |

No live network. Unit suite must pass before any call site is migrated.

---

## 7. Rollout order

1. **Land the gateway + tests** (no consumers yet). Merge.
2. **Switch one cold path first** — `services/morning-briefing.ts` (cron, low traffic, owner-only). Watch logs / `cost_ledger` for 24 h.
3. **Switch the other 9 services** in one PR (services are easier to test in isolation than routes).
4. **Switch the 8 routes** — one PR per route or grouped. Highest-traffic one (`routes/ai.ts`) last.
5. **Switch the inline `index.ts:643` site**, simultaneously moving the endpoint into a proper route module per `suggested.md` Phase 5 (optional — can stay inline).
6. **Final assertion:** `rg "new Anthropic\(" server/src/` returns exactly one hit (`services/llm-gateway.ts`).

Each step is independently revertable.

---

## 8. Verification (end-to-end, repeat from approved plan)

1. **Boot.** `npm --prefix server run dev` — server starts; gateway logs resolved tier and reservoir sizes.
2. **Smoke.** `POST /ai/chat` with valid JWT → one row in `cost_ledger`; debug log shows model class and inputTokens estimate.
3. **Burst.** Script firing 60 `POST /ai/chat` in 5 s → first batch ~5 lands immediately, the rest queue, none 500. Bottleneck queue depth visible in logs.
4. **Cap.** Insert a `cost_ledger` row that puts a test user just under the free-tier $5 cap → next call returns `429 { error: 'daily_llm_cap', current_cents, cap_cents, resets_at }`.
5. **Upstream-429.** Set `ANTHROPIC_TIER=0` (synthetic; below tier 1) so the local reservoir under-counts and we eventually trigger a real Anthropic 429 → SDK retries (3) → if still 429, gateway maps to `429 { error: 'upstream_rate_limited', retry_after_seconds }`.
6. **Unit tests.** `npm --prefix server test -- llm-gateway` passes the suite from § 6.
7. **Migration assertion.** `rg "new Anthropic\(" server/src/` → 1 result.

---

## 9. Open questions (to confirm with owner before § 7 starts)

1. **Track A vs Track B handoff.** This document is research. Per `CLAUDE.md`: "After an audit, analysis, or written plan, STOP and wait for explicit user approval before touching any code." The gateway implementation is gated on an explicit go.
2. **Anthropic Console tier.** Need the actual tier (1/2/3/4) so reservoir values are correct. Defaulting to 1 is safe but throttles aggressively if we are higher.
3. **Pre-flight `countTokens`.** It's a separate (free, but billed-call-shaped) request that adds 50–200 ms latency. Acceptable, or use a heuristic (`max_tokens * 1.2 + chars/3.5`) and reconcile post-hoc against `response.usage`?
4. **Gemini scope.** Apply the same cost-ledger gate to Gemini's 2 sites (recommended), or Anthropic-only and file a follow-up?
5. **Cost cap semantics — per-provider or pooled.** If a user spends $4 on Anthropic and $2 on Gemini, are they at $6 (over the free-tier $5 cap) or have they used $4 of the $5 cap on Anthropic and $2 of $5 on Gemini independently? Today the table is provider-agnostic. Default = pooled (matches today's behavior).
6. **`@anthropic-ai/sdk` upgrade.** v0.78 is several versions behind. Out of scope for this work but the gateway is the natural integration point — flag and schedule.
