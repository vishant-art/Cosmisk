# Implementation Plan — `services/llm-gateway.ts` — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/implementation_plan.md` (2026-05-02)

> The gateway has shipped (commit `1521cce`). This refresh: (a) confirms what's done; (b) lists the remaining wrap work; (c) captures the operator-script policy that was unresolved at original writing.

---

## 1. What's done (post-merge)

The gateway lives at `server/src/services/llm-gateway.ts` with the structure described in the original plan:
- `client = new Anthropic({ apiKey, maxRetries: 3, timeout: 600_000 })`
- Per-model-class `bottleneck` limiters (sonnet, opus, haiku) with RPM `minTime` and ITPM `reservoir`.
- `cost_ledger` helpers (`getDailySpendCents`, `getUserDailyLimit`, `checkDailyLimit`, `recordCost`).
- Public API: `createMessage({ userId, operation, request })` → throws on 429 (cap breach) or 5xx (retries exhausted).

Tests: `server/src/__tests__/llm-gateway.test.ts` (357 lines) — exercises cost-ledger write, cap enforcement, model-class routing.

Wrapped call sites (verified by grep on `import.*llm-gateway`):
```
server/src/audit/audit-agent.ts
server/src/index.ts
server/src/routes/ai.ts
server/src/routes/competitor-spy.ts
server/src/routes/content.ts
server/src/routes/creative-studio.ts
server/src/routes/google-ads.ts
server/src/routes/reports.ts
server/src/routes/score.ts
server/src/routes/tiktok-ads.ts
server/src/services/ad-watchdog.ts
server/src/services/agent-memory.ts
server/src/services/autopilot-engine.ts
server/src/services/content-agent.ts
server/src/services/creative-strategist.ts
server/src/services/job-queue.ts
server/src/services/morning-briefing.ts
server/src/services/report-agent.ts
server/src/services/sales-agent.ts
server/src/services/sprint-planner.ts
```

20 files wrapped. Most are routes/services that existed at strategy-write time.

---

## 2. What's NOT done (the gaps)

### 2.1 Two services still bypass the gateway

```
$ grep -l "new Anthropic\b" server/src --include='*.ts' | grep -v __tests__
server/src/services/llm-gateway.ts            ← canonical
server/src/services/competitor-creative-intel.ts   ← bypass (2,614 LOC)
server/src/services/comment-mining-agent.ts        ← bypass (1,818 LOC)
```

Each is called from at least one route and at least one operator script. Wrapping them needs:
- Find every `new Anthropic({...})` (likely multiple per file).
- Replace with `import { createMessage } from './llm-gateway.js'` and call sites updated.
- Plumb `userId` and `operation` from every entry point (routes pass `request.user.id`; scripts pass `operator:<name>` — see § 2.2).
- Add a smoke test before changing logic.

**Effort.** ~1 day for competitor-creative-intel, ~0.5 day for comment-mining-agent.

### 2.2 Operator-script policy

`server/scripts/run-client-*.mjs`, `run-pratapsons-intel.mjs`, `setup-pratapsons-client.mjs`, plus 10 `test-*.mjs` scripts call analyst services from outside the Fastify request lifecycle. They have **no `userId`** today. Once they exercise wrapped code paths, the gateway will receive `userId: undefined` and treat them as new users (subject to default per-user cap).

**Decision needed (owner gate OG-7):**

| Path | What | Effort |
|---|---|---|
| A | Each operator script passes `userId: 'operator:<scriptname>'` to the gateway. Gateway accepts the synthetic principal, writes `cost_ledger` rows under that key, and applies an `OPERATOR_DAILY_LIMIT` env var (default $50/day). | ~0.5 day |
| B | Operator scripts pass `userId: 'operator:bypass'` and the gateway short-circuits the cap check for that exact value. Audit is preserved via `cost_ledger` rows; cap is not. | ~0.25 day |

**Recommend A** — preserves the cap discipline; only changes the cap value.

### 2.3 CI grep guards (not yet added)

```sh
# G1: block direct Anthropic instantiation outside the gateway
! grep -rE "new Anthropic\b" server/src --include='*.ts' | grep -v __tests__ | grep -v services/llm-gateway.ts

# G4: block direct Anthropic SDK imports outside the gateway
! grep -rE "import .* from ['\"]@anthropic-ai/sdk['\"]" server/src --include='*.ts' | grep -v __tests__ | grep -v services/llm-gateway.ts
```

Add to `.github/workflows/ci.yml` after § 2.1 closes.

### 2.4 Daily-cap duplication

`server/src/services/job-queue.ts` still has its own `checkDailyLimit` logic (from before the gateway). The gateway's `checkDailyLimit` is the new canonical. Two options:
- Delete `job-queue.ts`'s version and import the gateway's.
- Keep both, document why (e.g., job-queue runs before the LLM call site is known).

**Recommend** unification: the gateway is the cap; job-queue dispatches to gateway-wrapped functions.

### 2.5 Gemini sibling gateway (deferred)

Original Track B included a Gemini wrapper. Not started. With ~12 Gemini call sites currently (estimate; needs recount), wrapping is ~1 day. Deferred until S3 closes.

---

## 3. Test plan

For each wrap (§ 2.1):

1. Add a smoke test that exercises the public function of the service before the wrap.
2. Wrap the call sites.
3. Re-run the smoke test (behaviour should be identical).
4. Add a new gateway-specific test: feed an over-cap `userId`, expect `429`.

`server/src/__tests__/llm-gateway.test.ts` already has the cost-ledger and cap tests; reuse the fixtures.

---

## 4. Open questions (refreshed)

| ID | Question | Status |
|---|---|---|
| Q1 | Should operator scripts use Path A (synthetic principal) or Path B (bypass flag)? | Pending owner |
| Q2 | Should `job-queue.ts`'s `checkDailyLimit` be deleted in favour of the gateway's? | Pending engineering decision |
| Q3 | Should the Gemini wrapper be built now or deferred to M2? | Recommend defer |
| Q4 | Should the CI grep guards (G1, G4) be added before or after wrapping competitor-creative-intel + comment-mining? | Recommend after — to avoid blocking the wrap PR |

---

## 5. Effort estimate (remaining)

| Item | Effort |
|---|---|
| Wrap `competitor-creative-intel.ts` | 1 day |
| Wrap `comment-mining-agent.ts` | 0.5 day |
| Operator-script policy + plumbing | 0.5 day |
| CI grep guards | 0.25 day |
| Dedupe `job-queue.ts` checkDailyLimit | 0.25 day |
| **Total** | **~2.5 days** |

---

**End of refresh.**
