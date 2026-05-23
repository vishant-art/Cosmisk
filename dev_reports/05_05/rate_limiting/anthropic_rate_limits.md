# Anthropic API Rate Limits — Reference (2026-05-02)

What the upstream actually enforces, what headers it returns, and what `@anthropic-ai/sdk` gives us out of the box. Sourced from the official rate-limits page (`platform.claude.com/docs/en/api/rate-limits`) and the SDK README. Cosmisk-specific notes inline.

---

## 1. The three axes

Anthropic limits three things, **per organization, per model class, replenished continuously via a token-bucket algorithm** (not a fixed window):

| Axis | Unit | What counts |
|---|---|---|
| **RPM** | Requests / minute | Every `POST /v1/messages` call, regardless of size |
| **ITPM** | Input tokens / minute | `input_tokens` + `cache_creation_input_tokens`. **`cache_read_input_tokens` does NOT count** on Claude 4.x. (Older models marked `†` in the Anthropic table — Haiku 3.5 — do count cache reads.) |
| **OTPM** | Output tokens / minute | Real output tokens as produced. **`max_tokens` does NOT charge OTPM** unless used. Setting a generous `max_tokens` has no rate-limit downside. |

Important consequence: **prompt caching directly raises effective ITPM**. With an 80% cache-hit rate at Tier 2 (450K ITPM Sonnet 4.x), effective input throughput is ~2.25M tokens/min.

ITPM is **estimated at request start**, then adjusted to actuals during processing. So the limiter must reserve capacity proportional to the estimated input — concrete or pessimistic — rather than waiting for the response.

---

## 2. Tier table (Standard tier; Priority Tier is separate)

Cosmisk's tier is unconfirmed today (open question § 9.2). The defaults below assume Tier 1 unless the owner says otherwise.

### Tier 1 (organizations new to the API)

| Model class | RPM | ITPM | OTPM |
|---|---:|---:|---:|
| Sonnet 4.x (combined Sonnet 4, 4.5, 4.6) | 50 | 30 000 | 8 000 |
| Opus 4.x (combined Opus 4, 4.1, 4.5, 4.6, 4.7) | 50 | 30 000 | 8 000 |
| Haiku 4.5 | 50 | 50 000 | 10 000 |

### Tier 2

| Model class | RPM | ITPM | OTPM |
|---|---:|---:|---:|
| Sonnet 4.x | 1 000 | 450 000 | 90 000 |
| Opus 4.x | 1 000 | 450 000 | 90 000 |
| Haiku 4.5 | 1 000 | 450 000 | 90 000 |

### Tier 3

| Model class | RPM | ITPM | OTPM |
|---|---:|---:|---:|
| Sonnet 4.x | 2 000 | 800 000 | 160 000 |
| Opus 4.x | 2 000 | 800 000 | 160 000 |
| Haiku 4.5 | 2 000 | 1 000 000 | 200 000 |

### Tier 4

| Model class | RPM | ITPM | OTPM |
|---|---:|---:|---:|
| Sonnet 4.x | 4 000 | 2 000 000 | 400 000 |
| Opus 4.x | 4 000 | 2 000 000 | 400 000 |
| Haiku 4.5 | 4 000 | 4 000 000 | 800 000 |

**Limits are independent per model class**, so Sonnet calls do not consume Opus capacity. The combined-Opus / combined-Sonnet rule means Opus 4.6 + Opus 4.7 share a single Opus 4.x bucket. `creative-strategist.ts` and `sprint-planner.ts:241` (the only Opus callers) share that bucket.

---

## 3. Response headers

**Every** Messages API response carries the headers below. They are the live ground truth — the limiter should reconcile against them rather than just trusting its own counter.

