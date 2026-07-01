> **Status: 📖 REFERENCE (2026-05-31)** — decision matrix behind the shipped rate limiter; retained for rationale.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Options — Decision Matrix (2026-05-02)

How to add LLM rate limiting in front of Anthropic, given cosmisk's posture (single-replica Fastify+SQLite today, Postgres/BullMQ later). The recommendation in §5 is what `implementation_plan.md` executes against (shipped in commit 1521cce).

## 1. The three responsibilities (independent layers)

1. **Reactive backoff on upstream 429/5xx.** SDK covers this; only question = keep default `maxRetries: 2` or raise.
2. **Proactive client-side throttle (RPM + ITPM).** The gap — SDK ships zero of this.
3. **Per-user cost ceiling.** Stop a leaked JWT running up the bill. `cost_ledger` + `checkDailyLimit` already exist for creative jobs; lift to LLM call sites.

## 2. Layer 1 — reactive backoff (SDK)

| Choice | Behavior | Verdict |
|---|---|---|
| **Default `maxRetries: 2`** | SDK retries 429/408/409/5xx twice, exp backoff, respects `retry-after`. | OK floor, thin under burst. |
| **`maxRetries: 3` or `5`** | More retries; worst-case latency bounded by `retry-after` reset header (≤60s typ.). | ✅ **Pick 3.** Fast-fail surfaces user 429 sooner. |
| **Per-request override** | `messages.create(req, {maxRetries})` — bump cron, low for chat. | ✅ v2 polish, not v1. |
| **Disable SDK retry, hand-roll** | Only for custom logic (per-retry metrics). | ❌ Not worth it. |

**Decision: `maxRetries: 3` on gateway singleton client. Per-request overrides deferred.**

## 3. Layer 2 — proactive client-side throttle (5 candidates)

**A — `bottleneck` ✅ PICK.** Established (used by octokit/rest). `minTime: 60_000/RPM` → RPM; `reservoir`/`reservoirRefreshAmount`/`reservoirRefreshInterval` → ITPM; `maxConcurrent` caps inflight. **Weighted jobs** `schedule({weight: estimatedInputTokens}, fn)` reserve ITPM bucket atomically (critical). **Priority queues** 1..9 (cron < chat). **Distributed Redis mode** opt-in, same API, forward-compatible with Phase 3. TS types shipped. Cost: one dep, stable surface.

**B — `p-queue`** ❌ concurrency + interval only, **no weighted jobs** → can't enforce TPM naturally. Loses to bottleneck.

**C — `p-limit`** ❌ concurrency only, no interval/reservoir. Insufficient — primitive at best.

**D — Hand-rolled token bucket** (~80 LOC, per-axis `class TokenBucket {tokens; refillRate; consume(n)}`, pattern from markaicode article). Pros: zero deps, exact control, easy `*-remaining` header feedback. Cons: re-invents timer drift, queue, weighted scheduling, priority, distributed mode. ❌ unless hard no-deps rule.

**E — External proxy (LiteLLM/Helicone/Gateway).** Pros: centralizes RL+cache+retries+observability, language-agnostic, single Anthropic↔Gemini flip point. Cons: new runtime doubles deploy surface for single-replica startup, adds latency, nothing for per-user cost ceiling, harder key rotation. ❌ Overkill; reconsider at 3+ services calling Anthropic from different runtimes.

## 4. Layer 3 — per-user cost ceiling

Already 80% built (`cost_ledger`, `checkDailyLimit`, plan-tier caps in `services/job-queue.ts`). Choice = where helper lives:

| Choice | Verdict |
|---|---|
| Leave in `job-queue.ts`, import into gateway | Spreads cost-ledger contract across two modules. |
| Move into `services/llm-gateway.ts`, re-export from `job-queue.ts` for back-compat with the 1 existing caller | ✅ **Pick.** Gateway = single source of truth for cost-ledger reads/writes. |

429 shape per `final_report.md` §5.4: `{error: 'daily_llm_cap', current_cents, cap_cents, resets_at}`.

## 5. Recommendation — three layers, three tools

| Layer | Tool | Configuration |
|---|---|---|
| Reactive retry on 429/5xx | `@anthropic-ai/sdk` built-in | `new Anthropic({ apiKey, maxRetries: 3 })` — one singleton, owned by gateway |
| Proactive RPM + ITPM | `bottleneck` (new dep) | One `Bottleneck` per model class (Sonnet, Opus, Haiku). `minTime`/`reservoir`/`maxConcurrent` from tier table keyed on `process.env.ANTHROPIC_TIER`. Weighted by pre-flight `countTokens`. |
| Per-user daily $ cap | `cost_ledger` + lifted `checkDailyLimit` | Gateway owns reads (pre-call) + writes (post-call). Shared with `job-queue.ts`. |

**Do NOT add:** external proxy; Redis yet (Bottleneck Redis backend one flag away at Phase 3); hand-rolled token bucket; circuit breaker (`opossum`/`cockatiel` = `suggested.md` Phase 4 across all 13 external providers, not Anthropic-only — adding only here creates inconsistent stack).

## 6. Sequencing within Track B

1. Land gateway with three layers, migrate **24 call sites**. No behavior change for avg user; heavy users see 429 faster (a feature).
2. After a week of metrics, decide: bump `maxRetries` to 5 for cron (per-request override); adopt `*-remaining` header feedback (defensive contraction); add `opossum` once `safe-fetch.ts` Phase 4 greenlit (single breaker for ALL external calls).
3. When Phase 3 (Redis + BullMQ) lands, flip Bottleneck to Redis backend — one-line config.

## 7. Risks of the recommendation

| Risk | Mitigation |
|---|---|
| `bottleneck` dep abandoned | Stable surface. Swap with hand-rolled token bucket — same `schedule({weight}, fn)` shape ~120 LOC. |
| `countTokens` adds 50–200ms/call | Acceptable for non-streaming chat p95; for cron cache prompt-hash→token count 5 min, or use `chars/4` heuristic. Open Q §9.3 in `implementation_plan.md`. |
| In-memory limiter double-counts on multi-replica | Single-replica today (`railway.toml`). Bottleneck Redis backend handles it later. Documented. |
| Gateway becomes god-module | Split at ~400 LOC: `llm-gateway.ts` (API), `llm-gateway/limiters.ts`, `/cost.ts`, `/headers.ts`. Not needed v1. |
| Pre-flight `countTokens` 429s before real call | Same SDK retry path covers it — transparent retry, slight extra latency. |

## Pointer
- DURABLE_REFERENCE -> see: rate-limit decision matrix; `implementation_plan.md` (executes §5, shipped commit 1521cce)
