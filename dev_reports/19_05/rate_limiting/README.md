> **Status: 📖 REFERENCE (2026-05-31)** — post-ship index for the rate-limiting bundle; durable design reference.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Rate Limiting — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/rate_limiting/README.md` (2026-05-02)

> The gateway has been shipped. Track B is **partially complete**: the gateway exists, most call sites are wrapped, two services still bypass.

---

## Status (refreshed)

| Item | Status |
|---|---|
| Track A — research docs | ✅ Done 2026-05-02 (unchanged) |
| Track B — implementation | **Partial.** Gateway shipped as `feat: api/llm rate limiting` (commit `1521cce`). 2 of 3 originally-counted call-site clusters wrapped. |
| Remaining call sites to wrap | `competitor-creative-intel.ts`, `comment-mining-agent.ts` — see `implementation_plan.md` § post-merge |
| Operator-script policy | **Pending owner gate** (Risk L) |
| CI grep guards | **Pending** — block direct `new Anthropic` outside the gateway |
| Gemini wrapper | **Not started.** A separate gateway for Gemini was in the original Track B scope; deferred. |

---

## What changed since 2026-05-02

1. The gateway was implemented and merged.
2. The merge of `origin/analysis-and-cleanup` brought the gateway changes onto local.
3. New analyst services on `main` (now also on the cleanup branch) — `competitor-creative-intel.ts` and `comment-mining-agent.ts` — were never wrapped. They still call `new Anthropic({...})` directly.
4. Operator scripts in `server/scripts/` (`run-client-*.mjs`, `run-pratapsons-intel.mjs`, etc.) call analyst services that, for the wrapped paths, now go through the gateway. **No `userId` policy for these scripts has been chosen.** They will hit the per-user daily $ cap with `userId === undefined` unless a policy is decided.

---

## Critical numbers (refreshed)

| Metric | 2026-05-02 | 2026-05-19 |
|---|---:|---:|
| `messages.create` call sites | 24 | not re-enumerated; gateway routes them all via `createMessage` |
| `new Anthropic` instantiations outside the gateway | 19 | **2** (competitor-creative-intel + comment-mining-agent) |
| Retry/backoff/CB on Anthropic | 0 | **3 (SDK `maxRetries: 3` set by the gateway)** |
| Rate limiting in front of `messages.create` | 0 | **`bottleneck` per model class via gateway** |
| Existing daily-cost gates | 1 (job-queue) | **2** (job-queue still has its own; gateway has the canonical) — need to dedupe |
| Deprecated model strings | 3 | not re-audited |
| `@anthropic-ai/sdk` version | `^0.78.0` | unchanged |
| `@fastify/rate-limit` version | `^10.3.0` | unchanged (HTTP-level, not LLM-level) |

---

## How this connects to other reports (refreshed)

- `19_05/new_and_added_risks.md` § E (resolved partially) + § I (NEW — direct calls bypass gateway).
- `19_05/suggested.md` S3 (finish the wrap).
- `dev_reports/cleanup_suggestions.md` S3 — the canonical step-by-step.
- `19_05/audit.md` Risk #2 — the gateway emits via `utils/logger.ts`; Sentry wiring is downstream (P0.1).

---

## Next actions

1. Wrap `competitor-creative-intel.ts` (~1 day, no existing tests — write a smoke test first).
2. Wrap `comment-mining-agent.ts` (~0.5 day).
3. Add CI grep guards (G1, G4).
4. Decide operator-script policy with owner.
5. Dedupe the daily-cap check between `job-queue.ts` and the gateway (both currently maintain their own — pick one).
6. (Optional) Build a Gemini gateway sibling so all paid-LLM calls go through one wrapper.

---

**End of refresh.**
