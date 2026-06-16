# Structural refactor + hardening: god-file decomposition, boot split, SQLite-comment sweep, secret untrack, structured logging

**Branch:** `repo-cleanup` → `main` · **28 commits** · 195 files (+28,010 / −26,218; mostly file moves into barrel sub-modules) · 178 `server/src` files touched.

## Summary
A **behavior-preserving** cleanup of the backend plus two safety fixes. No runtime behavior changes: every step was gated against an identical-results invariant (below). Splits into clear, reviewable slices (R1–R3) + Runtime-Hardening items (RH-0, RH-3). The Postgres cutover (DB-2) landed in a prior PR; this builds on it.

## What's in this PR

### R1 — Root tidy
- Moved 11 non-entry `.md` files into a `docs/` tree; root keeps only `README`/`CLAUDE`/`GEMINI`/`AGENTS`.

### R2 — God-file decomposition (barrel pattern) — 20 files + the boot file
- Each >1000-LOC service/route file is decomposed into focused modules in a file-specific sub-dir; the **original path becomes a thin re-export barrel**, so **every importer is unchanged** (public surface preserved exactly). Shared module-level state (SDK clients, caches, const tables) centralized in one module per file — never duplicated.
- Files: cohort-ltv-analyzer, learning-engine, oos-detector, comment-mining-agent, narrative-synthesis, creative-scorer, reality-testing, operator-experience, competitor-creative-intel (+ reports), ad-watchdog, ai route, creative-engine route, ad-engine/validator, self-improving-cognition, elite-decision-compression, uncertainty-intelligence, quality-gate, creative-intelligence, strategic-intelligence-engine.
- **`index.ts` 1305 → 290 LOC:** ~940 lines of inline route handlers extracted into `src/boot/{public,meta-creative,account}-routes.ts` + `meta-helpers.ts`, using a **non-encapsulated function-attach** pattern (`registerX(app)` on the root instance — *not* `app.register`, to preserve hook/decorator scoping). Verified with a live boot smoke.

### R3 — Stale-SQLite sweep
- Scrubbed post-cutover-inaccurate comments/labels; renamed `SQLitePatternStore` → `PostgresPatternStore`; updated the persistence load log line. **Preserved** the accurate `db/adapter.ts` + `db/pg.ts` dialect-shim comments (the shim genuinely still translates SQLite-flavored SQL) and the legacy-DDL history notes.

### RH-0 — 🔒 Security: stop tracking `server/.env.test`
- `.env.test` was tracked in this **public** repo with live secret values. Removed from tracking, ignored `.env.*` (except `*.example`), added `.env.test.example`. **⚠ Secrets present in prior history must be rotated — see "Action required."**

### RH-3 — Structured logging
- Migrated 106 ad-hoc `console.*` calls → the pino `logger` across 9 files (kept intentional `config.ts` pre-logger FATAL + `db/check-connection.ts` CLI).

### Docs / CLAUDE.md
- Optimized `CLAUDE.md` (thin, corrected CURRENT STATE, added Test Invariant). The committed copy retains the external-contributor **code-freeze**; maintainers keep a local active-dev copy (via `skip-worktree`).

## Verification (held identical at every step)
- Default suite **400 passed / 9 skipped** (18 files) — unchanged.
- pg suite **388 passed / 10 skipped / 0 failed** (21 files, Neon) — unchanged.
- `tsc --noEmit` — baseline-only (sole pre-existing `routes/billing.ts:4` stripe TS7016).
- `madge --circular` — **0 cycles**.
- `index.ts` change additionally verified by a live boot smoke (server starts, `/health` 200 `db:connected`, moved auth routes → 401, public routes validate, 404 handler intact).

## ⚠ Action required after merge
1. **Rotate** the secrets that were in the committed `.env.test` (Anthropic key + others) — treat as compromised.
2. (Optional) scrub them from git history (`git filter-repo`) — destructive, coordinate before force-push.

## Not in this PR (planned, specs in `dev_reports/03_06/`)
- Intelligence-layer activation (the brain is built but dormant at the `intelligence-integration.ts` seam) — Phase A–E spec.
- RH-1 LLM-gateway consolidation (Anthropic + Gemini bypasses) — spec only.
- RH-2 crons-in-API-process — folded into Bucket H (`apps/worker`).
- Bucket H monorepo restructure — plan + Phase 1-2 detail.

## Reviewer notes
- **Barrel pattern = zero importer churn:** decomposed files re-export their full original surface; diffs are large but are moves, not logic changes.
- No dependency or schema changes. No new runtime behavior.
- `CLAUDE.md` is intentionally two-versioned (public freeze / local active-dev) via `skip-worktree`.
