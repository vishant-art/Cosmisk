# `dev_reports/19_05/` — Index & Steps to Follow

**Date:** 2026-05-19/20 (refresh of all `dev_reports/*.md` produced 2026-04-26 → 2026-05-09).
**Branch:** `analysis-and-cleanup` @ `ebff657` (post-merge).

> This folder is the **current-state snapshot** of every report under `dev_reports/`. The root-level files in `dev_reports/` are kept as a historical baseline. Where numbers conflict, **trust this folder.**

---

## Contents (mapped to originals)

| Refreshed (in this folder) | Original (in `dev_reports/`) | Headline change |
|---|---|---|
| `audit.md` | `audit.md` | +1 risk N (build broken); console.* 85 → 96; as any 35 → 78 |
| `backend_wiring.md` | `backend_wiring.md` | 29 → 43 routes registered (4 broken); 28 → 82 services |
| `db_structure.md` | `db_structure.md` | 40 → 71 tables; 4 → 6 source locations |
| `Database_migration_strat.md` | `Database_migration_strat.md` | Patched per `new_database_issues.md` § 8 |
| `final_report.md` | `final_report.md` | Re-baselined for M1 in progress |
| `guide.md` | `guide.md` | 290 → 376 files; 3.6K → 11.2K nodes |
| `log.md` | `log.md` | Appends May 19–20 entries |
| `new_and_added_risks.md` | `new_and_added_risks.md` | Adds H, I, J, K, L, M (from `analysis/`), plus new N |
| `run_guide.md` | `run_guide.md` | Adds chown + cleanup prerequisites |
| `scope_alignment.md` | `scope_alignment.md` | Post-break milestone-window status |
| `structured_logging.md` | `structured_logging.md` | Recount: console 85 → 96, logger 116 → 539 |
| `suggested.md` | `suggested.md` | Prepends S0–S5 cleanup before P0–P5 |
| `tasklist.md` | `tasklist.md` | 20 → 39 items (adds S-prefix) |
| `rate_limiting/README.md` | `rate_limiting/README.md` | Track B partially complete |
| `rate_limiting/findings.md` | `rate_limiting/findings.md` | 19 direct calls → 2 |
| `rate_limiting/options.md` | `rate_limiting/options.md` | Decision (option B) shipped |
| `rate_limiting/implementation_plan.md` | `rate_limiting/implementation_plan.md` | Records what shipped, lists remaining wrap work |
| `rate_limiting/anthropic_rate_limits.md` | `rate_limiting/anthropic_rate_limits.md` | Records where limits are enforced now |

**Cross-cutting docs at the root of `dev_reports/`** (not re-written here; still authoritative):
- `cleanup_plan.md` — full plan (831 lines, 18 sections incl. merge record + self-audit).
- `cleanup_suggestions.md` — S0–S7 step-by-step (365 lines).
- `new_database_issues.md` — DB migration audit (269 lines).

---

## TL;DR of the post-merge state

1. **Build is broken.** 15 files reference 25 non-existent modules. Highest priority finding.
2. **Schema fragmentation has doubled.** 71 tables across 6 source locations (was 40 / 4).
3. **LLM gateway shipped, partially adopted.** 20 files wrapped, 2 services still bypass (`competitor-creative-intel.ts`, `comment-mining-agent.ts`).
4. **Repo hygiene drifted.** `dev_reports/` is `.gitignore`'d but tracked; `analysis/` is untracked; 5 stale branches.
5. **Risks A–N enumerated.** 14 total. 8 in scope, 4 owner-gated, 2 deferred.

---

## Steps to follow — single ordered list

This is the canonical sequence. Each step has an owner gate (see `scope_alignment.md` § 6 for the full gate list). Effort estimates assume one engineer, no toolchain delays.

### Phase Z — Pre-flight (TODAY)

| # | Step | Gate | Effort | Where documented |
|---|---|---|---|---|
| Z.1 | Answer the 11 owner gates (OG-1 through OG-11) in `19_05/scope_alignment.md` § 6 | n/a | 30 min | `19_05/scope_alignment.md` |
| Z.2 | Take a snapshot of `cosmisk.db` before any DB-touching work | n/a | 1 min | `19_05/run_guide.md` |

### Phase S — Cleanup prefix (3.5 working days)

