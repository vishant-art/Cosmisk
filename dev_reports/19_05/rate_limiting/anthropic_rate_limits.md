> **Status: 📖 REFERENCE (2026-05-31)** — durable reference on Anthropic's rate-limit model (unchanged at the API end).
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Anthropic Rate Limits — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/anthropic_rate_limits.md` (2026-05-02)

> Reference document. The content has not changed at Anthropic's API end; the only meaningful refresh is to note that the gateway now applies these limits.

---

## 1. What hasn't changed

The Anthropic rate-limit model (RPM, ITPM, OTPM, retry-after, tier table, headers) is documented in the original `anthropic_rate_limits.md`. None of that has shifted between 2026-05-02 and today.

If the original document needs re-fetching, the canonical source is https://docs.anthropic.com/en/api/rate-limits (subject to change).

---

## 2. What has changed: where the limits are enforced

| Concern | 2026-05-02 | 2026-05-19 |
|---|---|---|
| RPM enforcement | none (Anthropic returns 429; SDK bubbles it) | `bottleneck` `minTime = 60_000 / RPM` per model class |
| ITPM enforcement | none | `bottleneck` weighted reservoir, weight = pre-flight `countTokens` |
| OTPM enforcement | none (Anthropic returns 429; SDK bubbles it) | none — gateway does not gate output tokens (output isn't known until the call returns) |
| 429 handling | manual | SDK `maxRetries: 3` respects `retry-after` header |
| 5xx handling | manual | SDK `maxRetries: 3` |
| Cost tracking | partial (`cost_ledger` from job-queue) | full (`cost_ledger` from gateway, on every successful call) |
| Daily $ cap | partial (job-queue only) | full (gateway, every wrapped call) |

---

## 3. The gateway's tier handling

`config.anthropicTier` (defaulting to 1) drives the limiter parameters. Tier table from `LIMITS_BY_TIER` in `server/src/services/llm-gateway.ts`:

| Tier | Model class | RPM | ITPM | OTPM |
|---|---|---:|---:|---:|
| 1 | sonnet | 50 | 30,000 | 8,000 |
| 1 | opus | 50 | 30,000 | 8,000 |
| 1 | haiku | 50 | 50,000 | 10,000 |
| 2 | sonnet | 1,000 | 450,000 | 90,000 |
| 2 | opus | 1,000 | 450,000 | 90,000 |
| 2 | haiku | 1,000 | 450,000 | 90,000 |
| 3, 4 | … | per Anthropic docs | … | … |

(Tiers 3 and 4 are placeholders; values populated when needed.)

---

## 4. Pricing (cents per 1M tokens)

Hardcoded in `gateway.PRICING`:

| Model | Input | Output | Cache write | Cache read |
|---|---:|---:|---:|---:|
| `claude-opus-4-7` | 500 | 2,500 | 625 | 50 |
| `claude-opus-4-6` | 500 | 2,500 | 625 | 50 |
| `claude-sonnet-4-6` | 300 | 1,500 | 375 | 30 |
| `claude-haiku-4-5` | 100 | 500 | 125 | 10 |

These are checked into the gateway; verify quarterly against Anthropic's pricing page.

---

## 5. Headers exposed by Anthropic (still relevant for fallback paths)

Even with the gateway, the SDK exposes:

- `anthropic-ratelimit-requests-limit`
- `anthropic-ratelimit-requests-remaining`
- `anthropic-ratelimit-tokens-limit`
- `anthropic-ratelimit-tokens-remaining`
- `retry-after`

The gateway uses `bottleneck` to stay ahead of these, so headers should rarely trigger backoff. If they do (e.g., shared quota with non-gateway calls), the SDK retry handles it.

---

## 6. What the gateway does NOT do (gaps)

- No **OTPM** enforcement (output tokens unknown pre-call).
- No **circuit breaker** for sustained Anthropic outages (would fail fast for the whole service). Risk C still applies.
- No **observability tags** on Sentry yet (P0.1 prerequisite).
- No **Gemini** sibling.

---

**End of refresh.**
