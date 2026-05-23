# Cosmisk Codebase Audit — 2026-04-26

Branch: `analysis-and-cleanup` · Commit: `69b4352`
Graph stats: 290 files · 3,369 nodes · 33,360 edges · TypeScript / JavaScript / Bash

## Architecture overview

19 communities, 927 cross-community edges, 8 high-coupling warnings. Top modules by size:

| # | Community | Size | Cohesion | Source |
|---|---|---|---|---|
| 7 | `tests-it:returns` | 920 | 0.11 | `server/src/__tests__` |
| 17 | `sprint-detail-load` | 518 | 0.26 | `src/app/features` |
| 19 | `pipes-it:should` | 470 | 0.15 | `src/app/shared` |
| 16 | `services-it:should` | 408 | 0.13 | `src/app/core` |
| 13 | `services-generate` | 247 | 0.13 | `server/src/services` |

Backend `services-generate` is a coupling hotspot — 387 edges to `routes`, 51 to `db`, 66 to backend tests, 45 to `utils/safe`. Frontend cohesion (~0.26 in features) is healthier than backend cohesion (0.11–0.13).

---

## Risk 1 — Database performance (SQLite concurrency limits)

**Status: confirmed, with extra nuance.**

Evidence:
- `server/src/db/index.ts`: `better-sqlite3`, single shared connection, `journal_mode = WAL`, `foreign_keys = ON`. WAL allows concurrent reads, but writes are still serialized.
- `server/src/db/schema.ts`: **35 tables, ~17 indexes.** Tables with no secondary index: `users`, `meta_tokens`, `google_tokens`, `campaigns`, `ugc_projects`, `ugc_concepts`, `ugc_scripts`, `subscriptions`, `user_usage`, `automations`, `creative_sprints`, `agent_core_memory`, `tiktok_tokens`, `score_predictions`, `activity_log`. Anything filtered by `user_id` or `email` does a full table scan.
- `server/src/config.ts` already has a `databaseUrl` slot for Postgres — partial scaffolding, not wired.

Bigger consequence the original write missed: **SQLite-on-disk pins the system to a single replica.** No horizontal scaling, no zero-downtime deploys, no read replicas, weak backup story.

Solution direction: managed Postgres + Drizzle ORM, connection pooling, real index pass, query plan review.

---

## Risk 2 — System visibility (blind in production)

**Status: confirmed, numbers were understated.**

Evidence:
- `server/src/utils/logger.ts`: Pino emits to stdout only. No Sentry, no Datadog, no remote aggregation.
- **222 try/catch blocks** server-side (original claim said 108 — actually >2×).
- **85 `console.*` calls** in routes/services running alongside **116 `logger.*` calls** — logging split across two stacks. `console.*` bypasses Pino's JSON structure in production.
- Slack webhook URL is in config but no central `error → Slack/Sentry` sink.
- No request-id / correlation-id propagation in logs.
- Process-level handlers: `SIGINT`/`SIGTERM` graceful shutdown exists; no `unhandledRejection`/`uncaughtException` reporting.

Solution direction: Sentry on server + browser, request-id Fastify hook, replace `console.*` calls, central error → Slack sink for fatals.

---

## Risk 3 — Code stability (runtime crash vectors)

**Status: partly confirmed, numbers different.**

Evidence:
- **104 total `as any`** (88 server + 16 frontend), not 74.
- ~**53 of 88** server casts are in `__tests__` (low stakes). ~**35 in production** code, mostly DB-row casts:
  - `audit/index.ts` — 7
  - `routes/audits.ts` — 4
  - `routes/creative-studio.ts` — 3
  - `routes/automations.ts` — 3
  - `routes/ad-accounts.ts` — 3
  - `services/audit-scheduler.ts` — 3
- TypeScript `strict: true` is **already on** (root and server `tsconfig.json`).
- **229 Zod usages** — validation is in active use at the HTTP boundary.

The "12 critical" framing is roughly right in shape: the worst casts are the ones that pretend a `db.prepare(...).get()` row matches a domain type. Those are silent corruption sources, not at HTTP edges.

Solution direction: typed row interfaces (or Drizzle's inferred models) for every DB query, drop production `as any` casts to zero, keep test casts as-is for now.

---

## What's already healthy

- `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/jwt` all registered in `server/src/index.ts`.
- Per-route rate limits on `/auth/login` (10/min), `/auth/signup` (5/min), `/auth/forgot-password` (3/min).
- Razorpay webhook HMAC signature verification (`server/src/routes/billing.ts:412`).
- Production refuses to start with default `JWT_SECRET` / `tokenEncryptionKey` (`server/src/config.ts` boot guard).
- Dynamic SQL fragments in `routes/content.ts` and `routes/billing.ts` use whitelisted column names — no SQL injection.
- Strict TS, Zod validation, graceful SIGTERM shutdown, sprint-restart recovery (`recoverInterruptedSprints()` in `services/job-queue.ts`).
- 81 test files, CI workflow present (`.github/workflows/ci.yml`).
