> **Status: 📖 REFERENCE (2026-05-31)** — post-ship status of the gateway plus residual wrap work; design reference.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Implementation Plan — `services/llm-gateway.ts` — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/implementation_plan.md` (2026-05-02)

## Unique essence preserved

### What's done (gateway SHIPPED, commit `1521cce`)
- Lives at `server/src/services/llm-gateway.ts`:
  - `client = new Anthropic({ apiKey, maxRetries: 3, timeout: 600_000 })`
  - Per-model-class `bottleneck` limiters (sonnet, opus, haiku) — RPM `minTime` + ITPM `reservoir`.
  - `cost_ledger` helpers: `getDailySpendCents`, `getUserDailyLimit`, `checkDailyLimit`, `recordCost`.
  - Public API `createMessage({ userId, operation, request })` → throws on 429 (cap breach) or 5xx (retries exhausted).
- Tests: `server/src/__tests__/llm-gateway.test.ts` (357 lines) — cost-ledger write, cap enforcement, model-class routing.
- **20 call sites wrapped** (grep `import.*llm-gateway`): audit/audit-agent.ts, index.ts, routes/{ai,competitor-spy,content,creative-studio,google-ads,reports,score,tiktok-ads}.ts, services/{ad-watchdog,agent-memory,autopilot-engine,content-agent,creative-strategist,job-queue,morning-briefing,report-agent,sales-agent,sprint-planner}.ts.

### Gaps (remaining wrap work)
- **§2.1 Two services still bypass** the gateway (detector `grep -l "new Anthropic\b" ... | grep -v __tests__`): `services/competitor-creative-intel.ts` (2,614 LOC), `services/comment-mining-agent.ts` (1,818 LOC). Each called from >=1 route + >=1 operator script. Wrapping = replace `new Anthropic` with `createMessage`, plumb `userId`/`operation` (routes → `request.user.id`; scripts → `operator:<name>`), add smoke test first.
- **§2.3 CI grep guards (NOT yet added)** — add to `.github/workflows/ci.yml` after §2.1:
  - G1: `! grep -rE "new Anthropic\b" server/src --include='*.ts' | grep -v __tests__ | grep -v services/llm-gateway.ts`
  - G4: `! grep -rE "import .* from ['\"]@anthropic-ai/sdk['\"]" server/src --include='*.ts' | grep -v __tests__ | grep -v services/llm-gateway.ts`
- **§2.4 Daily-cap duplication** — `services/job-queue.ts` has its own `checkDailyLimit` predating the gateway. Recommend unify to gateway's canonical version.
- **§2.5 Gemini sibling gateway** — deferred (Track B); ~12 Gemini call sites (estimate, needs recount), ~1 day, deferred until S3 closes.

### Open questions (refreshed)
- Q1 — operator scripts Path A (synthetic principal) vs Path B (bypass flag)? **Pending owner.**
- Q2 — delete `job-queue.ts` `checkDailyLimit` for gateway's? **Pending engineering decision.**
- Q3 — Gemini wrapper now or M2? **Recommend defer.**
- Q4 — add CI guards G1/G4 before/after wrapping the two bypass services? **Recommend after** (avoid blocking the wrap PR).

### Remaining effort ~2.5 days
- competitor-creative-intel.ts 1 day · comment-mining-agent.ts 0.5 day · operator-script policy+plumbing 0.5 day · CI grep guards 0.25 day · dedupe job-queue checkDailyLimit 0.25 day.

## Cited & kept (referenced elsewhere)
- **§2.2 Operator-script principal handling** (cited by `23_05/module_inventory.md:165`): `server/scripts/run-client-*.mjs`, `run-pratapsons-intel.mjs`, `setup-pratapsons-client.mjs`, plus 10 `test-*.mjs` call analyst services outside the Fastify request lifecycle and have **no `userId`** — once they exercise wrapped paths the gateway gets `userId: undefined` and treats them as new users (default per-user cap). **Owner gate OG-7:**
  - **Path A (recommended)** — script passes `userId: 'operator:<scriptname>'`; gateway accepts synthetic principal, writes `cost_ledger` rows under that key, applies `OPERATOR_DAILY_LIMIT` env (default $50/day). ~0.5 day. Preserves cap discipline, only changes cap value.
  - **Path B** — script passes `userId: 'operator:bypass'`; gateway short-circuits cap check for that exact value; audit preserved via `cost_ledger` rows, cap is not. ~0.25 day.

## Pointer
- IMPLEMENTED → see: post-ship status of limiter (commit `1521cce`); upstream limit tables/decision matrices in `05_05/rate_limiting/*` and `19_05/rate_limiting/{README,options,findings,anthropic_rate_limits}.md`.
