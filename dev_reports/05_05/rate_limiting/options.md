> **Status: 📖 REFERENCE (2026-05-31)** — decision matrix behind the shipped rate limiter; retained for rationale.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Options — Decision Matrix (2026-05-02)

How to add LLM rate limiting in front of Anthropic, given cosmisk's posture (single-replica Fastify+SQLite today, Postgres/BullMQ later).

The recommendation in § 5 is what `implementation_plan.md` then executes against.

---

## 1. The three responsibilities

Any solution has to answer all three. They are independent — picking different tools for different layers is fine.

1. **Reactive backoff on upstream 429/5xx.** The SDK already covers this; the only question is whether to keep the default `maxRetries: 2` or raise it.
2. **Proactive client-side throttle (RPM + ITPM).** Stop blowing through Anthropic's bucket from the cosmisk side. Not provided by the SDK.
3. **Per-user cost ceiling.** Stop a leaked JWT from running up the bill. The `cost_ledger` table and `checkDailyLimit` already exist for creative jobs; needs to be lifted to LLM call sites.

---

## 2. Layer 1 — reactive backoff (SDK)

| Choice | Behavior | Verdict |
|---|---|---|
| **Default `maxRetries: 2`** | SDK retries 429/408/409/5xx twice with exp backoff, respecting `retry-after`. | OK floor, but 2 is thin under burst. |
| **`maxRetries: 3` or `5`** | Same shape, more retries. Each retry waits for `retry-after`, so worst-case latency is bounded by Anthropic's reset header (≤60s typically). | ✅ **Pick 3.** Diminishing returns past that, and we want fast-fail to surface user-visible 429 sooner. |
| **Per-request override** | `client.messages.create(req, { maxRetries: ... })` — bump for cron jobs (latency-tolerant), keep low for user chat. | ✅ Optional polish for v2, not v1. |
| **Disable SDK retry, hand-roll** | Only justified if you need custom logic (e.g., metrics on each retry). | ❌ Not worth it. |

Decision: **`maxRetries: 3` on the gateway's singleton client. Per-request overrides deferred.**

---

## 3. Layer 2 — proactive client-side throttle

This is the gap. The SDK ships zero of this. Five candidates:

### Option A — `bottleneck`

The most established Node.js rate limiter. Production-proven (used by `octokit/rest`, others).

**Fit:**

- `minTime: 60_000 / RPM` → RPM enforcement.
- `reservoir + reservoirRefreshAmount + reservoirRefreshInterval` → ITPM enforcement (pour `inputTokens` worth of "reservoir" per call).
- `maxConcurrent` → cap inflight (defensive against spikes).
- **Weighted jobs** — `limiter.schedule({ weight: estimatedInputTokens }, fn)` lets a 50K-input request reserve 50K of the ITPM bucket atomically. Critical for our use case.
- **Priority queues** — `priority: 1..9`. Cron jobs get lower priority than user-facing chat.
- **Distributed mode** via Redis (Bottleneck connector) — opt-in, same API. Forward-compatible with Phase 3 (BullMQ on Redis).
- TypeScript types ship with the package.

**Cost:** one dependency. Active-ish maintenance (last release a few years back but stable surface).

### Option B — `p-queue`

Simpler. Concurrency + interval limits. **No weighted jobs** — every job costs 1 unit of the queue. Means TPM cannot be enforced naturally; you would have to gate with an additional manual token-counter ahead of `queue.add()`.

**Verdict:** Cleaner code if we *only* needed RPM + concurrency. We need TPM, so it loses to `bottleneck`.

### Option C — `p-limit`

Concurrency only. No interval, no reservoir. Useful as a primitive inside another wrapper, not as the whole solution.

**Verdict:** Insufficient.

### Option D — Hand-rolled token bucket

A `class TokenBucket { tokens; refillRate; consume(n) }` per axis (RPM and ITPM), wrapped in a small queue. ~80 LOC. Article in research (markaicode) shows the pattern.

**Pros:** Zero deps, exact control, easy to feed `*-remaining` headers back into the bucket.

**Cons:** We re-invent timer drift handling, queue semantics, weighted scheduling, priority, distributed mode. Bottleneck has already solved each of these. The "no extra deps" win does not justify it for a production path.

**Verdict:** Only pick this if there is a hard rule against new deps.

