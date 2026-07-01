> **Status: ♻️ SUPERSEDED (2026-05-31)** — Apr-26 phased plan (P0–P5). Superseded by `19_05/suggested.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Suggested Phasing — 2026-04-26

## Unique essence preserved

P0–P5 phasing (predecessor numbering to the S0–S7 plan in `19_05/suggested.md`). Ordered by **risk × effort × blast-radius**; each phase ships independently; estimates assume one engineer full-time. Unique hard numbers / targets:

- **P0 Stop the bleeding (1–2d, low risk):** wire Sentry (server+browser, one project, tag by `service`+`release`, capture `unhandledRejection`/`uncaughtException`); request-id Fastify hook replacing **85** `console.*` calls with `request.log.*`/`logger.*`; per-user daily LLM cost ceiling in `routes/ai.ts` + `routes/agent.ts` via existing `cost_ledger` table, deny `429`; move JWT to httpOnly+SameSite=Lax+Secure cookie + CSRF token + 15–60min access token + refresh-token rotation + `tokenVersion` for instant revocation. Done = Sentry receives triggered error, load-test over cap returns 429, no JWT in `document.cookie`, no `localStorage.cosmisk_token`.
- **P1 DB indexes + typed rows (2–3d, low risk):** add indexes on `users.email`, `meta_tokens.user_id`, `google_tokens.user_id`, `campaigns.user_id`, `subscriptions.user_id`, `user_usage(user_id, period)`, `automations.user_id`, `creative_sprints.user_id`, `agent_core_memory.user_id`, `tiktok_tokens.user_id`, `score_predictions(brand_id, created_at)`, `activity_log(user_id, created_at)`; type ~**35** production `as any` DB casts (`as UserRow`/`as BrandRow`), tests stay. Done = production `as any` = 0 outside tests; `EXPLAIN QUERY PLAN` shows SEARCH-USING-INDEX not SCAN on top 10 hot queries.
- **P2 Postgres + Drizzle (1–2wk, medium risk):** Drizzle ORM against existing schema (progressive swap behind feature flag); managed Postgres (Railway/Neon/Supabase) + pooling (`pg-pool` or PgBouncer); one-shot migration script with 24h dual-run (write both, read SQLite → cut reads → cut writes → decommission); Drizzle Kit migrations as source of truth; retire `addColumn` shim. Done = all reads/writes go through Drizzle, two replicas run in production without conflicts, deploy is zero-downtime, automated daily backups verified by a restore drill.
- **P3 Job queue out of API (3–5d, medium risk):** replace `node-cron`/`cron` with BullMQ on Redis (preferred) or pg-boss (zero-Redis); workers in separate process, API only enqueues; DLQ piping failures to Sentry+Slack; keep `recoverInterruptedSprints()` semantics as a queue feature. Done = zero in-process timers; failed jobs surface in Sentry <60s.
- **P4 External-API resilience (2–3d):** `safeFetch` exponential backoff+jitter (3 attempts, retry only network+5xx); per-provider circuit breaker (`opossum`/`cockatiel`); idempotency keys for Stripe, Razorpay, Resend, n8n webhooks; provider-tagged `ExternalApiError` + provider-health dashboard. Done = retry/circuit-breaker covers all `safeFetch` callers, Sentry has provider-tagged errors, a chaos test that returns 503 from one provider does not fail the user request.
- **P5 Decomposition (ongoing, low risk):** break `index.ts` (1287 LOC → ~150), `routes/creative-engine.ts` (1641), `routes/ai.ts` (1371), `landing.component.ts` (1920), `dashboard.component.ts` (1244), `pitch-deck.component.ts` (1214). Done = no file >600 LOC; `routes`↔`services-generate` cross-community edges below 200 (was **387**).

## Pointer
- SUPERSEDED → see: `19_05/suggested.md` (S0–S7 full restatement)
