> **Status: 📖 REFERENCE (2026-05-31)** — durable reference on Anthropic's rate-limit model and SDK behaviour.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Anthropic API Rate Limits — Reference (2026-05-02)

Sourced from `platform.claude.com/docs/en/api/rate-limits` + the `@anthropic-ai/sdk` README. Cosmisk notes inline.

## Unique essence preserved

### 1. The three axes (per-org, per-model-class, token-bucket, continuous replenish)
| Axis | Unit | What counts |
|---|---|---|
| **RPM** | Requests/min | Every `POST /v1/messages`, regardless of size |
| **ITPM** | Input tokens/min | `input_tokens` + `cache_creation_input_tokens`. **`cache_read_input_tokens` does NOT count** on Claude 4.x. (Older models marked `†` — Haiku 3.5 — DO count cache reads.) |
| **OTPM** | Output tokens/min | Real output tokens. **`max_tokens` does NOT charge OTPM** unless used — generous `max_tokens` has no rate-limit downside. |

- Prompt caching raises effective ITPM: 80% cache-hit at Tier 2 (450K ITPM Sonnet 4.x) ≈ **2.25M tokens/min** effective.
- ITPM is **estimated at request start**, adjusted to actuals during processing → limiter must reserve on estimated input.

### 2. Tier table (Standard tier; Priority Tier separate)
Cosmisk tier unconfirmed (open Q §9.2); defaults assume Tier 1.

| Tier | Model class | RPM | ITPM | OTPM |
|---|---|---:|---:|---:|
| 1 | Sonnet 4.x / Opus 4.x | 50 | 30 000 | 8 000 |
| 1 | Haiku 4.5 | 50 | 50 000 | 10 000 |
| 2 | all classes | 1 000 | 450 000 | 90 000 |
| 3 | Sonnet 4.x / Opus 4.x | 2 000 | 800 000 | 160 000 |
| 3 | Haiku 4.5 | 2 000 | 1 000 000 | 200 000 |
| 4 | Sonnet 4.x / Opus 4.x | 4 000 | 2 000 000 | 400 000 |
| 4 | Haiku 4.5 | 4 000 | 4 000 000 | 800 000 |

(Sonnet 4.x = combined Sonnet 4/4.5/4.6; Opus 4.x = combined Opus 4/4.1/4.5/4.6/4.7.) Limits independent per model class. Combined-Opus rule: Opus 4.6 + 4.7 share one Opus 4.x bucket — `creative-strategist.ts` and `sprint-planner.ts:241` (only Opus callers) share it.

### 3. Response headers (every Messages response = live ground truth)
`anthropic-ratelimit-{requests,input-tokens,output-tokens}-{limit,remaining,reset}`; `remaining` rounded to nearest thousand; `reset` = RFC 3339 full-replenish time. `anthropic-ratelimit-tokens-*` = combined "most restrictive" view (workspace caps tighter than org). `anthropic-priority-*` = Priority Tier mirrors. `retry-after` = seconds, **only on 429** — earlier retries fail. The SDK exposes raw headers via `.headers` **when you opt in** (`client.messages.create({ ... }).withResponse()` style, or via the raw HTTP response); reading `requests-remaining`/`input-tokens-remaining` after each success is enough.

### 4. Error shape (429, verified `shared/error-codes.md`)
`{ "type":"error", "error":{ "type":"rate_limit_error", "message":"..." }, "request_id":"req_..." }`
Maps to `Anthropic.RateLimitError` — check via `instanceof`, **never** string-match message. `5xx`/connection errors retryable → `Anthropic.InternalServerError` / `Anthropic.APIConnectionError`; SDK retry path covers all.

### 5. What the SDK (`@anthropic-ai/sdk@0.78`+) gives free
Auto-retry on 408/409/429/5xx, exp backoff respecting `retry-after` (`maxRetries` default **2**); per-request `maxRetries` override; `timeout` default **10 min**; typed exception hierarchy — `Anthropic.{RateLimitError, BadRequestError, InternalServerError, APIError, …}` (check via `instanceof`); `countTokens` pre-flight; `messages.stream` (helps when `max_tokens` would risk an HTTP timeout).
**Does NOT:** proactive client-side rate limiter; header-driven throttling (`*-remaining` not parsed/acted on); cross-model bucket coordination; per-user caps (app-layer). → exactly the gaps **Track B** fills.

### 6. Mapping to cosmisk implementation
| Anthropic mechanic | Where it lands |
|---|---|
| RPM | Bottleneck `minTime: 60_000/RPM`, `maxConcurrent: 5` per model-class limiter |
| ITPM | Bottleneck `reservoir: ITPM`, `reservoirRefreshAmount: ITPM`, `reservoirRefreshInterval: 60_000`. Job weight = `countTokens` estimate |
| OTPM | Cannot reserve up-front; track post-hoc from `response.usage.output_tokens`, warn/shed if hot. Defensive only |
| Cached input tokens | Excluded from job weight; recorded for cost-ledger accuracy |
| `retry-after` | SDK reads directly when `maxRetries>0`; gateway kicks in only if SDK retries exhausted → clean app-level 429 |
| `*-remaining` | Logged at debug; if `requests-remaining` < floor (e.g. 5), limiter contracts reservoir defensively (optional v1) |

Canonical SDK refs: `shared/error-codes.md`, `shared/model-migration.md` (via `claude-api` skill); `model-migration.md` flags Opus 4.7/4.6 changes (`thinking.adaptive`, `effort`, removed sampling params) the gateway must not paper over.

## Pointer
- DURABLE_REFERENCE -> see: upstream limit reference (05_05 & 19_05 `rate_limiting/` set; STATUS_INDEX durable).
