> **Status: 🔵 ACTIVE (2026-06-01)** — detailed execution plan for **DB-2** (the SQLite→Postgres call-site cutover) + the prerequisite **vitest repair**. Expands `next_steps.md §4` (M2.0–M2.9) and `../29_05/async_migration_call_site_audit.md` with concrete, current-tree numbers. Terms per `../VOCABULARY.md`.

# DB-2 Execution Plan — async cutover + test-runner repair

**Date:** 2026-06-01
**Branch:** `db-migration` (= `main` + 97; DB-1/DB-1.5 landed here)
**Goal:** Move the running app off synchronous `better-sqlite3` onto async Postgres (Neon), file-by-file, behind a backend flag, with a working test gate — then merge to `main`. **Codebase cleanup happens only after this lands** (cleanup would otherwise rewrite the same 70 files / get deleted by M2.5).

---

## 0. Ground truth (verified on the current tree, 2026-06-01)

| Fact | Value |
|---|---|
| App runtime DB | 100% `better-sqlite3` via `getDb()` → `./data/cosmisk.db`. PG layer (`db/pg.ts`) imported by **nothing** in the request path. |
| Sync `.prepare()` sites (prod) | **635** across **70** files (routes 300/30 · services 291/35 · audit 11/1 · db 8/2 · index 25/1) |
| Test `.prepare()` sites | **423** across 36 files; harness = `new Database(':memory:')` + `createTables`, injected via `vi.mock('db/index')` |
| `new Database()` bypass files (5) | `db/index.ts`, `audit/index.ts`, `services/{strategic-memory,client-context,audit-scheduler}.ts` |
| Runtime `CREATE TABLE` (6 services) | `audit-scheduler, ad-watchdog, client-context, pattern-transfer, strategic-memory, agent-orchestrator` |
| Dialect surface | `datetime('now')` **164** · upserts **9** (`OR REPLACE` 7 + `OR IGNORE` 2) · `ON CONFLICT` 10 · `json_extract` **3** · `db.transaction()` **7** · `lastInsertRowid` **1** · `AUTOINCREMENT` 6 (DDL-only) · no `strftime`/`RETURNING` |
| Test runner | **BROKEN host-wide** — `vitest 4.1.0` → `vite 8.0.1` → `rolldown 1.0.0-rc.10` native binding SIGBUS (`Bus error`, exit 135) at startup on this WSL2 kernel |
| tsc baseline | 1 pre-existing error (`routes/billing.ts:4`, stripe `@types`) |

**Why a test gate is non-negotiable here:** the audit's own strategy (§5.4) gates the cutover on "run vitest after every batch." Migrating 635 sites with no green suite = migrating blind. So **vitest repair + a Postgres test target are M2.0 blockers**, not afterthoughts.

---

## PART A — Prerequisite: repair the test runner + stand up a PG test target

### A1. Fix vitest (get off the broken rolldown native binding)

**Root cause:** vitest 4 hard-depends on vite 8, which bundles the Rust **rolldown** bundler; its prebuilt native binding (`@rolldown/binding-linux-x64-*`) segfaults on this kernel. esbuild/tsx (also native, but a different addon) work fine — so the fix is to **not run rolldown**.

**Primary fix — downgrade to vitest 3.x (esbuild-based, no rolldown):**
1. `npm i -D vitest@^3` (pulls vite 5/6/7 + esbuild; no rolldown native dep).
2. Smoke: `npx vitest run src/__tests__/agent-memory.test.ts` → expect green (no SIGBUS).
3. Run the full suite once to capture the **real baseline** (the audit notes ~8 pre-existing failures historically — record exactly which are red *before* we touch anything, so DB-2 regressions are distinguishable).
4. Pin the version in `package.json`; note the reason in a comment / this doc.

**Risk:** vitest 3 vs 4 API drift. The suite uses only stable APIs (`describe/it/expect/vi.mock/beforeEach/afterAll`) — all present in v3. Low risk.

