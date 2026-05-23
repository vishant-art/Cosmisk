# Rate-limiting — Findings — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/findings.md` (2026-05-02)

> The original `findings.md` enumerated 24 call sites across 20 files and 19 client instantiations. **Most of those have been wrapped** by the gateway shipped in commit `1521cce`. This refresh records the residual call sites and bypasses.

---

## 1. Current state of LLM usage

### 1.1 Direct `new Anthropic(...)` instantiations

```
$ grep -l "new Anthropic\b" server/src --include='*.ts' | grep -v __tests__
server/src/services/llm-gateway.ts            ← canonical (1 instantiation)
server/src/services/competitor-creative-intel.ts   ← bypass (2,614 LOC; multiple instantiations expected)
server/src/services/comment-mining-agent.ts        ← bypass (1,818 LOC)
```

**3 instantiations remain.** Pre-gateway count was 19.

### 1.2 Direct `@anthropic-ai/sdk` imports

```
$ grep -l "@anthropic-ai/sdk" server/src --include='*.ts' | grep -v __tests__
server/src/services/competitor-creative-intel.ts
server/src/services/comment-mining-agent.ts
server/src/services/build-gate.ts
server/src/services/llm-gateway.ts                 ← canonical
server/src/utils/claude-helpers.ts                 ← needs inspection (re-exports types?)
```

`build-gate.ts` and `claude-helpers.ts` import the SDK but it's not clear they instantiate. Inspect both before adding the CI guard.

### 1.3 Gateway-wrapped call sites (using `createMessage`)

20 files import from `services/llm-gateway.js`. Routes: ai, competitor-spy, content, creative-engine, creative-studio, google-ads, reports, score, tiktok-ads. Services: ad-watchdog, agent-memory, autopilot-engine, content-agent, creative-strategist, job-queue, morning-briefing, report-agent, sales-agent, sprint-planner. Plus `audit/audit-agent.ts` and the bootstrap `index.ts`.

---

## 2. Existing daily-cost gate (was: 1 path)

| Location | Pre-gateway role | Post-gateway role |
|---|---|---|
| `services/job-queue.ts` → `checkDailyLimit` | Gated only creative job dispatch | Still present; should be deduplicated against the gateway's `checkDailyLimit` |
| `services/llm-gateway.ts` → `checkDailyLimit` (NEW) | n/a | Canonical; reads `cost_ledger`, applies plan-tier daily cap |

Two cap checks for the same ledger. Pick one (recommend the gateway's). See implementation_plan.md § 2.4.

---

## 3. Rate limiting layer (NEW since 2026-05-02)

The gateway uses `bottleneck`:

- **RPM**: `minTime = 60000 / RPM` per model class.
- **ITPM**: weighted reservoir, weight = pre-flight `countTokens` estimate.

Limits per model class per tier from `anthropic_rate_limits.md`. Default tier is `1` unless `ANTHROPIC_TIER` env is set.

Outside the gateway: **no rate limiting on the 3 remaining bypass paths.** They run with whatever Anthropic's account-wide concurrency happens to be.

---

## 4. Retry / backoff / circuit breaker

| Path | State |
|---|---|
| Gateway calls | SDK `maxRetries: 3` (handles 429/5xx, respects `retry-after`) |
| Bypass calls (competitor-creative-intel, comment-mining-agent) | **No retry, no backoff, no CB** |
| External fetches outside Anthropic | Same as pre-gateway: `safeFetch` has timeout + AbortController, but no retry or CB |

Risk C still applies for non-Anthropic outbound (Meta, Google, Shopify, n8n, Stripe, Razorpay, Resend, ElevenLabs, Heygen, Kling, Creatify, Flux, NanoBanana).

---

## 5. Model-string audit

Three deprecated-alias strings cited in the original (`claude-sonnet-4-20250514` and similar date-suffixed forms). Status unchanged: the gateway's `PRICING` table uses the canonical names (`claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`), but the wrap calls still pass whatever the caller specifies. **Caller-side cleanup is required** in each of the 20 wrapped files.

Greps to run during the M1 window:

```sh
grep -rE "claude-(sonnet|opus|haiku)-[0-9]{1,2}-[0-9]{8}" server/src --include='*.ts'
grep -rE "model:\s*['\"]claude-" server/src --include='*.ts'
```

The fix is a one-line per call site once the canonical model is decided.

---

## 6. Versioning

- `@anthropic-ai/sdk@^0.78.0` — unchanged.
- `bottleneck@^2.19.5` — added by the gateway commit.
- `@fastify/rate-limit@^10.3.0` — unchanged; protects HTTP routes only (RPM per IP), not LLM RPM.

---

## 7. Open finding: gateway's `userId` is required

Today every wrapper call passes `userId`. **Three corner cases need handling:**

1. **Operator scripts** — no `userId` from request context. See `implementation_plan.md` § 2.2.
2. **Cron schedules** — same problem; some pass a "system" userId, some don't. Audit each of the 13 cron sites.
3. **Boot-time work** — `seedReviewerAccount` etc. doesn't have a userId. Use a reserved sentinel (`system:boot`).

---

**End of refresh.**
