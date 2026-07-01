> **Status: 📖 REFERENCE (2026-05-31)** — index for the rate-limiting research bundle; durable design reference.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Rate Limiting — research bundle (2026-05-02)

Five-doc bundle: how to add token + request rate limiting to every LLM call site in the server, and how to extend the per-user cost ceiling that today only protects creative jobs. **Research/design only** — no code changes; implementation gated on owner go-ahead per `CLAUDE.md` + open questions in `implementation_plan.md`.

## Files in this folder

| File | Purpose | Read it when |
|---|---|---|
| `findings.md` | Current state of LLM usage: the 24 call sites (path:line + model), the 19 client instantiations, existing `cost_ledger` + `checkDailyLimit` partial coverage, model-string issues to fix. | You want to know what is wired up today. |
| `anthropic_rate_limits.md` | Reference: Anthropic's RPM/ITPM/OTPM model, response headers (`anthropic-ratelimit-*`, `retry-after`), tier table, what the SDK does/doesn't do. | You want what we protect against + upstream knobs. |
| `options.md` | Decision matrix: SDK retry only / `bottleneck` / `p-queue` / `p-limit` / hand-rolled token bucket / proxy. Recommendation: `bottleneck` + SDK `maxRetries: 3` + extend existing `cost_ledger` enforcement. | You are choosing the approach. |
| `implementation_plan.md` | File-by-file plan mirroring Track B: module shape, integration points, test plan, rollout. | You are about to implement. |
| `README.md` (this file) | Index. | First. |

## Status

| Item | Status |
|---|---|
| Track A — research docs (this folder) | ✅ Done 2026-05-02 |
| Track B — implementation (`server/src/services/llm-gateway.ts` + 24 call-site migrations + Gemini wrapper) | ⛔ **Not started.** Pending owner go-ahead per § "Open questions" in `implementation_plan.md`. |

## How this connects to other reports

- `dev_reports/new_and_added_risks.md` § E (per-user LLM cost ceiling) — per-user side resolves Added Risk E.
- `dev_reports/suggested.md` Phase 0.3 — same item.
- `dev_reports/final_report.md` § 5.4 / § 8 Q1 — cost-ceiling carve-out (~3 h code) was conditionally on the table for the break window. **This bundle expands that scope** to also cover org-wide RPM/ITPM/OTPM rate limiting and SDK-level retry (not in original carve-out). Confirm with owner whether expanded scope stays a break-window carve-out or slips to May 16.
- `dev_reports/audit.md` Risk 2 (observability gap) — gateway emits structured logs through `utils/logger.ts`, well-positioned to feed future Sentry tags.

## Critical numbers

- **24** `messages.create` call sites across **20** files.
- **0** retry / backoff / circuit-breaker logic on Anthropic calls today.
- **0** rate limiting in front of `messages.create` today.
- **1** existing daily-cost gate (`services/job-queue.ts → checkDailyLimit`) — covers creative job dispatch only, not the 24 LLM call sites.
- **3** date-suffixed model strings (`claude-sonnet-4-20250514`) that the `claude-api` skill flags as deprecated/incorrect aliases.
- **`@anthropic-ai/sdk@^0.78.0`** installed. Several versions behind; upgrade is a separate task.
- **`@fastify/rate-limit@^10.3.0`** installed — different concern (HTTP-request RPM per IP / per route, DDoS). Not LLM rate limiting; not part of this bundle.

## Pointer

- DURABLE_REFERENCE -> see: rate-limiting reference set (`05_05/rate_limiting/*`, `19_05/rate_limiting/*`); SoW context in `05_05/scope_alignment.md`.
