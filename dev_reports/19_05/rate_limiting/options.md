> **Status: 📖 REFERENCE (2026-05-31)** — historical decision matrix behind the shipped rate limiter.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Rate-limiting — Options — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/options.md` (2026-05-02)

> The decision matrix is now historical: option **B (bottleneck + SDK retry + extend `cost_ledger` enforcement)** was chosen and shipped. This refresh keeps the decision matrix for reference and pivots to the residual decisions.

---

## 1. Original decision (still current)

**Adopted:** `bottleneck` + SDK `maxRetries: 3` + extend the existing `cost_ledger` enforcement.

**Evidence it's working:**
- `server/src/services/llm-gateway.ts` ships the limiters + the cost-ledger writes.
- `server/src/__tests__/llm-gateway.test.ts` covers the cap and ledger paths.
- 20 call sites successfully routed through `createMessage`.

**Residual concerns (justify keeping `options.md` alive):**
- 2 services still bypass (Risk I).
- Operator scripts have no policy yet (Risk L).
- Gemini wrapper not built.

---

## 2. Residual options post-merge

### 2.1 Where to put the daily-cap source of truth

| Option | What | Pros | Cons |
|---|---|---|---|
| A | Keep `job-queue.ts`'s independent `checkDailyLimit` for creative dispatch + use gateway's for everything else | minimal change | two truths; users could hit cap differently depending on entry point |
| B (recommend) | Delete `job-queue.ts`'s version; everything goes through gateway | single truth | one PR to switch over; small risk of regressing the dispatch path |

### 2.2 Operator-script principal

| Option | What | Pros | Cons |
|---|---|---|---|
| A (recommend) | Synthetic `userId: 'operator:<name>'` + dedicated env-driven cap (`OPERATOR_DAILY_LIMIT`) | preserves cap discipline; auditable in `cost_ledger` | one-time gateway change to accept synthetic principals |
| B | `OPERATOR_BYPASS_GATEWAY=true` flag; operator runs uncapped | zero gateway change | uncapped + no telemetry |

### 2.3 Gemini wrapper

| Option | What | Pros | Cons |
|---|---|---|---|
| A | Build a `gemini-gateway.ts` sibling now (M1) | unified cost view; matches Anthropic discipline | ~1 day; current Gemini paths are few |
| B (recommend) | Defer to M2 (Ingestion & Normalization) | M1 already overloaded | Gemini spend uncapped until then |

### 2.4 CI grep guards order

| Option | What | Pros | Cons |
|---|---|---|---|
| A | Land guards first, then wrap remaining 2 services | strict enforcement | wrap PRs blocked by CI until they themselves remove the violations |
| B (recommend) | Wrap first, then land guards | matches reality | small window where someone could add a regression |

---

## 3. Decision matrix (original, kept for reference)

| Approach | What | Status |
|---|---|---|
| SDK retry only | `@anthropic-ai/sdk` `maxRetries: 3` | partial; doesn't rate-limit |
| `bottleneck` | Token-bucket / reservoir | **chosen** (in gateway) |
| `p-queue` | Concurrency + interval | not chosen — fewer knobs than bottleneck |
| `p-limit` | Concurrency only | not chosen — no token bucket |
| Hand-rolled token bucket | Custom | not chosen — reinvents the wheel |
| Proxy (Helicone/LangSmith) | External | not chosen — adds dependency |

---

**End of refresh.**
