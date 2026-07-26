> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 phasing refresh (S0–S5 + P0–P5). Superseded by `23_05/next_steps.md` → `24_05/next_steps.md` → `25_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Suggested Phasing — Refresh (2026-05-19/20)

**Supersedes:** original `dev_reports/suggested.md` (2026-04-26) — the 6-phase P0–P5 plan written for the academic-break window. Window closed, M1 in flight, server doesn't compile today → prepend a cleanup prefix (S0–S5) and renumber.

## Unique essence preserved

**Cleanup prefix S0–S5 (non-negotiable — server doesn't compile):**
- S0 — `chown` + `npm ci` (0.05 d). No toolchain, no anything.
- S1 — fix 25 broken/missing imports (0.5–1 d). `tsc` fails; no test can pass until resolved.
- S2 — consolidate 11 lazy/script tables → `schema.ts` (1 d). P1/P2 assume single source of truth.
- S3 — wrap remaining 2 Anthropic call sites into LLM gateway (1.5 d). P0.3 cost ceiling partial without this.
- S4 — repo hygiene (cosmetic; non-blocking, cheap alongside S1–S3).
- S5 — CI grep guards G1–G7 (regression prevention; must land before further analyst work). Full breakdown in `cleanup_suggestions.md` (root of `dev_reports/`).

**P0.3 (LLM cost ceiling): SHIPPED** on the gateway branch = commit `feat: api/llm rate limiting`. Removed from phasing; now an S3 follow-up.

**Phase 0 (post-S3):**
- P0.1 Sentry server+browser (0.5 d). DoD: thrown error in Sentry <30s, tagged `service`+`release`; `unhandledRejection`+`uncaughtException` captured.
- P0.2 request-id Fastify hook + `console.*`→logger (1 d). Pre-state: **96** `console.*` in prod (was 85). DoD: `grep -rE "console\.(log|error|warn)" server/src | grep -v __tests__ | wc -l` = 0 outside config.ts boot path; Sentry events carry `reqId`.
- P0.4 JWT→httpOnly cookie + refresh rotation + tokenVersion + CSRF (2–3 d). Sub-fix: add `preHandler:[app.authenticate]` to `/schedules/*`.

**Phase 1:**
- P1.1 SQLite indexes (0.5 d). Pre-state: **51** indexes (was 17); recount needed. Likely-still-missing: `subscriptions.user_id`; `cost_ledger(user_id, created_at)` composite for gateway hot query; `competitor_snapshots.client_id`; `operator_behavior.client_id`. (meta/google/tiktok_tokens.user_id are PK → OK.) DoD: `EXPLAIN QUERY PLAN` shows `SEARCH...USING INDEX` for top 10 hot queries.
- P1.2 type DB rows / remove prod `as any` (1.5–2 d). Pre-state: **78** prod `as any` (was ~35), some in new analyst services with no typed-row interface. DoD grep=0.

**Phase 2** (same shape, larger surface — now **71 tables not 40**, ref `19_05/Database_migration_strat.md`): P2.1 Drizzle proof route (2d) · P2.2 managed Postgres (1d, parallel) · P2.3 migrate all routes flagged (3d) · P2.4 data migration+cutover (3d) · P2.5 Drizzle Kit migrations as SoT (0.5d).

**Staged later (bundled into M2/M4):** P3.1 cron worker extraction (Risk B/J) · P3.2 DLQ + Sentry/Slack alerts · P4.1 retry+circuit breaker · P4.2 idempotency keys · P4.3 provider-tagged Sentry+dashboard.

**Out of scope (backlog):** P5.1 decompose `index.ts` · P5.2 split `creative-engine.ts`+`ai.ts` · P5.3 split landing/dashboard/pitch-deck components · H1 decompose `competitor-creative-intel.ts` · H2 `operator-experience.ts` · H3 `comment-mining-agent.ts`.

**Dependency order:** S0►S1►S2►S3►P0.1►P0.2. S3 parallelisable with P0.1 once S1 closes; P0.4 independent; P1 starts parallel with P0 once S2 closes; P2.2 parallel to the Drizzle migration chain.

## Cited & kept (referenced elsewhere)
- The S0–S5 + P0–P5 phasing numbering above is the source referenced by `23_05/next_steps.md` (which supersedes S0–S7) and `24_05/priority_db_vs_cleanup.md:42`.

## Pointer
- SUPERSEDED → see: `23_05/next_steps.md` (keep S0..S7 numbering) → `24_05/next_steps.md` → `25_05/next_steps.md`
