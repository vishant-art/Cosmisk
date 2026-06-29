> **Status: 📖 REFERENCE (2026-05-31)** — historical decision matrix behind the shipped rate limiter.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Rate-limiting — Options — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/options.md` (2026-05-02)

## Unique essence preserved

**Original decision (shipped):** option **B** = `bottleneck` + SDK `maxRetries: 3` + extend existing `cost_ledger` enforcement. Chosen and shipped.
- Evidence working: limiters + cost-ledger writes in `server/src/services/llm-gateway.ts`; cap + ledger tests in `server/src/__tests__/llm-gateway.test.ts`; 20 call sites routed through `createMessage`.
- Residual concerns (justify keeping options.md alive): 2 services still bypass (Risk I); operator scripts have no policy yet (Risk L); Gemini wrapper not built.

**§2.1 — daily-cap source of truth**

| Option | What | Pros | Cons |
|---|---|---|---|
| A | Keep `job-queue.ts`'s independent `checkDailyLimit` for creative dispatch + gateway's for everything else | minimal change | two truths; cap differs by entry point |
| B (recommend) | Delete `job-queue.ts`'s version; everything goes through gateway | single truth | one PR to switch; small risk of regressing dispatch path |

**§2.3 — Gemini wrapper**

| Option | What | Pros | Cons |
|---|---|---|---|
| A | Build `gemini-gateway.ts` sibling now (M1) | unified cost view; matches Anthropic discipline | ~1 day; current Gemini paths few |
| B (recommend) | Defer to M2 (Ingestion & Normalization) | M1 already overloaded | Gemini spend uncapped until then |

**§2.4 — CI grep guards order**

| Option | What | Pros | Cons |
|---|---|---|---|
| A | Land guards first, then wrap remaining 2 services | strict enforcement | wrap PRs blocked by CI until they remove violations |
| B (recommend) | Wrap first, then land guards | matches reality | small window for a regression |

**§3 — Decision matrix (original, kept for reference)**

| Approach | What | Status |
|---|---|---|
| SDK retry only | `@anthropic-ai/sdk` `maxRetries: 3` | partial; doesn't rate-limit |
| `bottleneck` | Token-bucket / reservoir | **chosen** (in gateway) |
| `p-queue` | Concurrency + interval | not chosen — fewer knobs than bottleneck |
| `p-limit` | Concurrency only | not chosen — no token bucket |
| Hand-rolled token bucket | Custom | not chosen — reinvents the wheel |
| Proxy (Helicone/LangSmith) | External | not chosen — adds dependency |

## Cited & kept (referenced elsewhere)

**§2.2 — Operator-script principal** (cited by `23_05/module_inventory.md:165`)

| Option | What | Pros | Cons |
|---|---|---|---|
| A (recommend) | Synthetic `userId: 'operator:<name>'` + dedicated env-driven cap (`OPERATOR_DAILY_LIMIT`) | preserves cap discipline; auditable in `cost_ledger` | one-time gateway change to accept synthetic principals |
| B | `OPERATOR_BYPASS_GATEWAY=true` flag; operator runs uncapped | zero gateway change | uncapped + no telemetry |

## Pointer
- DURABLE_REFERENCE -> §2.2 cited by `23_05/module_inventory.md:165`; shipped rate limiter per `05_05/rate_limiting/implementation_plan.md` (commit 1521cce) and post-ship status `19_05/rate_limiting/implementation_plan.md`.
