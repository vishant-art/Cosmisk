# Dev Log — 2026-06-02 (DB-2 migration: Buckets A→E)

> Macroscopic narrative of the agentic execution finishing Phase 1 (SQLite→Postgres).
> Branch `db-migration`. Microscopic per-run control lives in the gitignored
> `dev_reports/agent_report.md`; the harness spec is in `temp_reports/agentic_harness.md`.

## Plan for the day
Finish the migration tail with the 4-role agentic harness (Planner / Orchestrator /
Observer / Barrier), then flip & retire sqlite and merge to `main`. **Stop before Bucket F**
(cleanup), which runs later on a new branch off `main`.

Buckets:
- **A** — service tail: recommendation-loop, learning-engine, intelligence-infrastructure,
  ad-watchdog (+cohort-ltv), sales-agent, billing helpers, llm-gateway (last).
- **B** — bypass-file DB conversion: strategic-memory, audit-scheduler, client-context.
- **C** — runtime DDL removal: agent-orchestrator.
- **D** — boot/cron: `src/index.ts`, `src/audit/index.ts`.
- **E** — port tests to pg / flip `DB_BACKEND` default / retire sqlite → merge to `main`.

Commit discipline: one file per commit, only after the wave Barrier emits **GO**; commits
exclude `CLAUDE.md` + `.env.test`; no AI attribution.

---

## Wave log

<!-- One section appended per wave as it completes: targets, agent actions, barrier verdict, commits. -->

### Wave A1 — recommendation-loop / learning-engine / intelligence-infrastructure (LAUNCHED)
- **Workflow** `wf_d8489b7e-acd` (5 phases: Plan → Convert → Cascade → Observe → Barrier).
- **Targets:** 3 disjoint 13-site services. No manual-dialect (datetime/json_extract handled by the shim).
- **Design:** Convert agents run in parallel but edit only their own file; cross-file importer
  awaits are propagated by a single serial Cascade agent (collision-free). Importer fan-in:
  recommendation-loop→8 (ripples partial-async into A2 files ad-watchdog/cohort-ltv),
  learning-engine→4, intelligence-infrastructure→0.
- **Gate:** Observer red-flag review + Barrier (tsc baseline-only + full suite 0/≥921/19).
- **Result:** all technical gates **GREEN** — 3 files converted (0 leftover `.prepare`, intra-file tsc clean), Cascade patched **8 importers / +11 awaits**, `tsc` baseline-only, full suite **921 / 0 / 19**, `adapter.test` green first run (no flake).
- **Barrier verdict:** mechanical **NO-GO** — forced *solely* by the Observer flagging the live Neon credential tracked in `server/.env.test`. **Orchestrator override → GO:** that finding is pre-existing (in every prior commit), out of this wave's diff, already excluded from all commits, and is tracked as post-merge hygiene (not done unilaterally). Conversion work is verified green.
- **Commits (incremental, 1 per converted service):**
  - `fbe60f9` recommendation-loop (13) + cascade awaits across 8 importers (oos/discount-leakage/organic-paid/competitor-creative-intel/ad-watchdog/cohort-ltv/fatigue/creative-scorer)
  - `d296212` learning-engine (13) — no importer changes (callers already awaited)
  - `f1703b6` intelligence-infrastructure (13) — self-contained
- **Note:** ad-watchdog + cohort-ltv now carry partial-async coloring (await on `agentRecommend`); full conversion lands in Wave A2.

