> **Status: 📖 REFERENCE (2026-05-31)** — index for the rate-limiting research bundle; durable design reference.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Rate Limiting — research bundle (2026-05-02)

Five-doc bundle answering: how do we add token + request rate limiting to every LLM call site in the server, and how do we extend the per-user cost ceiling that today only protects creative jobs.

This is **research/design only**. No code changes are made by these docs. Implementation is gated on owner go-ahead per the workflow rule in `CLAUDE.md` and the open questions at the end of `implementation_plan.md`.

## Files in this folder

| File | Purpose | Read it when |
|---|---|---|
| `findings.md` | Current state of LLM usage in the repo. The 24 call sites (path:line + model), the 19 client instantiations, the existing `cost_ledger` + `checkDailyLimit` partial coverage, model-string issues to fix. | You want to know what is wired up today. |
| `anthropic_rate_limits.md` | Reference. Anthropic's RPM/ITPM/OTPM model, the response headers (`anthropic-ratelimit-*`, `retry-after`), the tier table, what the SDK does and does not do. | You want to know what we are protecting against and what knobs the upstream gives us. |
| `options.md` | Decision matrix. SDK retry only / `bottleneck` / `p-queue` / `p-limit` / hand-rolled token bucket / proxy. Pros, cons, fit. Recommendation: `bottleneck` + SDK `maxRetries: 3` + extend the existing `cost_ledger` enforcement. | You are choosing the approach. |
| `implementation_plan.md` | File-by-file plan that mirrors Track B of the approved plan. Module shape, integration points, test plan, rollout. | You are about to implement. |
| `README.md` (this file) | Index. | First. |

## Status

| Item | Status |
|---|---|
| Track A — research docs (this folder) | ✅ Done 2026-05-02 |
| Track B — implementation (`server/src/services/llm-gateway.ts` + 24 call-site migrations + Gemini wrapper) | ⛔ **Not started.** Pending owner go-ahead per § "Open questions" in `implementation_plan.md`. |

## How this connects to other reports

- `dev_reports/new_and_added_risks.md` § E (per-user LLM cost ceiling) — the per-user side of this work resolves Added Risk E.
- `dev_reports/suggested.md` Phase 0.3 — same item.
- `dev_reports/final_report.md` § 5.4 / § 8 Q1 — the cost-ceiling carve-out (~3 h code) was conditionally on the table for the break window. **This bundle expands that scope** to also cover org-wide RPM/ITPM/OTPM rate limiting and SDK-level retry, which were not part of the original carve-out. Confirm with the owner whether the expanded scope is still acceptable as a break-window carve-out, or whether it slips to May 16.
- `dev_reports/audit.md` Risk 2 (observability gap) — the gateway will emit structured logs through `utils/logger.ts` and is well-positioned to feed the future Sentry tags.

## Critical numbers

- **24** `messages.create` call sites across **20** files.
- **0** retry / backoff / circuit-breaker logic on Anthropic calls today.
- **0** rate limiting in front of `messages.create` today.
- **1** existing daily-cost gate (`services/job-queue.ts → checkDailyLimit`) — covers creative job dispatch only, not the 24 LLM call sites.
- **3** date-suffixed model strings (`claude-sonnet-4-20250514`) that the `claude-api` skill flags as deprecated/incorrect aliases.
- **`@anthropic-ai/sdk@^0.78.0`** is the installed version. Several versions behind current; upgrade is a separate task.
- **`@fastify/rate-limit@^10.3.0`** is also installed — different concern (HTTP-request RPM per IP / per route, DDoS protection). Not relevant to LLM rate limiting and is not part of this bundle.

See each doc for detail.
