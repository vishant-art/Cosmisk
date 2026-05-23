# Suggested Phasing — 2026-04-26

Phased by **risk × effort × blast-radius**, not by audit category. Each phase ships independently. Estimates assume one engineer full-time.

---

## Phase 0 — Stop the bleeding (1–2 days, low risk)

Goal: become un-blind in production, stop unbounded spend, close the localStorage JWT gap.

1. Wire **Sentry** (server + browser). One project, tag by `service` + `release`. Capture `unhandledRejection` and `uncaughtException`.
2. Add a **request-id Fastify hook**. Replace 85 `console.*` calls with `request.log.*` / `logger.*`.
3. Add a **per-user daily LLM cost ceiling** in `routes/ai.ts` and `routes/agent.ts` using the existing `cost_ledger` table. Deny with `429` once exceeded.
4. Move JWT to **httpOnly + SameSite=Lax + Secure cookie**. Add CSRF token for state-changing routes. Shorten access token to 15–60 min, add refresh-token rotation, add `tokenVersion` for instant revocation.

**Done when:** Sentry receives a manually triggered error, a load-test exceeding the daily LLM cap returns 429, no JWT visible in `document.cookie` from JS, no `localStorage.cosmisk_token` in the running app.

---

## Phase 1 — DB indexes + typed rows (2–3 days, low risk)

Goal: kill full-table scans on SQLite *now* and remove the worst `as any` casts. No infra change.

5. Add missing indexes: `users.email`, `meta_tokens.user_id`, `google_tokens.user_id`, `campaigns.user_id`, `subscriptions.user_id`, `user_usage(user_id, period)`, `automations.user_id`, `creative_sprints.user_id`, `agent_core_memory.user_id`, `tiktok_tokens.user_id`, `score_predictions(brand_id, created_at)`, `activity_log(user_id, created_at)`. Confirm with `EXPLAIN QUERY PLAN`.
6. Generate **typed row interfaces** for every `db.prepare(...).get()` and `.all()`. Replace the ~35 production `as any` DB casts with `as UserRow`, `as BrandRow`, etc. Tests stay as-is.

**Done when:** all production `as any` count = 0 outside tests; `EXPLAIN QUERY PLAN` shows `SEARCH ... USING INDEX` instead of `SCAN` for the top 10 hot queries.

---

## Phase 2 — Postgres + Drizzle migration (1–2 weeks, medium risk)

Goal: unblock multi-replica deploys, real migrations, real backups.

7. Adopt **Drizzle ORM** against the existing schema; generate models. Swap `db.prepare(...)` calls progressively, one route module at a time, behind a feature flag.
8. Stand up **managed Postgres** (Railway Postgres / Neon / Supabase) with connection pooling (`pg-pool` in-app, or PgBouncer for higher load).
9. Write a one-shot **data migration script**. Dual-run for 24h (write to both, read from SQLite). Cut over reads. Cut over writes. Decommission SQLite.
10. Adopt **Drizzle Kit migrations** as the source of truth. Retire the `addColumn` shim.

**Done when:** all reads/writes go through Drizzle, two replicas run in production without conflicts, deploy is zero-downtime, automated daily backups verified by a restore drill.

---

## Phase 3 — Job queue out of the API process (3–5 days, medium risk)

Goal: stop cron + SQLite + Node-process tangling.

11. Replace `node-cron` and `cron` schedules with **BullMQ on Redis** (preferred) or **pg-boss** (zero-Redis option). Workers run in a separate process; the API only enqueues.
12. Convert each existing schedule into a repeatable job. Add a dead-letter queue. Pipe failures to Sentry + Slack.
13. Keep `recoverInterruptedSprints()` semantics — but as a queue feature, not bespoke logic.

**Done when:** the API process has zero in-process timers; killing all worker processes does not affect API responsiveness; failed jobs surface in Sentry within 60s.

---

## Phase 4 — External-API resilience layer (2–3 days)

Goal: stop letting a 503 from Gemini break a user flow.

14. Extend `safeFetch` with **exponential backoff + jitter** (3 attempts, retry only on network errors and 5xx).
15. Add **per-provider circuit breaker** (`opossum` or `cockatiel`). One open breaker fails fast for that provider only.
16. Add **idempotency keys** for Stripe, Razorpay, Resend, n8n webhooks before turning retries on for those.
17. Tag every `ExternalApiError` with provider name in Sentry; build a "provider health" dashboard.

**Done when:** retry/circuit-breaker covers all `safeFetch` callers, Sentry has provider-tagged errors, a chaos test that returns 503 from one provider doesn't fail the user request.

---

## Phase 5 — Decomposition (ongoing, low risk)

Goal: shrink god-files; reduce cross-community coupling.

18. Break `server/src/index.ts` (1287 LOC) — move ad-hoc endpoints into proper route modules; the bootstrap should be ~150 LOC.
19. Break `server/src/routes/creative-engine.ts` (1641 LOC) and `server/src/routes/ai.ts` (1371 LOC) into per-feature subroutes.
20. Break `landing.component.ts` (1920 LOC), `dashboard.component.ts` (1244 LOC), `pitch-deck.component.ts` (1214 LOC) into 4–6 standalone Angular components each, lazy-loaded where possible.

**Done when:** no single file > 600 LOC; cross-community edges between `routes` and `services-generate` drop below 200 (was 387).