### Wave A2 — ad-watchdog (26) + cohort-ltv (1) + sales-agent (16) — `wf_9b906e41-dee`
- **Convert:** 0 leftover `.prepare`/`getDb` in all 3 files; dropped a dead `getDb()` in cohort-ltv. Cascade needed **zero** edits (every exported fn was already async at HEAD; only the private `getPastDecisions` flipped sync→async and is awaited intra-file).
- **Barrier NO-GO (real regression caught):** 13 deterministic failures in `ad-watchdog.test.ts`, `tsc` baseline-only, sales-agent/cohort-ltv clean.
  - **Root cause (test-mock contract gap, NOT a production bug):** `SqliteAdapter.run()` reads `res.lastInsertRowid`/`res.changes`; the test's `mockDbRun` was a bare `vi.fn()` returning `undefined` → `TypeError`. At HEAD the code called `.run()` and ignored the return, so `undefined` was harmless. Post-conversion the `await db.run(INSERT agent_runs)` sits before the inner try → the throw rejected the whole `Promise.allSettled` callback → `totalRuns` stayed 0.
  - **Fix:** `mockDbRun.mockReturnValue({ changes: 1, lastInsertRowid: 1 })` in `beforeEach` (real better-sqlite3 always returns this). Re-gate: **921 / 0 / 19**, tsc baseline-only, pg tests clean.
- **REUSABLE M2.7 LEARNING:** any test that mocks `getDb().prepare().run()` must make the mocked `run` return a `{ changes, lastInsertRowid }` object — the async adapter reads those fields. Audit all test mocks for this when porting in M2.7.
- **Commits:** `4ba8f0a` ad-watchdog(26)+cohort-ltv(1)+test-fix · `7171ca4` sales-agent(16).

### Wave A3 — billing helpers (9) + llm-gateway (4) — `wf_104bb5a9-26c` — **closes Bucket A**
- **Convert:** 6 billing helpers async (getCurrentPeriod stays pure); llm-gateway — Planner caught a **4th DB site** in `recordCost` beyond the pre-scan's 3 fns. 0 leftover `.prepare`.
- **Cascade** (real this time): patched `usage-limiter.ts` (made `trackX` decorators async), `team.ts`, `creative-engine.ts`, `job-queue.ts` — +9 awaits, tsc baseline-only.
- **Barrier GO (fix-playbook self-heal):** first run 920/1/19 — `llm-gateway.test.ts` read `.spent` off the now-async `checkDailyLimit` Promise. Barrier applied the carried fix-playbook (await the call — test-contract fix, not production), re-ran → **921 / 0 / 19**, tsc baseline-only. No human override cycle.
- **Commits:** `3256333` billing helpers + cascade (team/usage-limiter/creative-engine) · `0ace184` llm-gateway + cascade (job-queue) + test fix.

**✅ Bucket A complete.** Remaining sync `.prepare`: strategic-memory(16)/audit-scheduler(10)/client-context(5) [B], agent-orchestrator(5) [C], index.ts(25)/audit/index.ts(11) [D].

### Harness v2 applied (from Bucket B onward)
Per efficiency review of A1/A2 telemetry (4 fixed-overhead agents + 1 suite/wave; only 2–3 of 16 slots used): **drop Planner** (pre-scan→embedded spec), **conditional Cascade** (skip when no importer needs awaits), **incremental `tsc`**, **defer `adapter.test.ts`** to the final pre-merge gate (~18s/wave saved), **inline recipe example** (no reference-file reads), **carried fix-playbook**. Bucket-sized waves kept (B together; C, D separate — boot files need serial boot-smoke). Full rationale in `temp_reports/agentic_harness.md` §"Harness v2".

### Bucket B (M2.4) — strategic-memory(16) + audit-scheduler(10) + client-context(5) — `wf_7de0319c-741`
- **Convert:** 0 leftover `.prepare` in all 3; strategic-memory's `INSERT OR REPLACE` → `ON CONFLICT(client_id) DO UPDATE` (client_id confirmed PK in pg-schema). Convert agents correctly flagged that `client-context` had 4 importers the pre-scan missed.
- **Cascade:** +35 awaits across 14 files. **Barrier NO-GO** — tsc baseline-only AND fast-suite green (902/0/19), but the **Observer caught 3 real fire-and-forget/missed-await bugs tsc cannot see** (`schedules.ts` handlers, `index.ts:312` boot init, `unified-agent-runner` recordReport) + 1 warn (`pattern-transfer`).
- **Orchestrator fix pass:** awaited the 4 flagged sites, then ran a **codebase-wide fire-and-forget sweep** → found **8 MORE** unawaited `recordReport(...)` telemetry calls (agent-registry, fatigue/oos/discount-leakage detectors, cohort-ltv, creative-scorer, multi-account/multi-region aggregators) the Cascade never touched. Fixed: 7 in async contexts → `await`; `agent-registry.recordAgentReport` is sync void → fire-and-forget `void recordReport(...).catch(...)`. Reverted 2 false positives (sweep matched local class methods named `recordPrediction`). Re-gate: tsc baseline-only, full suite **921/0/19**.
- **Commits:** `a24a94e` strategic-memory+shared cascade · `e582872` audit-scheduler+schedules+boot · `9fb2607` client-context+test.

