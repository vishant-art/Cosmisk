> **Status: 📖 REFERENCE (2026-05-31)** — post-ship snapshot of residual LLM call sites/bypasses.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Rate-limiting — Findings — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/findings.md` (2026-05-02). Original enumerated 24 call sites across 20 files + 19 client instantiations; **most now wrapped** by the gateway shipped in commit `1521cce`. This refresh records residual call sites and bypasses.

## Unique essence preserved

### 1. Current LLM usage
- **Direct `new Anthropic(...)`: 3 remain (was 19)** — `services/llm-gateway.ts` (canonical, 1); `services/competitor-creative-intel.ts` (bypass, 2,614 LOC, multiple expected); `services/comment-mining-agent.ts` (bypass, 1,818 LOC).
- **Direct `@anthropic-ai/sdk` imports:** competitor-creative-intel.ts, comment-mining-agent.ts, `services/build-gate.ts`, llm-gateway.ts (canonical), `utils/claude-helpers.ts` (re-exports types? — needs inspection). build-gate.ts + claude-helpers.ts import SDK but unclear if they instantiate — **inspect both before adding the CI guard.**
- **20 files use gateway `createMessage`.** Routes: ai, competitor-spy, content, creative-engine, creative-studio, google-ads, reports, score, tiktok-ads. Services: ad-watchdog, agent-memory, autopilot-engine, content-agent, creative-strategist, job-queue, morning-briefing, report-agent, sales-agent, sprint-planner. Plus `audit/audit-agent.ts` + bootstrap `index.ts`.

### 2. Daily-cost gate (duplicated)
- `services/job-queue.ts` → `checkDailyLimit`: pre-gateway gated only creative job dispatch; still present, should be deduplicated.
- `services/llm-gateway.ts` → `checkDailyLimit` (NEW): canonical; reads `cost_ledger`, applies plan-tier daily cap.
- Two cap checks for the same ledger — pick one (recommend gateway's). See implementation_plan.md §2.4.

### 3. Rate limiting (NEW since 2026-05-02)
- Gateway uses `bottleneck`: **RPM** `minTime = 60000 / RPM` per model class; **ITPM** weighted reservoir, weight = pre-flight `countTokens` estimate.
- Limits per model class per tier from `anthropic_rate_limits.md`. Default tier `1` unless `ANTHROPIC_TIER` env set.
- **No rate limiting on the 3 bypass paths** (run with account-wide concurrency).

### 4. Retry / backoff / circuit breaker
- Gateway calls: SDK `maxRetries: 3` (429/5xx, respects `retry-after`).
- Bypass calls (competitor-creative-intel, comment-mining-agent): **no retry, no backoff, no CB.**
- Non-Anthropic fetches: `safeFetch` has timeout + AbortController, no retry/CB. **Risk C still applies** for non-Anthropic outbound (Meta, Google, Shopify, n8n, Stripe, Razorpay, Resend, ElevenLabs, Heygen, Kling, Creatify, Flux, NanoBanana).

### 5. Model-string audit
- 3 deprecated date-suffixed aliases (e.g. `claude-sonnet-4-20250514`). Gateway `PRICING` uses canonical names (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`) but wrap calls pass caller-specified strings — **caller-side cleanup required in all 20 wrapped files** (one line per call site).
- M1-window greps:
```sh
grep -rE "claude-(sonnet|opus|haiku)-[0-9]{1,2}-[0-9]{8}" server/src --include='*.ts'
grep -rE "model:\s*['\"]claude-" server/src --include='*.ts'
```

### 6. Versioning
- `@anthropic-ai/sdk@^0.78.0` unchanged · `bottleneck@^2.19.5` added by gateway commit · `@fastify/rate-limit@^10.3.0` unchanged (protects HTTP routes RPM per IP, not LLM RPM).

## Cited & kept (referenced elsewhere)
- **§7 Open finding — gateway `userId` required (3 corner cases)** — operator-script principal handling for the gateway, related to options.md §2.2 cited by 23_05/module_inventory.md:165:
  1. **Operator scripts** — no `userId` from request context. See implementation_plan.md §2.2.
  2. **Cron schedules** — same problem; some pass a "system" userId, some don't. Audit each of the **13 cron sites**.
  3. **Boot-time work** — `seedReviewerAccount` etc. has no userId. Use reserved sentinel `system:boot`.

## Pointer
- DURABLE_REFERENCE -> see: rate-limit findings (this folder's README / anthropic_rate_limits.md / options.md / implementation_plan.md). SHIPPED rate limiter = commit 1521cce.