**Fallbacks (if v3 surfaces an incompatibility):**
- (b) Try forcing rolldown's wasm/JS fallback or a clean reinstall of the native binding (fragile on this kernel — not preferred).
- (c) **CI-only gate:** run vitest on a GitHub Actions Linux runner (where rolldown works); locally rely on `tsc --noEmit` + the import-smoke harness (`$CLAUDE_JOB_DIR/tmp/import-smoke.mts`) + per-file manual exercise. Slower feedback; acceptable only if (a) and (b) both fail.

**DoD A1:** `vitest run` exits without SIGBUS; baseline red/green list recorded.

### A2. Stand up the Postgres test target (M2.0 prereq §5.5)

The 423 tests target in-memory SQLite. We need a PG target the suite can hit. Options:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **`pg-mem`** (in-process JS Postgres) | zero network, fast, no Docker, parallel-safe | incomplete dialect (jsonb/`ON CONFLICT`/`now()` quirks) — may diverge from Neon | **fast inner loop only** |
| **Local Postgres via Testcontainers / Docker** | real PG engine, accurate, isolated per run | needs Docker in the dev/CI env | **recommended for the authoritative gate** |
| **Neon test branch** | identical to prod engine; `MIGRATION_DATABASE_URL` pattern already proven | network latency per query; shared state needs per-test schema/cleanup | good for CI; slower locally |

**Recommendation:** two-tier — **`pg-mem` for the fast local inner loop**, **a real Postgres (Testcontainers locally / Neon test branch on CI) for the authoritative gate** before each flip. Decide Docker availability first; if none, Neon test branch is the real-engine fallback.

**Schema setup for the test DB:** do **not** reuse SQLite `createTables`. Apply the Drizzle migrations (`0000` + `0001`) to the test PG so the test schema == the migrated prod schema. (One helper: `migrate(testPgDb)` in a global `vitest.setup.ts`.)

**DoD A2:** a `vitest.setup.ts` provisions a clean migrated PG schema per run; the existing `pg-parity.test.ts` (from A4) runs green against it through vitest (not just tsx).

---

## PART B — DB-2 cutover (M2.0 → M2.9)

### M2.0 — Build the strangler infrastructure (the foundation; no call sites moved yet)

**B0.1 — Async DB adapter** (`src/db/adapter.ts`, new) mirroring better-sqlite3's call shape so each conversion is mechanical, not a redesign:

```ts
export interface DbAdapter {
  get<T>(sql: string, params?: unknown[]): Promise<T | undefined>;
  all<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number | string | null }>;
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (tx: DbAdapter) => Promise<T>): Promise<T>;
}
export function getDbAdapter(): DbAdapter;   // returns Sqlite or Pg impl per DB_BACKEND
```

- **SqliteAdapter** — wraps `getDb()`; methods run synchronously under the hood and `return Promise.resolve(...)`. Lets converted `await db.get(...)` sites run green on SQLite *before* Postgres exists.
- **PgAdapter** — wraps the `pgPool` (`db/pg.ts`); applies the **dialect shim** (B0.2) to every SQL string; real async.

**B0.2 — Dialect shim** (applied by PgAdapter to raw SQL):
| Rewrite | Auto? | Notes |
|---|---|---|
| `?` → `$1,$2,…` positional | ✅ auto | count placeholders left→right |
| `datetime('now')` → `now()` | ✅ auto | 164 occurrences — shim handles, **no manual edits** |
| `datetime('now','+30 days')` → `now() + interval '30 days'` | ✅ auto (small parser) | modifier form (e.g. test helper) |
| `json_extract(c,'$.x')` → `c->>'x'` | ✅ auto | 3 sites |
| `0/1` booleans | ✅ no-op | pg-schema kept these as `integer` |
| **upserts** `INSERT OR REPLACE/IGNORE`, `ON CONFLICT` | ❌ **manual** | **~9 sites** — PG needs explicit conflict target `(col) DO UPDATE/NOTHING`; cannot infer mechanically |
| `lastInsertRowid` | ❌ **manual** | **1 site** — rewrite to `INSERT … RETURNING id` |
| `db.transaction(fn)()` | ❌ **manual** | **7 sites** — convert to `await db.transaction(async tx => …)` |
| `AUTOINCREMENT` | n/a | DDL-only; removed in M2.5 |