| # | Step | Gate | Effort | Doc |
|---|---|---|---|---|
| S0.1 | `sudo chown -R $USER:$USER server/data server/node_modules node_modules .angular dist server/dist` | OG-1 | 5 min | `19_05/run_guide.md` § 0 |
| S0.2 | `npm ci && npm --prefix server ci` | — | 5 min | `19_05/run_guide.md` § 3.2 |
| S1.1 | Resolve 4 missing route imports (`health-score`, `creative-scan`, `quick-wins`, `static-ads`) — delete OR stub OR recover | OG-2 | 1 h | `cleanup_suggestions.md` S1.1 |
| S1.2 | Resolve `intelligence-integration.js` (delete callers OR recover) | OG-3 | 30 min | `cleanup_suggestions.md` S1.2 |
| S1.3 | Resolve `utils/encryption.js` (likely repoint to `token-crypto.ts`) | none | 30 min | `cleanup_suggestions.md` S1.3 |
| S1.4 | Resolve `ad-engine/` cluster (4 imports — recover OR delete folder) | OG-4 | 1 h | `cleanup_suggestions.md` S1.4 |
| S1.5 | Resolve `learning-engine.ts` → `client-references.js` | OG-4 | 30 min | `cleanup_suggestions.md` S1.5 |
| S1.6 | Resolve `strategic-cognition/` → `signal-discovery/` (4 imports) | OG-5 | 1 h | `cleanup_suggestions.md` S1.6 |
| S1.7 | Resolve `unified-agent-runner.ts` → 12 analyser files (recover OR delete) | OG-6 | 2 h | `cleanup_suggestions.md` S1.7 |
| S1.x | **Verify:** `npm --prefix server run build && npm --prefix server run test` exits 0 | — | — | — |
| S2.1 | Snapshot `cosmisk.db` to `server/data/cosmisk.db.snapshot-<ts>` | — | 1 min | `19_05/db_structure.md` |
| S2.2 | Collapse `shopify_tokens` dual definition (delete from `add-shopify-tables.ts`) | none | 30 min | `cleanup_suggestions.md` S2.2 |
| S2.3 | Move `brands`, `brand_context`, `audits` from `add-audit-tables.ts` into `schema.ts` | — | 2 h | `cleanup_suggestions.md` S2.3 |
| S2.4 | Move `client_contexts` into `schema.ts` | — | 30 min | `cleanup_suggestions.md` S2.4 |
| S2.5 | Move `strategic_*` (×4) into `schema.ts` | — | 1 h | `cleanup_suggestions.md` S2.5 |
| S2.6 | Move `scheduled_audits` into `schema.ts` | — | 30 min | `cleanup_suggestions.md` S2.6 |
| S2.7 | Move `waitlist_leads` from `index.ts` into `schema.ts` | — | 30 min | `cleanup_suggestions.md` S2.7 |
| S3.1 | Wrap `competitor-creative-intel.ts` with `createMessage` (~2,614 LOC, no tests — write smoke first) | OG-7 | 1 d | `19_05/rate_limiting/implementation_plan.md` § 2.1 |
| S3.2 | Wrap `comment-mining-agent.ts` (~1,818 LOC) | OG-7 | 0.5 d | same |
| S3.3 | Inspect `utils/claude-helpers.ts` — wrap if it instantiates the SDK | — | 30 min | `19_05/rate_limiting/findings.md` § 1.2 |
| S3.4 | Operator-script policy: synthetic principal `userId: 'operator:<name>'` (recommend Path A) | OG-7 | 0.5 d | `cleanup_suggestions.md` S3.4 |
| S3.5 | Dedupe `job-queue.ts checkDailyLimit` against gateway's | — | 30 min | `19_05/rate_limiting/implementation_plan.md` § 2.4 |
| S4.1 | `git mv analysis/new_added_risks_and_design.md dev_reports/new_added_risks_and_design_2026-05-09.md` | — | 1 min | `cleanup_suggestions.md` S4.1 |
| S4.2 | Decide `dev_reports/` tracking policy (recommend B: keep tracked, remove from `.gitignore`) | OG-8 | 5 min | `cleanup_plan.md` § 3.2 |
| S4.3 | Triage stale branches: `origin/claude/*` (×3), local `dev`, `lean-devcontainer` (archive-tag + delete) | OG-9 | 15 min | `cleanup_plan.md` § 3.4–3.5 |
| S4.4 | Remove `server/scripts/warmup*.log` from git; add to `.gitignore` | — | 5 min | `cleanup_plan.md` § 4.2 |
| S4.5 | Move 10 root-level marketing `.md` files into `docs/{business,meta-review,ops,historical}/` | OG-10 | 1 h | `cleanup_plan.md` § 4.6 |
| S4.6 | Reconcile `mcp-servers/` with CLAUDE.md claims (add missing OR delete claims) | — | 15 min | `cleanup_plan.md` § 4.3 |
| S5 | Add CI grep guards G1–G7 to `.github/workflows/ci.yml` | — | 2 h | `cleanup_plan.md` § 8 |

**Verify after Phase S:** `npm --prefix server run build`, `npm --prefix server run test`, server boots in dev, code-review-graph rebuild produces stable counts.

### Phase P — Original phased plan (5–7 days)