> **🔑 v3 HARNESS LEARNING — the Cascade must SWEEP for fire-and-forget, not just trust tsc.**
> The Cascade agent only patched files where `tsc` errored (value-consumed Promises). It missed every *discarded-return* call (`fn(x);` as a statement), fastify handler `return fn()`, and loosely-typed Promise use — all tsc-invisible. The Observer caught 4; an explicit grep sweep caught 10 more. **Fix:** every Cascade/Barrier must run `grep -rn "^\s*<asyncFn>(" src` for each now-async function and award/`.catch()` each hit. This is now baked into Bucket C onward.

### Bucket C (M2.5) — agent-orchestrator — `wf_cc75e10a-074` — **GO**
- Retired `agent_execution_log` (write-only, never read, intentionally absent from pg-schema): 4 writes + the runtime `setupOrchestratorSchema` DDL removed; the 1 real `recommendations` read converted; dangling vars (execId/now/errorMsg) cleaned. Cascade auto-skipped (no exported signature change). Suite 902/0/19. Efficient: 3 agents / 4.3 min.
- Commit `c2948a3`.

### waitlist_leads schema port (M2.6 prep) — `be1c374`
- `waitlist_leads` was runtime-CREATE'd in index.ts and absent from PG schema. **User chose: port to schema + migration.** Added `waitlistLeads` to pg-schema.ts; generated migration `0002_eminent_masque.sql`. The pg-test harness (`getMigratedTestPg` → `migrate()`) applies it automatically; no unilateral production write.

### Bucket D (M2.6) — index.ts(21) + audit/index.ts(11) boot/cron — `wf_7e5a5aaf-8be` — **GO**
- **index.ts:** retired `ensureUsersColumn` (PRAGMA/ALTER, 5 calls — columns in pg-schema) + the `waitlist_leads` runtime CREATE (now migration-owned); `dna_cache` INSERT OR REPLACE → ON CONFLICT(ad_id); waitlist INSERT → RETURNING id; account-delete → `adapter.transaction`; `getMetaTokenForUser` sync→async (6 callers awaited). 0 leftover `.prepare`.
- **audit/index.ts:** removed the file's own better-sqlite3 handle; 8 fns sync→async; cascade awaited `getAuditHistory` in routes/audits.ts.
- **Barrier self-heal:** `audit-index.test.ts` was stale (sync calls to now-async fns + better-sqlite3 mock missing pragma/exec) → fix-playbook awaited the 5 calls, marked tests async, hardened the mock. **Boot-smoke `npm run build` emits** (whole server incl index.ts; the EACCES was a root-owned `dist/` artifact, verified via emit to a writable dir). Full suite (incl adapter.test, migration 0002 applied on test branch): **921/0/19**.
- Commits `542b6b6` index.ts · `0f71de6` audit/index.ts+audits+test.

## ✅ CONVERSION COMPLETE (Buckets A–D / M2.3–M2.6)
**Zero** non-test, non-db-layer `.prepare` sites remain in `src/`. The whole app uses the async `DbAdapter`. Remaining `.prepare` is only the SqliteAdapter implementation (db/index.ts, adapter.ts, schema.ts) + test mocks. Next: **Bucket E** — port remaining tests to the pg backend (M2.7), flip `DB_BACKEND` default (M2.8), retire the sqlite path (M2.9), then merge `db-migration` → `main`.