### Option E — External proxy (LiteLLM, Helicone, Gateway)

Sidecar that sits between cosmisk and Anthropic, doing rate limiting, caching, retries, and observability.

**Pros:** Centralizes everything, language-agnostic, gives us a single place to flip Anthropic ↔ Gemini.

**Cons:** New runtime to deploy and monitor. Doubles the deploy surface for a single-replica startup. Adds latency. Provides nothing for the per-user cost ceiling we have to build anyway. Out-of-band rotation of API keys becomes harder.

**Verdict:** Overkill for cosmisk's scale. Reconsider when there are 3+ services calling Anthropic from different runtimes.

---

## 4. Layer 3 — per-user cost ceiling

Already 80% built (`cost_ledger`, `checkDailyLimit`, plan-tier caps in `services/job-queue.ts`). The only choice is **where the helper lives** and **how it's invoked**:

| Choice | Verdict |
|---|---|
| Leave in `services/job-queue.ts`, import into the gateway | Works, but spreads the cost-ledger contract across two modules. |
| Move into `services/llm-gateway.ts`, re-export from `job-queue.ts` for back-compat with the 1 existing caller | ✅ **Pick this.** Gateway becomes the single source of truth for cost-ledger writes and reads. |

The 429 response shape is already implied by `final_report.md` § 5.4: `{error: 'daily_llm_cap', current_cents, cap_cents, resets_at}`. Use that.

---

## 5. Recommendation

**Three layers, three tools, no surprises:**

| Layer | Tool | Configuration |
|---|---|---|
| Reactive retry on 429/5xx | `@anthropic-ai/sdk` built-in | `new Anthropic({ apiKey, maxRetries: 3 })` — one singleton, owned by the gateway |
| Proactive RPM + ITPM throttling | `bottleneck` (new dep) | One `Bottleneck` per model class (Sonnet, Opus, Haiku). `minTime`, `reservoir`, `maxConcurrent` from a tier table keyed on `process.env.ANTHROPIC_TIER`. Weighted jobs by pre-flight `countTokens`. |
| Per-user daily $ cap | `cost_ledger` + lifted `checkDailyLimit` | Gateway owns reads (before the call) and writes (after the call). Single source of truth shared with `job-queue.ts`. |

What we explicitly **do not** add:

- No external proxy.
- No Redis (yet — Bottleneck Redis backend is one config flag away when Phase 3 lands).
- No hand-rolled token bucket.
- No circuit breaker (`opossum`/`cockatiel`) — that's `suggested.md` Phase 4 across all 13 external providers, not just Anthropic. Adding it only here creates an inconsistent stack.

---

## 6. Sequencing within Track B

1. Land the gateway with the three layers above and migrate the 24 call sites. **No behavior change** for the average user — they still get responses. Heavy users see 429 faster, which is a feature.
2. After a week of metrics, decide whether to:
   - Bump `maxRetries` to 5 for cron callers (per-request override).
   - Adopt `*-remaining` header feedback into the limiter (defensive contraction).
   - Add `opossum` once `safe-fetch.ts` Phase 4 is greenlit (single circuit-breaker layer for *all* external calls, not just Anthropic).
3. When Phase 3 (Redis + BullMQ) lands, flip Bottleneck to its Redis backend. One-line config change.

---

## 7. Risks of the recommendation

| Risk | Mitigation |
|---|---|
| `bottleneck` dep abandoned | Stable surface. If it ever rots, swap with hand-rolled token bucket — same `schedule({ weight }, fn)` shape is ~120 LOC. |
| `countTokens` adds 50–200ms latency to every call | Acceptable for non-streaming user-chat at p95; for high-volume cron, cache the prompt hash → token count for 5 min, or skip and use `chars/4` heuristic. Open question § 9.3 in `implementation_plan.md`. |
| Limiter is in-memory; multi-replica deploy double-counts | Single-replica today (`railway.toml`). Bottleneck Redis backend handles multi-replica when we get there. Documented. |
| Gateway becomes a god-module | Mitigate by splitting once it crosses ~400 LOC: `llm-gateway.ts` (public API), `llm-gateway/limiters.ts`, `llm-gateway/cost.ts`, `llm-gateway/headers.ts`. Not needed in v1. |
| Pre-flight `countTokens` 429s before the real call | Same SDK retry path covers it. Worst case: transparent retry, slight extra latency. |
