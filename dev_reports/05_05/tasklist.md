> **Status: ♻️ SUPERSEDED (2026-05-31)** — Apr-26 task list mirror of `suggested.md`. Superseded by `19_05/tasklist.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk Cleanup Task List — 2026-04-26

## Unique essence preserved
- Source = `suggested.md` (S0..S7 plan); this file is the human-readable mirror of the in-conversation TaskList.
- Scope convention: items prefixed `*` are NOT in the official Cosmisk SoW (April 15, 2026) and need explicit go/no-go before scheduling; in-scope/out split in `scope_alignment.md`.
- **Dependency map:** P0.1(Sentry)→P0.2(request-id),P3.2,P4.3 · P1.1+P1.2→P2.1(Drizzle proof)→P2.3(full migrate)→P2.4(cutover)→P2.5(drizzle-kit) · P2.2(managed PG)→P2.3 · P0.3,P0.4 parallel · P3.1→P3.2 · P4.1→P4.2 · P5.1/P5.2/P5.3 parallel (low risk).
- **Phase 2 scope tag (restored):** all five Phase-2 tasks (P2.1, P2.2, P2.3, P2.4, P2.5) are official-SoW **in-scope ✅ Risk #1** — not added-risk; the dependency arrows alone do not carry this tag.
- **P4.1 (id19) full DoD (restored):** "Chaos test returning 503 from one provider doesn't fail user request after retry; tripped breaker fails fast."
- **P2.1 (id12) DoD detail (restored):** "One route module migrated end-to-end" (the proof migrates a full route module, not merely tests passing on the Drizzle path).
- **P4.2 (id20) DoD qualifier (restored):** idempotency replay = one downstream effect, "(verified in staging)".

**Phase 0 — Stop the bleeding (1–2 days)**
- P0.1 (id6, ✅Risk#2): Sentry server+browser. DoD = thrown error in Sentry <30s, tagged `service`+`release`, `unhandledRejection`+`uncaughtException` captured.
- P0.2 (id7, ✅Risk#2): request-id Fastify hook + replace `console.*` with logger. DoD = `grep -rE "console\.(log|error|warn)" server/src` = 0 outside boot/fatal; Sentry events carry `reqId`.
- P0.3 (id8, *Added Risk E): per-user daily LLM cost ceiling. DoD = over-cap returns `429 {error:'daily_limit'}`; `cost_ledger` row per call.
- P0.4 (id9, *Added Risk A): JWT → httpOnly cookie + refresh rotation. DoD = JWT not JS-visible; password change bumps `tokenVersion`, invalidates old refresh tokens.

**Phase 1 — DB indexes + typed rows (2–3 days)**
- P1.1 (id10, ✅Risk#1): add missing SQLite indexes. DoD = EXPLAIN QUERY PLAN shows `SEARCH ... USING INDEX` for top-10 hot queries; >5× on top-3.
- P1.2 (id11, ✅Risk#3): type DB rows, remove prod `as any`. DoD = `grep -rE "\bas any\b" server/src | grep -v __tests__` = 0.

**Phase 2 — Postgres + Drizzle migration (1–2 weeks)** — all tasks ✅Risk#1 (in-scope SoW)
- P2.1 (id12, ✅Risk#1): adopt Drizzle, one route as proof. DoD = one route module migrated end-to-end (tests pass on Drizzle path).
- P2.2 (id13, ✅Risk#1): managed Postgres + connection pool; boot under `DATABASE_DRIVER=pg` w/ empty schema; `/health` reports DB status.
- P2.3 (id14, ✅Risk#1): migrate all routes (flagged); full suite green on both drivers; staging flag-flip smoke passes.
- P2.4 (id15, ✅Risk#1): data migration script + dual-run + cutover; 2 replicas; zero-downtime; daily backup verified by restore drill.
- P2.5 (id16, ✅Risk#1): adopt Drizzle Kit migrations, retire `addColumn` shim; zero `ALTER TABLE` shim in `schema.ts`; CI runs `drizzle-kit migrate` on clean PG.

**Phase 3 — Job queue out of API process (3–5 days)**
- P3.1 (id17, *Added Risk B): replace cron with BullMQ/pg-boss. DoD = API has zero in-process timers; killing workers leaves API responsive.
- P3.2 (id18, *Added Risk B + ✅Risk#2): DLQ + Sentry/Slack alerts. DoD = failing job in Sentry <60s + Slack post.

**Phase 4 — External-API resilience (2–3 days)**
- P4.1 (id19, *Added Risk C): retry + circuit breaker in `safeFetch`. DoD = chaos test returning 503 from one provider doesn't fail user request after retry; tripped breaker fails fast.
- P4.2 (id20, *Added Risk C): idempotency keys for Stripe/Razorpay/Resend/n8n; replayed call = one downstream effect (verified in staging).
- P4.3 (id21, *Added Risk C + ✅Risk#2): provider-tagged Sentry + health dashboard; alert when provider error rate >5% over 10min.

**Phase 5 — Decomposition (ongoing, low risk)**
- P5.1 (id22, *out-of-scope): decompose `server/src/index.ts` (1287 LOC) → <200 LOC; extracted endpoints tested.
- P5.2 (id23, *out-of-scope): split `creative-engine.ts` + `ai.ts`; no route file >600 LOC; cross-community edges routes↔`services-generate` <200.
- P5.3 (id24, *out-of-scope): split landing/dashboard/pitch-deck Angular components; none >600 LOC; main bundle drops measurably.

## Pointer
- SUPERSEDED → see: `19_05/tasklist.md`
