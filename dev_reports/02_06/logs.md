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