**B0.3 — `DB_BACKEND=sqlite|postgres` flag** (`config.ts`) — selects the adapter. Default **`sqlite`** until M2.8. This is the real rollback net (flip one env var).

**B0.4 — Adapter unit tests** — run the adapter's own spec against BOTH backends (sqlite + pg test target) proving `get/all/run/transaction` + every shim rule behave identically.

**DoD M2.0:** adapter + shim + flag merged; adapter spec green on both backends; **zero call sites changed yet**; app still boots on SQLite unchanged.

### M2.1 — Pilot ✅ DONE (2026-06-01)
Converted `routes/brands.ts` (`GET /brands/list`, 2 sites) end-to-end; green on SQLite + the Neon test branch. Plus **M2.0.1 hardening** (adapter `createRequire`→ESM so `vi.mock` reaches it; pg-test serialization via advisory lock + raised `hookTimeout`). See `logs.md §7–8`.

### M2.2 — Routes, leaf-first, one file per commit — 🔵 IN PROGRESS
**Revised taxonomy (from the M2.2 Discover pass, `logs.md §9`):** the "300/30" headline overstates the work — it splits three ways:
- **0 `.prepare()` (nothing to convert, 9):** `creative-scan, health-score, intelligence, media-gen, quick-wins, schedules, score, static-ads` (+ `brands` ✅).
- **1–4 calls but NO test (~15) — needs a gate decision:** `analytics, assets, brain, competitor-spy, director, google-ads`(1), `client-portal`(2), `ad-command, ai, memory, shopify, tiktok-ads`(3), `audits`(4), `autopilot`(6). → convert with **tsc-only + manual review** (trivial read-only routes) or **characterization test first** (`audits`/`autopilot`/`client-portal`).
- **Tested, heavier → batched:** `ugc`(6), `automations`/`reports`(9), `dashboard`(11), `auth`(16), `creative-studio`/`ugc-workflows`(17), `team`(18), `agent`(19), `content`(23), `billing`(39), `creative-engine`(65). **The 9 upserts + 1 `lastInsertRowid` cluster here** (esp. `billing`, `auth`) → manual dialect.

**Done:** leaf batch ✅ `swipe-file`(3) + `ad-accounts`(4) (`8067afb`); **routes-all batch ✅ 26 files** (`1d77982`, all remaining routes except creative-engine). **Only `creative-engine.ts`(65) left** — its convert agent died mid-pass (partial → 7× TS2304); reverted + re-doing as a dedicated focused pass (Run 3b). See `logs.md §10` + `agent_report.md` (local).

Per file: replace `getDb().prepare(sql).get/all/run(...)` → `await getDbAdapter().get/all/run(sql,[...])`; await up to the (already-async) handler; convert that file's upserts/transactions manually. **`vitest` (flag=sqlite) green after each file.** **DoD:** all route files converted; suite green on sqlite.

### M2.3 — Services (291 / 35), the hard half (async colour propagates through the call graph)
Heaviest: `service-clients`(27) · `job-queue`(23) · `intelligence-persistence`(23) · `ad-watchdog`(19) · `strategic-memory`(16) · `sales-agent`(16) · `recommendation-loop`(13) · `learning-engine`(13) · `intelligence-infrastructure`(13) · `agent-memory`(13) · `audit-scheduler`(10) · then the tail.
Convert leaf services first; when a service becomes `async`, await it at every caller (routes already done in M2.2; cron/boot handled in M2.4/M2.6). Watch fan-in hot files (`service-clients`, `ad-watchdog`, `job-queue`). **`vitest` green after each file.** **DoD:** all services converted; suite green on sqlite.

### M2.4 — Re-point the 5 `new Database()` bypass files
`audit/index.ts`, `services/{strategic-memory,client-context,audit-scheduler}.ts` → use `getDbAdapter()` instead of opening their own `new Database()`. (`db/index.ts` itself is handled at M2.9.) **DoD:** `grep "new Database(" src` returns only `db/index.ts` (+ test helper); suite green.