| Header | Meaning |
|---|---|
| `anthropic-ratelimit-requests-limit` | Max RPM for this org/model |
| `anthropic-ratelimit-requests-remaining` | RPM left |
| `anthropic-ratelimit-requests-reset` | RFC 3339 timestamp when RPM is fully replenished |
| `anthropic-ratelimit-input-tokens-limit` | Max ITPM |
| `anthropic-ratelimit-input-tokens-remaining` | ITPM left (rounded to nearest thousand) |
| `anthropic-ratelimit-input-tokens-reset` | RFC 3339 ITPM full-replenish time |
| `anthropic-ratelimit-output-tokens-limit` | Max OTPM |
| `anthropic-ratelimit-output-tokens-remaining` | OTPM left (rounded to nearest thousand) |
| `anthropic-ratelimit-output-tokens-reset` | RFC 3339 OTPM full-replenish time |
| `anthropic-ratelimit-tokens-*` | Combined "most restrictive limit" view (used when workspace caps are tighter than org) |
| `anthropic-priority-*` | Priority Tier mirrors of the above (only if on Priority Tier) |
| `retry-after` | Seconds to wait before retrying. Only on `429`. **Earlier retries fail.** |

The SDK exposes raw headers via `.headers` on the response when you opt in (`client.messages.create({ ... }).withResponse()` style or via the raw HTTP response). For our purposes, reading `requests-remaining` / `input-tokens-remaining` after each successful call is enough.

---

## 4. Error shape

429 body (verified via `shared/error-codes.md`):

```json
{
  "type": "error",
  "error": {
    "type": "rate_limit_error",
    "message": "..."
  },
  "request_id": "req_..."
}
```

Maps to `Anthropic.RateLimitError` in the SDK. Always check via `instanceof Anthropic.RateLimitError`, never string-match the message — patterns like `err.message.includes("rate_limit")` are brittle and skip subclassing.

`5xx` and connection errors are also retryable; map to `Anthropic.InternalServerError` and `Anthropic.APIConnectionError`. The SDK retry path covers all of these.

---

## 5. What the SDK gives us for free

From `@anthropic-ai/sdk@0.78` (and forward):

| Capability | API | Default |
|---|---|---|
| Automatic retry on 408/409/429/5xx with exponential backoff that respects `retry-after` | `new Anthropic({ maxRetries: N })` | 2 |
| Per-request retry override | `client.messages.create(req, { maxRetries: N })` | inherited |
| Configurable timeout | `new Anthropic({ timeout: ms })` | 10 min |
| Typed exception hierarchy | `Anthropic.{RateLimitError, BadRequestError, InternalServerError, APIError, …}` | — |
| Pre-flight token counting | `client.messages.countTokens(request)` | — |
| Streaming (helps when `max_tokens` would risk an HTTP timeout) | `client.messages.stream(request)` | — |

What the SDK **does not** do:

- No proactive client-side rate limiter (no Bottleneck-style queue).
- No header-driven throttling — successful responses' `*-remaining` headers are not parsed and acted on.
- No cross-model coordination (e.g. it will not know that Sonnet 4.6 + Sonnet 4.5 share a bucket).
- No per-user caps — that is application-layer.

These are exactly the gaps Track B fills.

---

## 6. Where this maps to the cosmisk implementation

| Anthropic mechanic | Where it lands in cosmisk |
|---|---|
| RPM | Bottleneck `minTime: 60_000 / RPM`, `maxConcurrent: 5` per model-class limiter |
| ITPM | Bottleneck `reservoir: ITPM`, `reservoirRefreshAmount: ITPM`, `reservoirRefreshInterval: 60_000`. Job weight = pre-flight `countTokens` estimate. |
| OTPM | Cannot be reserved up-front (we don't know output size). Track post-hoc from `response.usage.output_tokens` and warn / shed load if running hot. Defensive only — Anthropic enforces it server-side. |
| Cached input tokens | Excluded from job weight (don't count against ITPM). Recorded for cost-ledger accuracy at the per-token rate. |
| `retry-after` | SDK reads this directly when `maxRetries > 0`. Gateway only kicks in if SDK retries are exhausted — at that point we surface a clean app-level 429 and let the caller decide. |
| `anthropic-ratelimit-*-remaining` | Logged at debug. If `requests-remaining` drops below a configured floor (e.g. 5), the limiter contracts its reservoir defensively. Optional in v1; nice-to-have. |

`shared/error-codes.md` and `shared/model-migration.md` (loaded via the `claude-api` skill) are the canonical references for SDK-side behavior. Re-read both before implementing — `model-migration.md` in particular flags Opus 4.7 / 4.6 changes (`thinking.adaptive`, `effort`, removed sampling params) that the gateway should not paper over.
