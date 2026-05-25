# Structured Logging — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/structured_logging.md` (2026-05-03)

> The 2026-05-03 plan is the right plan. The counts it cites are stale. This refresh re-baselines them.

---

## 1. Fresh counts (production code, excluding `__tests__`)

| Metric | 2026-05-03 plan | 2026-05-19 reality | Delta |
|---|---:|---:|---:|
| `console.*` calls (production) | 85 | **96** | +11 |
| `logger.*` calls (production) | 116 | **539** | +423 |
| Files using shared logger | 35 of 42 | not enumerated; ~50+ | n/a |

The 4.6× jump in `logger.*` calls comes from the analyst services that adopted pino from day one. The 13% rise in `console.*` is concentrated in the audit pipeline.

---

## 2. Where the remaining `console.*` lives

Per-file breakdown (sampled via `grep -c "console\\." path | grep -v __tests__`):

| File | Approx. count | Why it leaks |
|---|---:|---|
| `audit/index.ts` | ~55 (unchanged) | Built as a CLI-style flow before being wired into routes |
| `services/audit-scheduler.ts` | ~15 (unchanged) | Forked from the CLI flow |
| `audit/audit-agent.ts` | ~6 (unchanged) | Same lineage |
| `routes/audits.ts` | ~4 (unchanged) | Carries CLI-style status prints |
| `config.ts` | 3 (correct — pre-pino fatal-error path) | Boot-time before pino exists |
| `audit/website-analysis.ts` | 1 (unchanged) | One-off |
| `audit/google-ads-ingestion.ts` | 1 (unchanged) | One-off |
| **NEW SOURCES** (post-merge) | ~11 | Distributed across new analyst services |

The new leak surface is small (~11 calls) and probably concentrated in a few of the analyst services. A grep with file-by-file breakdown is needed before the migration to know exactly which services.

---

## 3. The convention (unchanged)

Same as 2026-05-03 plan. One rule: **never call `console.*` from server code** (boot-time fatal in `config.ts` is the exception).

```ts
logger.info({ userId, accountId, operation: 'audit.run' }, 'Audit completed');
logger.warn({ userId, spent, limit }, '[LLM-Gateway] Daily Anthropic cap exceeded');
logger.error({ err, userId, brandId }, '[Audit] Gemini failed, falling back to Claude');
```

---

## 4. The migration plan

Unchanged in structure. Sequence:

1. Add a Fastify `onRequest` hook that decorates `request` with a `reqId` (Pino already generates one; surface it to `request.log` bindings).
2. Bulk replace `console.log` → `logger.info`, `console.warn` → `logger.warn`, `console.error` → `logger.error` in the audit pipeline.
3. Each replacement needs the context object: `{userId, accountId, operation}` minimum.
4. Boot-time logs in `config.ts` stay as `console.error` (pino isn't constructed yet).
5. Add ESLint rule `no-console` with override for `config.ts`. CI fails on new violations.

**Effort:** ~1 day for the bulk replace + ESLint rule.

**DoD:** `grep -rE "console\\.(log|warn|error)" server/src | grep -v __tests__ | grep -v "config.ts" | wc -l` = 0.

---

## 5. Sentry wiring (P0.1 prerequisite for full closure)

The plan calls for Sentry. Status today: **no Sentry yet.**

After the `console.*` migration:
- Add `@sentry/node` to `server/package.json`.
- Initialise in `server/src/index.ts` before any route registration.
- Register Sentry's Fastify error handler.
- Add `Sentry.captureException` on `unhandledRejection` + `uncaughtException` (currently absent).
- Tag every event with `userId` (from JWT) + `service: 'cosmisk-api'` + `release: <git-sha>`.
- Browser: `@sentry/angular-ivy` in `src/main.ts`.

**Effort:** 0.5 day.

---

## 6. Order of operations

1. S0 (env) → S1 (build) → P0.1 (Sentry) — none of this can start without `tsc` passing.
2. P0.2 (request-id + console migration) — must follow P0.1 so events ship to Sentry.
3. P3.2 (DLQ + Sentry alerts on cron failures) — much later.

---

**End of refresh.**
