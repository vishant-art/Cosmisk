> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 task-list refresh. Superseded by `23_05/next_steps.md` → `24_05/next_steps.md` → `25_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Cosmisk Cleanup Task List — Refresh (2026-05-19/20)

Supersedes `dev_reports/tasklist.md` (2026-04-26). Prepends cleanup steps (S0–S5) before original P0–P5. Original 20 tasks remain valid; deps now include S-prefix.

## Unique essence preserved

**Dependency map:** S0(env)→S1(build)→S2(schema)→S3(gateway wrap)→S4(hygiene)→S5(CI guards). S2 fans out → P0.1→P0.2 (+P3.2 DLQ alerts, P4.3 provider tags); P0.4 cookie auth; P1.1 indexes; P1.2 typed rows→P2.1 Drizzle proof→P2.3→P2.4→P2.5; P2.2 managed PG→P2.3. P3.1→P3.2; P4.1→P4.2; P5.1/2/3 + H1/H2/H3 parallel, out of scope.

**Cleanup prefix tasks (NEW) — ID · gate · DoD:**
- S0 (OG-1): chown root-owned dirs + npm ci server → `npm --prefix server run build` exits 0.
- S1.1 (OG-2): resolve 4 missing route imports — health-score, creative-scan, quick-wins, static-ads.
- S1.2 (OG-3): resolve `intelligence-integration.js`.
- S1.3: resolve `utils/encryption.js` (shopify) → imports point to `token-crypto.js`.
- S1.4 (OG-4): resolve `ad-engine/` cluster (4 imports).
- S1.5 (OG-4): `learning-engine.ts` → `client-references.js` (path A or B).
- S1.6 (OG-5): `strategic-cognition/` → `signal-discovery/` (4 imports, path A or B).
- S1.7 (OG-6): `unified-agent-runner.ts` → 12 analyser files (path A or B).
- S1.x: `npm --prefix server run build && test` exit 0.
- S2.1: snapshot `cosmisk.db` → `server/data/cosmisk.db.snapshot-*`.
- S2.2 (Risk K): collapse `shopify_tokens` dual definition — only `schema.ts` defines it; CI guard added.
- S2.3: move `brands`/`brand_context`/`audits` into `schema.ts` (`add-audit-tables.ts` no CREATE TABLE).
- S2.4: move `client_contexts` into `schema.ts` (remove lazy init in `client-context.ts`).
- S2.5: move `strategic_*` (×4) into `schema.ts` (remove lazy init in `strategic-memory.ts`).
- S2.6: move `scheduled_audits`. S2.7: move `waitlist_leads`.
- S3.1 (Risk I, OG-7): wrap `competitor-creative-intel.ts` in gateway → `grep -c 'new Anthropic'` = 0.
- S3.2 (Risk I, OG-7): wrap `comment-mining-agent.ts` in gateway → `grep -c 'new Anthropic'` = 0.
- S3.3: check `utils/claude-helpers.ts` for SDK instantiation; wrap if needed.
- S3.4 (Risk L, OG-7): operator-script gateway policy — gateway accepts `operator:<name>` principals OR bypass flag.
- S4.1: move `analysis/` into `dev_reports/`. S4.2 (OG-8): `dev_reports/` tracking policy in `.gitignore`.
- S4.3 (OG-9): triage stale branches (3× claude/* + dev + lean-devcontainer).
- S4.4: remove warmup logs from git → `git ls-files server/scripts/warmup*.log` empty.
- S4.5 (OG-10): move marketing/business docs to `docs/`; keep CLAUDE.md + README.md + AGENTS.md at root.
- S4.6: reconcile `mcp-servers/` with CLAUDE.md claims.
- S5: CI grep guards G1–G7 — synthetic regression PR fails CI.

**Original phase tasks (refreshed DoD):**
- P0.1 (task 6, Risk #2): wire Sentry server+browser — error received within 30s; `unhandledRejection`+`uncaughtException` captured.
- P0.2 (task 7): request-id hook + replace 96 `console.*` with logger — `grep -rE "console\.(log|error|warn)"` outside `config.ts` = 0.
- P0.3 (task 8): DONE on `analysis-and-cleanup` branch (`feat: api/llm rate limiting`); followed by S3.x.
- P0.4 (task 9, Risk A): JWT → httpOnly cookie + refresh rotation + CSRF + tokenVersion + fix `/schedules/*` no-auth.
- P1.1 (task 10, Risk #1): add SQLite indexes (recount from 51 baseline) — EXPLAIN QUERY PLAN shows SEARCH...USING INDEX top-10 hot; >5× on top-3.
- P1.2 (task 11, Risk #3): type DB rows, remove 78 production `as any` — `grep 'as any'` outside `__tests__` = 0.
- P2.x effort stretched (71 tables not 40; see `19_05/Database_migration_strat.md`). Tasks 12-16: P2.1 Drizzle proof · P2.2 managed PG+pool · P2.3 migrate routes flagged · P2.4 data migration+dual-run+cutover · P2.5 Drizzle Kit migrations, retire `addColumn` shim.
- Task17 P3.1 cron→BullMQ/pg-boss (Risk B/J, promote to P1 if cadence rises); task18 P3.2 DLQ+Sentry/Slack alerts.
- Task19 P4.1 retry+circuit breaker in `safeFetch`; task20 P4.2 idempotency keys (Stripe/Razorpay/Resend/n8n); task21 P4.3 provider-tagged Sentry+health dashboard.
- Phase 5 decomposition LOC (out of scope): task22 `index.ts` 1326; task23 `creative-engine.ts` 1641 + `ai.ts` 1379; task24 landing 1920/dashboard 1244/pitch-deck 1214. NEW H1 `competitor-creative-intel.ts` 2614 (Risk H, decisive); H2 `operator-experience.ts` 2788; H3 `comment-mining-agent.ts` 1818.

**Counts at a glance:** tasks 20 → 20+19 S-prefix = 39; in-scope 12 → 20; out-of-scope 8 (P5 + risks A/B/C/E/F/G) → 6 (P5 + Risks B/C/M; Risks A and E now fully in scope).

## Pointer
- SUPERSEDED → see: `23_05/next_steps.md` (→ `24_05/next_steps.md` → `25_05/next_steps.md`).
