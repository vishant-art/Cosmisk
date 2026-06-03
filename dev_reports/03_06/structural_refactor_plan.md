# Structural Refactor — Plan (workflow-optimized for max concurrency)

> Branch: `repo-cleanup`. Behavior-PRESERVING reshaping of the codebase for readability/maintainability.
> Distinct from **Runtime Hardening** (behavioral fixes — gateway bypass, cron-blocking, logging, hygiene),
> which comes AFTER this. Priority order confirmed by user: **Structural Refactor → Runtime Hardening.**

## The invariant (what makes this safe)
EVERY change is a pure **move / extract / rename / delete-dead-code** — **no logic change**. The proof of
correctness is: the full test suite produces **IDENTICAL** results to the pre-refactor baseline, and `tsc`
stays baseline-only. A *changed* test result = a behavior change = a refactor bug.

**Baseline to hold identical:** default suite **400 passed / 9 skipped (18 files)**; pg suite **389 / 10 (21 files)**; tsc = 1 baseline error (`routes/billing.ts:4` stripe).

## The concurrency unlock: the FACADE / BARREL pattern
A god file is decomposed by **extracting its responsibilities into focused sub-modules** and leaving the
original file path as a **thin re-export barrel**. Example:
```
services/competitor-creative-intel.ts  (2636 LOC)
  →  services/competitor/fetch.ts, score.ts, gemini.ts, report.ts   (focused modules)
  →  services/competitor-creative-intel.ts  becomes:  export * from './competitor/…'   (barrel)
```
**Consequence: importers DO NOT CHANGE** (they still `import { x } from '…/competitor-creative-intel.js'`).
The god files have **0–2 importers each**, so with the barrel they touch only their *own* new tree →
**every god file is a disjoint unit → they can be decomposed fully in parallel** with zero cross-file collision.
This is the single biggest speedup lever (vs. the DB migration, where importer-await cascades forced serialization).

## Phases

### R1 — Root & docs tidy  (1 quick pass; zero risk)
15 root `.md` files → keep entry/agent files in root (`README`, `CLAUDE`, `GEMINI`, `AGENTS`); `git mv` the rest into a `docs/` tree (history preserved), then grep + fix any references:
- `docs/meta-review/` ← META_API_TESTING_GUIDE, META_API_TESTING_PLAN, META_APP_REVIEW_SUBMISSION, META_REVIEW_15_DAY_USAGE_PLAN
- `docs/business/` ← BUSINESS_CONTEXT, COMBINED_OFFERING_MAP, CREATIVE_BRIEF_FOR_ADS
- `docs/` ← EMPLOYEE_TESTING_INSTRUCTIONS, REVISED_DEVELOPMENT_PLAN, ROADMAP_COMING_SOON, AGENTS_OVERVIEW

### R2 — God-file decomposition  (BATCHED max-concurrency wave + Guardian circuit-breaker)
Targets (>1000 LOC, excl. `pg-schema.ts` 1289 = schema, fine large):
operator-experience 2788 · competitor-creative-intel 2636 · comment-mining-agent 1818 · ad-watchdog 1664 ·
creative-engine(route) 1639 · reality-testing 1469 · ai(route) 1379 · oos-detector 1362 · creative-scorer 1278 ·
learning-engine 1236 · narrative-synthesis 1177 · cohort-ltv-analyzer 1107 · ad-engine/validator 1089.
(`index.ts` 1304 = boot entry, 64 imports → **separate careful pass**, no barrel since nothing imports it.)

