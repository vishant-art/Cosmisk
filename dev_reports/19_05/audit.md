> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 audit refresh. Superseded by `23_05/state_of_codebase.md` and the later migration arc.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk Codebase Audit — Refresh (2026-05-19/20)

## Unique essence preserved
- **Supersedes** `dev_reports/audit.md` (2026-04-26 @ `69b4352`). **Baseline:** `analysis-and-cleanup` @ `ebff657` (post-merge). **Graph** rebuilt 2026-05-19T19:52: 376 files / 11,209 nodes / 84,530 edges / 1,958 IMPORTS_FROM edges.
- **Headline:** codebase no longer compiles — 15 TS files import 25 non-existent modules (full list `19_05/new_and_added_risks.md` §N; remediation `19_05/cleanup_suggestions.md` S1). Masked by pre-built `dist/` + `server/dist/` from 2026-05-03 older tree. No tsc-reachable metric until fixed.
- **Risk 1 — DB (still confirmed, worse in shape)** deltas 04-26 → 05-19: schema.ts tables 35 → **60** (+25); tables outside schema.ts 5 → **11** (+6); total unique **40 → 71** (+31); `CREATE TABLE` source locations 3 → **6** (+3); secondary indexes ~17 → **51** (+34); `ensureColumn` ALTER calls = **19**; `shopify_tokens` defined twice (`schema.ts` AND `add-shopify-tables.ts`) = new **Risk K**. Pain shape (single connection, write serialisation, no horizontal scaling) identical; blast radius larger.
  - New tables outside schema.ts: `client_contexts` (services/client-context.ts); `strategic_reports`/`strategic_recommendations`/`strategic_running_context`/`strategic_predictions` (all services/strategic-memory.ts); `scheduled_audits` (services/audit-scheduler.ts); `waitlist_leads` (index.ts); `brands`/`brand_context`/`audits` (server/scripts/add-audit-tables.ts).
- **Risk 2 — visibility (still confirmed, ratios worse)** deltas: console.* in prod 85 → **96** (+11); logger.* in prod 116 → **539** (+423, 4.6×); try/catch was 108 corrected to 222, not re-measured; Sentry **none**; request-id Fastify hook **none**; unhandledRejection/uncaughtException handlers **none**; cron sites in API process 8 → **13** (+5). logger jump = new analyst services adopted pino day one; `ad-watchdog.ts` alone ~80 logger calls; console.* didn't drop because audit pipeline still uses console (per-file breakdown in `19_05/structured_logging.md`).
  - **Risk 2 verdict:** Risk 2 stands. The migration plan in `structured_logging.md` is the right shape but operates on stale counts.
- **Risk 3 — type safety (stands, materially larger)** deltas: `as any` in prod (excl `__tests__`) ~35 → **78** (+43, 2.2×); `as any` in tests ~53 not re-measured; total 104 not re-measured; `strict:true` on; Zod 229 not re-measured. Prod-cast jump = new analyst services bypassing typed-row pattern: none of `competitor-creative-intel.ts`, `oos-detector.ts`, `cohort-ltv-analyzer.ts`, `service-clients.ts`, `discount-leakage-detector.ts` declared explicit DB-row interfaces.
- **Still healthy (post-merge):** Fastify cors/helmet/rate-limit/jwt registered; per-route rate limits on `/auth/*`; Razorpay webhook HMAC verify unchanged; prod refuses to start with default `JWT_SECRET`/`tokenEncryptionKey` (`config.ts` boot guard); dynamic SQL in `routes/content.ts` + `routes/billing.ts` uses whitelisted columns (no SQLi introduced); 35 server vitest files (up from 26) + 38 frontend `*.spec.ts`; CI workflow at `.github/workflows/ci.yml` (not re-audited).
- **Finding N (CRITICAL, supersedes risk priority order):** `server/src/index.ts` + 14 other files import 25 modules absent from the working tree.

## Cited & kept (referenced elsewhere)
- Risk 1 DB metric table + new-tables list (cited by `23_05/new_findings.md:78`, `24_05/priority_db_vs_cleanup.md:31`, `24_05/sow_alignment.md:127`) — retained above with all numbers.
- `as any` prod count = 78 and god-files/type-safety counts (Risk 3) — retained.
- Findings that "remain open": Risks 1–3 all stand; Finding N build-broken open.

## Pointer
- SUPERSEDED → see: `23_05/state_of_codebase.md` (keep Risk Q + "remains open" findings — cited by 23_05/24_05).