### M2.5 — Delete runtime DDL + schema reconciliation (depends on DB-1.5 ports, already landed)
- Remove the 6 services' `CREATE TABLE IF NOT EXISTS` paths (schema is now migration-managed in `pg-schema.ts`).
- **Drop `agent_execution_log`** — remove its 3 writes (`agent-orchestrator.ts:184/205/232`); it was intentionally never ported (write-only, zero readers).
- Remove `index.ts` `waitlist_leads` runtime `CREATE TABLE` (move to migration if still needed).
- **Optional consolidations** (verified-real merges from DB-1.5 A1, only with explicit value — each = rewriting that table's readers/writers): `strategic_predictions`→`predictions`, `strategic_recommendations`→`recommendations`, `strategic_reports`→`reports`, `strategic_running_context`→`agent_core_memory`, `brands`/`client_contexts`→`service_clients`.
**DoD:** no `CREATE TABLE` outside migrations; `agent_execution_log` gone; suite green.

### M2.6 — Convert `audit/index.ts`(11) + `src/index.ts`(25) (boot/cron paths)
Already async-capable. Convert the boot-time queries (`ensureUsersColumn`, `seedReviewerAccount`-equivalent, health-check `SELECT 1`, lead/waitlist inserts) and the in-line creatives endpoints. **DoD:** server boots on `DB_BACKEND=postgres` locally and serves `/health` = ok.

### M2.7 — Port the 423 test call sites to the PG target
- Rework `__tests__/helpers/test-app.ts`: build the adapter over the PG test target (A2) instead of `new Database(':memory:')`; seed factories become `async`.
- Update the `vi.mock('db/index')` pattern → mock/inject `getDbAdapter()`.
- Convert the 423 calls to `await`; per-test schema isolation + cleanup (truncate or per-test schema).
**DoD:** full suite green against the PG test target (flag=postgres).

### M2.8 — Flip the default
Set `DB_BACKEND` default → `postgres`. Bake ≥1–2 commits with the suite green and a manual boot smoke. Keep the flag (instant rollback to sqlite) through this window. **DoD:** default postgres; suite + boot green; rollback verified by flipping back once.

### M2.9 — Retire SQLite
Once stable: delete `getDb()`/`closeDb()` SQLite path in `db/index.ts`, `schema.ts` (`createTables`), the SQLite branch of the adapter, and drop `better-sqlite3` + `@types/better-sqlite3`. **DoD:** `grep better-sqlite3 src` empty; `npm run build` + suite green; no `.db` file referenced. → **merge `db-migration` → `main`**.

---

## C. Cross-cutting

**Verification gate (every commit):** `tsc --noEmit` (≤ baseline 1 error) + `vitest run` (≥ baseline green set) + import-smoke for boot/cron-touching changes.

**Rollback:** `DB_BACKEND=sqlite` reverts the entire app to the proven path without a code change, until M2.9 removes SQLite.

**Branch:** stay on `db-migration` (DB-1/1.5 live here). Merge to `main` only at M2.9. **Cleanup arc resumes post-merge** (per `24_05/priority_db_vs_cleanup.md §7`).

**Manual-attention set (cannot be auto-shimmed) — ~17 sites:** 9 upserts + 1 `lastInsertRowid` + 7 transactions. Inventory each with a grep before M2.2 and convert deliberately.

**Pooled-endpoint caution:** app uses the PgBouncer-pooled `DATABASE_URL`; `node-postgres` prepared statements can misbehave on a transaction-pooled endpoint. The adapter should use simple/text queries (or set `pg` to not use named prepared statements) — validate in M2.0 against the pooled URL.

**Effort (single-engineer):** M2.0 ~2–3 d · M2.1 ~0.5 d · M2.2 ~3–4 d · M2.3 ~4–5 d · M2.4 ~1 d · M2.5 ~1–2 d · M2.6 ~1 d · M2.7 ~3–4 d · M2.8–2.9 ~1–2 d. **≈ 3–4 weeks.** Parallelizable across agents by file batch once M2.0 lands (adapter is the shared contract).

## D. Definition of Done (DB-2)
- App serves all routes on `DB_BACKEND=postgres`; `better-sqlite3` removed; `.db` file unused.
- `tsc` clean (≤ baseline); full `vitest` suite green against the PG test target.
- No `CREATE TABLE`/`new Database()` outside migrations; `agent_execution_log` dropped.
- `db-migration` merged to `main`.