**Roles (the agentic harness + a persistent Guardian):**
- **Planner** (1, fast): per target, use `code-review-graph` (`find_large_functions`, `get_minimal_context`, communities) to map responsibility-clusters + **shared module-level state** (singletons/caches). Also snapshots a **baseline graph** (node/edge counts, flows, cycles) — the Guardian diffs against this.
- **Decompose** (PARALLEL within a batch): 1 agent per god file — edits in place, extracts modules + writes the **barrel** re-exporting EVERY original export, keeps shared state in ONE module, runs `npx tsc --noEmit | grep <file>` to self-verify, returns a COMPACT summary. No suite run per agent.
- **🛡 GUARDIAN** (persistent integrity watcher — runs AFTER EVERY BATCH; the circuit-breaker): 
  1. `build_or_update_graph_tool` (incremental) → refresh the graph with the batch's changes.
  2. **Diff the graph vs the Planner baseline** for STRUCTURAL breakage: NEW cycles, orphaned/dangling nodes, broken call edges (an importer resolving to a now-missing export), broken/altered **flows** (`get_affected_flows`/`get_flow`), unexpected hub/bridge shifts.
  3. **Read the batch's Decompose agent logs/summaries** for red flags: missing re-export, shared-state duplicated, a *logic* change snuck in (must be zero), leftover dangling refs.
  4. `npx tsc --noEmit` (must be baseline-only) + a quick `npm test` smoke (must stay identical so far).
  5. **VERDICT → GO** (graph intact, tsc/tests clean → release the next batch) **or HALT** (any integrity break → STOP the line, report exact file+issue; orchestrator fixes it before ANY further batch runs). HALT-before-next-batch is what prevents a cascading disaster.

**Batching for concurrency × safety:** the ~13 files run in **bounded parallel batches** (e.g. ~4–5 per batch → ~3 batches), max concurrency *within* a batch, **Guardian gate between batches**. A botched batch halts the line; blast radius ≤ one batch, never all 13. (A single all-13 wave is rejected: it gives the Guardian no mid-flight checkpoint, so a shared-state/cycle mistake would only surface at the end — across all 13 at once.)

- **Final Barrier** (orchestrator, once at the end): `npx tsc --noEmit` baseline-only + `npm test` IDENTICAL to baseline (same counts) + one `npm run test:pg`. NO-GO on any drift.

**Concurrency math:** wall-clock ≈ (slowest file × #batches) + Guardian gates — far faster than 13 sequential, with a safety checkpoint every batch.

### R3 — Polish  (smaller, parallel/direct)
Dead-code removal (e.g. already-spotted phantom `getRecentEpisodes`, dead `setupGlobalPatternsSchema`), domain-based module grouping, naming consistency, the stale-SQLite-comment sweep (folds in here).

## Risks & mitigations
1. **Missing an export** when building the barrel → tsc catches (importer breaks); agent enumerates all exports first.
2. **Circular imports** from extraction → agents avoid; tsc + runtime catch; keep shared types in a leaf module.
3. **Shared module-level state** (a `const cache = new Map()` / singleton used across the file's functions) — THE
   decomposition hazard: if duplicated across extracted modules, behavior breaks silently. Mitigation: Planner
   identifies it; it stays in ONE module; Observer explicitly checks. 
4. **Routes** (creative-engine, ai): the route-plugin default export stays as the entry; only handlers extract. Importers (index.ts registering the plugin) unchanged.
5. **Behavior-preserving guarantee is only as strong as the tests** (default suite uses mocks). tsc + identical-suite + barrel-export-preservation is the practical net; pg suite as the final backstop.

## Commits / PRs
R1 = 1 commit. R2 = 1 commit per god file (clean, isolated diffs thanks to barrels). R3 = grouped.
Split into reviewable PRs by phase (R1 docs / R2 decomposition / R3 polish) so the dev team can review digestibly.

## Concurrency × safety summary (the optimization)
- **Barrel pattern → disjoint files → high-parallel decomposition** (the big win; importers untouched).
- **Bounded parallel batches** (max concurrency within a batch) **+ 🛡 Guardian gate between batches** → early breakage detection + blast radius ≤ one batch (no cascade).
- **Per-agent = edit + tsc only** (no suite, no Neon) → no contention, full intra-batch parallelism.
- **Guardian = persistent integrity watcher**: after every batch it refreshes + diffs the code-review-graph (cycles/orphans/broken-edges/flows), reads the agent logs, runs tsc + a test smoke, and HALTS the line on any break.
- **Orchestrator owns the final suite/pg barrier** (run once → avoids the 58-min in-agent-barrier failure from DB-2).
- **Serial parts:** `index.ts`, the Guardian gates, and the final barrier.

## Optional: background watcher over MY orchestration
If you also want continuous oversight of the orchestration itself (not just the in-workflow Guardian), I can run a
separate background agent that periodically rebuilds the graph + tails the workflow agent logs and pings on any
red flag. The in-workflow Guardian is the primary safety net; this is belt-and-suspenders.
