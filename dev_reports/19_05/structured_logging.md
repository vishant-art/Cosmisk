> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 structured-logging refresh. Superseded by `23_05/module_inventory.md` and the later migration arc.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Structured Logging — Refresh (2026-05-19/20)

## Unique essence preserved

- Supersedes `dev_reports/structured_logging.md` (2026-05-03): that plan is correct but its counts are stale; this re-baselines them.
- **Fresh counts (prod, excl `__tests__`):** `console.*` = **96** (was 85, +11); `logger.*` = **539** (was 116, +423, 4.6×); files using shared logger ~50+ (was 35 of 42).
  - Root cause: logger jump from analyst services that adopted pino from day one; the 13% `console.*` rise concentrated in the audit pipeline.
- **`console.*` per-file breakdown** (`grep -c "console\." path | grep -v __tests__`):
  - `audit/index.ts` ~55 (CLI-style flow before route wiring)
  - `services/audit-scheduler.ts` ~15 (forked from CLI flow)
  - `audit/audit-agent.ts` ~6 (same lineage)
  - `routes/audits.ts` ~4 (CLI-style status prints)
  - `config.ts` 3 (correct — pre-pino boot-time fatal path)
  - `audit/website-analysis.ts` 1; `audit/google-ads-ingestion.ts` 1 (one-offs)
  - NEW post-merge ~11 (distributed across new analyst services; needs file-by-file grep to pin down)
- **Convention (unchanged):** never call `console.*` from server code; `config.ts` boot-time fatal is the sole exception.
- **Migration plan:**
  1. Fastify `onRequest` hook decorating `request` with `reqId` (Pino already generates one; surface to `request.log` bindings).
  2. Bulk replace `console.log`→`logger.info`, `console.warn`→`logger.warn`, `console.error`→`logger.error` in the audit pipeline.
  3. Each replacement needs context object `{userId, accountId, operation}` minimum.
  4. `config.ts` boot logs stay `console.error` (pino not yet constructed).
  5. Add ESLint `no-console` rule with `config.ts` override; CI fails on new violations.
  - **Effort:** ~1 day. **DoD:** `grep -rE "console\.(log|warn|error)" server/src | grep -v __tests__ | grep -v "config.ts" | wc -l` = 0.
- **Sentry (P0.1 prerequisite, none today):** add `@sentry/node` to `server/package.json`; init in `server/src/index.ts` before any route registration; register Sentry Fastify error handler; `Sentry.captureException` on `unhandledRejection`+`uncaughtException` (currently absent); tag every event `userId`(from JWT)+`service:'cosmisk-api'`+`release:<git-sha>`; browser `@sentry/angular-ivy` in `src/main.ts`. **Effort:** 0.5 day.
- **Order of operations:** S0(env)→S1(build)→P0.1(Sentry) — none can start until `tsc` passes; then P0.2 (request-id + console migration, must follow P0.1 so events ship to Sentry); then P3.2 (DLQ + Sentry alerts on cron failures, much later).

## Cited & kept (referenced elsewhere)

- This is the structured-logging plan that remediates **Risk E** (silent failures / unstructured errors). Cited by `23_05/risk_register.md:20,60`. The full count baseline, per-file console leak map, 5-step migration plan, DoD grep, and Sentry wiring above are the load-bearing detail behind that citation.

## Pointer

- SUPERSEDED → see: `23_05/risk_register.md` (Risk E remediation — keep the plan, cited by 23_05).