| # | Step | Effort | Doc |
|---|---|---|---|
| P0.1 | Wire Sentry (server `@sentry/node` + browser `@sentry/angular-ivy`); capture `unhandledRejection` + `uncaughtException`; tag with `userId` + `service` + `release` | 0.5 d | `19_05/structured_logging.md` § 5 |
| P0.2 | Add Fastify `onRequest` hook for `reqId`; bulk-replace 96 `console.*` → `logger.*`; add ESLint `no-console` rule | 1 d | `19_05/structured_logging.md` |
| P0.4 | Move JWT to httpOnly cookie + refresh-token rotation + `tokenVersion` + CSRF; add `preHandler: [app.authenticate]` to `/schedules/*` | 2–3 d | `19_05/new_and_added_risks.md` § A |
| P1.1 | Add missing SQLite indexes (re-baselined from 51-index current state); top-10 hot queries via `EXPLAIN QUERY PLAN` | 0.5 d | `19_05/Database_migration_strat.md` § 4.1, § 7 |
| P1.2 | Type DB rows; remove 78 production `as any` | 1.5–2 d | `19_05/audit.md` Risk 3 |
| P2.1 | Adopt Drizzle ORM (one route as proof) | 2 d | original `suggested.md` P2 |
| P2.2 | Stand up managed Postgres + pool (Railway/Neon/Supabase — owner picks) | 1 d | original |
| P2.3 | Migrate all routes to Drizzle (flagged) | 3 d | original |
| P2.4 | Data migration script + dual-run + cutover | 3 d | original |
| P2.5 | Drizzle Kit migrations as SoT; retire `ensureColumn` shim | 0.5 d | original |

### Phase M (next) — bundled into milestones

| Item | When | Doc |
|---|---|---|
| Cron worker extraction (Risk B/J) | M4 — or P1 if cadence rises further | `19_05/new_and_added_risks.md` § J |
| Retry + CB on external APIs (Risk C) | M2/M4 bundled | `19_05/new_and_added_risks.md` § C |
| Decomposition of `competitor-creative-intel.ts` (Risk H) | post-M5 backlog | `19_05/new_and_added_risks.md` § H |
| Python scrapers dep policy (Risk M) | owner-gated | `19_05/new_and_added_risks.md` § M |

---

## Verification matrix (per step)

Each step is "done" when its check passes. The full matrix lives in `cleanup_plan.md` § 11 + `cleanup_suggestions.md` § verification. Key gates:

| Phase | Verification |
|---|---|
| S0 | `stat -c %U server/data` ≠ root |
| S1 | `npm --prefix server run build` exit 0 |
| S2 | `grep -rE "CREATE TABLE" server/src server/scripts --include='*.ts' \| grep -v schema.ts \| grep -v __tests__` empty |
| S3 | `grep -c "new Anthropic" server/src/services/competitor-creative-intel.ts` = 0 (same for comment-mining) |
| S4 | `git status` clean (no untracked / no stale branches) |
| S5 | Synthetic regression PR fails CI |
| P0.1 | Manually-thrown error reaches Sentry in <30 s |
| P0.2 | `grep -rE "console\\." server/src \| grep -v __tests__ \| grep -v config.ts \| wc -l` = 0 |
| P1.1 | Top-10 hot queries show `SEARCH ... USING INDEX` in `EXPLAIN QUERY PLAN` |
| P1.2 | `grep -rE "\\bas any\\b" server/src \| grep -v __tests__ \| wc -l` = 0 |
| P2.4 | Production runs on PG; two replicas; zero-downtime deploy; daily backup verified by restore drill |

---

## Total effort

| Phase | Effort |
|---|---|
| Z (pre-flight) | 30 min |
| S0 (env) | 10 min |
| S1 (build fix) | 0.5–1 d |
| S2 (schema) | 1 d |
| S3 (gateway finish) | 1.5 d |
| S4 (hygiene) | 0.5 d |
| S5 (CI guards) | 0.25 d |
| P0.1 (Sentry) | 0.5 d |
| P0.2 (request-id + console) | 1 d |
| P0.4 (cookie auth) | 2–3 d |
| P1.1 + P1.2 (indexes + typed rows) | 2–2.5 d |
| P2.1–P2.5 (Drizzle + PG cutover) | 9–10 d |
| **Total (S + P)** | **~18–20 engineering days** |

Realistic timeline with owner-gate latency: **~4 weeks**, vs the 9-day window M1 allotted. Either compress P2 (e.g., skip P2.4 dual-run) or accept M1 slip into early M2.

---

## What I recommend you do right now

1. **Read `dev_reports/cleanup_suggestions.md` end to end** (~10 min). It's the action-oriented version of all this.
2. **Answer the 11 owner gates** (OG-1 through OG-11) — most are yes/no, none take more than a sentence.
3. **Run S0.1** (the chown) so further work can proceed.
4. **Spend half a day on S1** — pick the cheapest path (likely "delete the imports") for each missing-module group and unblock the build.
5. **Push the merge commit `ebff657` to `origin/analysis-and-cleanup`** once the build is green (this is non-destructive — see `cleanup_plan.md` § 18.7).

After that, the rest of S2–S5 and P0–P2 follows the order above without further owner intervention.

---

**End of index.**
