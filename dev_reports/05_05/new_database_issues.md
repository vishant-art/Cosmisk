> **Status: ♻️ SUPERSEDED (2026-05-31)** — DB-migration audit against the Apr-26 strategy. Superseded by `26_05/database_state.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# New Database Issues — Audit of `Database_migration_strat.md`

**Date:** 2026-05-19 (post-merge audit)
**Audited against:** `Database_migration_strat.md` (dated 2026-04-26 era)
**Codebase baseline:** `analysis-and-cleanup` @ `ebff657` (merge commit, 34 commits ahead of `origin/main`)
**Graph baseline:** code-review-graph rebuilt at 2026-05-19T19:52:11 — 376 files / 11,209 nodes / 84,530 edges / 1,958 IMPORTS_FROM edges
**Build state:** **does not compile.** 15 files reference 25+ non-existent modules (catalogued in § 6).

> **Verdict:** The migration strategy is **directionally correct** but **operationally stale and unimplementable today**. The four architectural decisions (JSON hybrid, core-soft-delete + leaf-cascade, two-step unification, indexing first) remain sound. Every concrete number, table list, and prerequisite in the document is wrong or missing prerequisites that did not exist when the strategy was written. The strategy cannot be executed against the current branch until the build is fixed and the 25 new analyst-service tables are folded into its scope.

---

## 1. What `Database_migration_strat.md` claims, verified against current code

The document is short (4 numbered sections + overview, ~57 lines). Each verifiable claim is checked against the post-merge state.

| Strategy claim | Status | Evidence |
|---|---|---|
| **"migrating … fragmented SQLite setup to a unified, production-ready PostgreSQL environment"** | True (still the goal) | No PG adapter is wired. `getDb()` in `server/src/db/index.ts` still uses `better-sqlite3`. `config.databasePath` is the only relevant slot. |
| **§1 — `jsonb` for queryable, `text` for blob payloads** | Sound, **but precondition missing** | The claim references `audits.full_output`. That column lives in `server/scripts/add-audit-tables.ts`, not `schema.ts`. The strategy cannot apply column-type rules until the script-tables are absorbed into `schema.ts`. |
| **§2 — Soft-delete list:** `users`, `brands`, `subscriptions`, `creative_sprints`, `cost_ledger` | **Not yet implemented anywhere** | `grep -rE "deleted_at\|softDelete\|isDeleted" server/src --include="*.ts"` returns **0 hits**. None of the five tables has a `deleted_at` column. The strategy describes future behaviour. |
| **§2 — Cascade list:** `agent_runs`, `dna_cache`, `studio_outputs` | Partly true | `agent_runs.user_id` is `REFERENCES users(id) ON DELETE CASCADE` in `schema.ts`. `dna_cache` has no user_id FK at all (only `account_id` indexed). `studio_outputs` references `studio_generations` not users; cascade target needs re-specifying. |
| **§3 — "40 tables scattered across 4 files"** | **Stale.** Now **71 tables across 6 source locations.** See § 2 below. |
| **§3 — Two-step: unify into Drizzle SQLite, then swap dialect** | Sound. **No code progress.** Drizzle is not a dependency of `server/package.json`. `package.json` lists `better-sqlite3` and `@types/better-sqlite3` only. |
| **§4 — "13 critical missing indexes"** | **Stale.** `schema.ts` already has **51 `CREATE INDEX` statements**, up from 17–18 in the original audit. Some of the originally-missing indexes have been added; some are still missing; a fresh recount is required. |
| **§4 — "25+ string columns to ENUM"** | Sound, **not started**. The enum candidates listed in `db_structure.md` § F4 still apply, plus ~10 more from the 25 new tables. |

**Bottom line:** every architectural decision is still defensible. Every numeric and table-list claim is out of date. The strategy reads as if it were written at `69b4352` (the divergence point) and has not been re-baselined.

---

## 2. Schema fragmentation has worsened, not improved

### 2.1 Where tables actually live today (post-merge)

| Source | Tables | Notes |
|---|---|---|
| `server/src/db/schema.ts` — `createTables()` | **60** | Authoritative. Runs at boot. Up from 35 at strategy-writing time. |
| `server/scripts/add-shopify-tables.ts` | 1 (`shopify_tokens`) | **Duplicate of schema.ts** — same table name, separate `CREATE TABLE IF NOT EXISTS`. Risk K from `analysis/new_added_risks_and_design.md` is confirmed and live. |
| `server/scripts/add-audit-tables.ts` | 3 (`brands`, `brand_context`, `audits`) | **Outside schema.ts**. Required for audit routes to work but only created by manual script. Plus 3 brand seed rows. |
| `server/src/index.ts` (lazy, in `POST /waitlist/join` boot path) | 1 (`waitlist_leads`) | Lazy DDL inside the bootstrap. |
| `server/src/services/audit-scheduler.ts` (lazy) | 1 (`scheduled_audits`) | Lazy DDL on first scheduler call. |
| `server/src/services/client-context.ts` (lazy) | 1 (`client_contexts`) | **NEW since strategy was written.** Not catalogued anywhere in `dev_reports/`. |
| `server/src/services/strategic-memory.ts` (lazy `ensureSchema`) | 4 (`strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions`) | **NEW since strategy was written.** Not catalogued anywhere in `dev_reports/`. |
| **TOTAL** | **71 distinct tables**, with **`shopify_tokens` defined twice** | Six source locations, not four. |

### 2.2 What this means for the migration

The strategy's two-step plan (consolidate, then swap dialect) can still work, but **step 1 (consolidate) now has twice the surface area**:

- **23 new tables in `schema.ts`** since the strategy was written (a partial list: `service_clients`, `competitor_intel_store`, `oos_agent_store`, `discount_agent_store`, `creative_agent_store`, `agent_recommendations`, `client_reports`, `intelligence_predictions`, `intelligence_recommendations`, `operator_feedback`, `operator_behavior`, `operator_profiles`, `intelligence_metrics`, `competitor_snapshots`, `competitor_movements`, `creative_quality_scores`, `creative_evolution`, `creative_intelligence_context`, `creative_category_knowledge`, `comment_mining_reports`, `classified_comments`, `recommendations`, `prediction_accuracy`, `entity_state_snapshots`, `creative_briefs`).
- **5 new tables outside `schema.ts`** (`client_contexts`, `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions`).

None of these are described in the migration strategy. Each one needs:
- A column-type pass (`jsonb` vs `text`, enum candidates, boolean-as-INT detection, timestamp-as-TEXT detection).
- An FK pass (most new tables reference `service_clients.client_id`, not `users.id` — a parent-table that didn't exist at strategy-writing time).
- An index pass.
- A soft-delete-vs-cascade decision.

---

## 3. The migration cannot run today — prerequisites missing

### 3.1 The codebase does not compile

**Hard blocker.** Step 1 of the strategy is "adopt Drizzle ORM against the existing schema." Drizzle adoption requires running TypeScript code (e.g., `drizzle-kit introspect`, `tsx server/scripts/migrate.ts`, application boot). Today the server cannot compile because **15 files import 25+ non-existent modules** (full list in § 6). Until the build is green, the migration is blocked at minute zero.

### 3.2 Empty `node_modules`

`server/node_modules/` is empty *and* root-owned (the second issue documented in `cleanup_plan.md` § 3.3 / § 4.7). `npm install` fails with EACCES. The current maintainer cannot install Drizzle, run `tsc`, or invoke `vitest` until ownership is reset.

### 3.3 Schema fragmentation breaks "fresh-DB" semantics

The strategy's pre-condition is that **`createTables(db)` produces the complete schema for a fresh DB**. Today it does not:

- `brands`, `brand_context`, `audits` only exist if someone runs `tsx server/scripts/add-audit-tables.ts` manually.
- `shopify_tokens` exists *twice* — once via `schema.ts`, once via `add-shopify-tables.ts`. The two definitions can drift silently.
- `client_contexts`, `strategic_reports` (×4), `waitlist_leads`, `scheduled_audits` only exist after the first runtime call that lazily-creates them.

Any Drizzle introspection against a "fresh" DB will miss the 11 lazy/script tables entirely. Any Drizzle introspection against a "running" DB will see whatever lazy tables happen to have been touched. **The schema is non-deterministic across environments.**

### 3.4 The strategy doesn't say where seed data lives

`add-audit-tables.ts` seeds three brand rows (`emiacademy`, `cosmiskai`, `procurio`, or whatever the current seed is). These seed rows are part of the production data shape. The strategy doesn't address whether seed data:

- Moves to a separate `seed.sql` in the migration?
- Stays in the bootstrap script?
- Becomes a `POST /brands/seed` admin endpoint?

Without this decision, the cutover from `add-audit-tables.ts` to a unified migration loses the seed.

---

## 4. Specific architectural gaps in the strategy

### 4.1 No mention of `service_clients` as the new ownership root

The `service_clients` table is the per-brand identity for the agency-delivery model. **Most of the 23 new tables in `schema.ts` use `client_id` (FK to `service_clients`), not `user_id` (FK to `users`).** Examples confirmed by grep on `schema.ts`:

- `recommendations.client_id`, `client_reports.client_id`, `intelligence_predictions.client_id`
- `competitor_intel_store.client_id`, `oos_agent_store.client_id`, `discount_agent_store.client_id`, `creative_agent_store.client_id`

The strategy's soft-delete list (`users`, `brands`, `subscriptions`, `creative_sprints`, `cost_ledger`) **omits `service_clients`**, which is the most important parent for the new analyst surface. Deleting a `service_clients` row today would orphan ~23 child tables with no FK enforcement (some are declared with REFERENCES, many are not).

**Required fix to the strategy:** add `service_clients` to the soft-delete list; specify ON DELETE behaviour for every FK pointing at it.

### 4.2 No mention of `strategic_*` (4 tables) or `client_contexts`

These five tables created lazily by services represent ~10% of the live schema and are absent from the strategy.

- `client_contexts` holds the per-brand context document used by every analyst. Losing it is a recoverable data loss (rehydrates from `brand_context` plus Meta/Shopify) but recovery is slow.
- `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions` are the working memory for the strategic-cognition layer. Losing them means losing accumulated reasoning state for every client.

Both groups deserve the soft-delete treatment by the strategy's own logic ("billing and audit trails").

### 4.3 FK constraints are missing on many user_id-bearing tables

Quick scan of `schema.ts`:

- 37 columns declared as `REFERENCES users(id) ON DELETE CASCADE`.
- 7 columns declared as `user_id TEXT NOT NULL` (no FK).
- New tables (`creative_briefs`, `score_predictions`, `studio_generations`, `studio_outputs`) carry indexes on `user_id` but not always FKs.

The strategy says cascade applies to "leaf data" — but if the FK isn't there, the cascade isn't enforceable at the DB layer. **Step 1 of the migration must add explicit FKs everywhere `user_id` or `client_id` is mentioned**, then declare cascade vs soft-delete per the strategy.

### 4.4 No mention of the `addColumn` (`ensureColumn`) shim

The strategy's "Step 1: consolidate into Drizzle SQLite" implicitly retires the `ensureColumn()` shim. Today `schema.ts` has 19 `ensureColumn` calls. They are real schema modifications that must either:

- Be folded into the canonical `CREATE TABLE` blocks (safe only if every deployed DB has already received the column).
- Be replaced with Drizzle migrations.

Neither is documented. The strategy reads as if the shim doesn't exist.

### 4.5 No mention of CASCADE direction for new analyst tables

`schema.ts` post-merge contains FK chains like:

```
service_clients.id ← recommendations.client_id ← intelligence_predictions.recommendation_id
                  ← oos_agent_store.client_id
                  ← client_reports.client_id
```

Deleting one `service_clients` row would cascade through ~10 dependent tables. The strategy says "absolute safety for billing and audit trails" — but the analyst-output tables (`recommendations`, `client_reports`, `intelligence_predictions`) are arguably *audit trails for the agency-delivery work*. They should not cascade-delete. The strategy must classify these explicitly.

### 4.6 No mention of `cost_ledger` index for the gateway carve-out

The LLM gateway carve-out (`server/src/services/llm-gateway.ts`) queries `cost_ledger` on `(userId, dayStart)` to compute the daily cap. This is one of the hottest queries in the new architecture. `schema.ts` has `idx_cost_ledger_user` but does **not** have `idx_cost_ledger_user_day` (i.e., a composite index on `(user_id, created_at)`). This is captured in `dev_reports/rate_limiting/implementation_plan.md` § 5.4 and **not mentioned in the migration strategy**.

When the dialect swap happens, this index needs to be in the first PG migration, not a follow-up.

### 4.7 No mention of `operator_*` tables (3 user-facing telemetry tables)

`operator_feedback`, `operator_behavior`, `operator_profiles` are user-action telemetry tables. They hold:
- Feedback the operator gave on a recommendation.
- Click/view events.
- Per-operator preferences.

They are arguably PII and need a GDPR-style "right-to-erasure" path. The strategy's soft-delete-on-`users` rule doesn't propagate here automatically because these tables key by `operator_id`, not `user_id` (need to confirm the FK shape).

---

## 5. What the strategy got right (so we don't relitigate)

- **JSON hybrid (`jsonb` vs `text`)** — the column-by-column distinction is the right discipline.
- **Two-step migration (consolidate then swap)** — sequencing is correct; the second step is where most teams blow up.
- **"Apply missing indexes immediately during the unification phase"** — right call, mechanical, low risk.
- **String → enum** — correct for the obvious enum-like columns (`role`, `plan`, `subscription_status`, `creative_status`, `agent_status`, etc.).

These four decisions can be lifted into the post-cleanup migration plan as-is.

---

## 6. Why the migration is blocked — full build-break inventory

Running an offline import-graph check against post-merge `server/src/`:

| File | Missing modules |
|---|---|
| `server/src/index.ts` | `./routes/creative-scan.js`, `./routes/health-score.js`, `./routes/quick-wins.js`, `./routes/static-ads.js` |
| `server/src/routes/shopify.ts` | `../utils/encryption.js` |
| `server/src/services/shopify-client.ts` | `../utils/encryption.js` |
| `server/src/services/ad-engine/creative-intelligence.ts` | `./types.js` |
| `server/src/services/ad-engine/gemini-generator.ts` | `./types.js` |
| `server/src/services/ad-engine/strategy.ts` | `./types.js` |
| `server/src/services/ad-engine/validator.ts` | `../client-references.js`, `../pattern-extractor.js`, `./templates.js`, `./types.js` |
| `server/src/services/ad-watchdog.ts` | `./intelligence-integration.js` |
| `server/src/services/learning-engine.ts` | `./client-references.js` |
| `server/src/services/report-agent.ts` | `./intelligence-integration.js` |
| `server/src/services/strategic-cognition/causal-intelligence.ts` | `../signal-discovery/index.js` |
| `server/src/services/strategic-cognition/competing-hypotheses.ts` | `../signal-discovery/index.js` |
| `server/src/services/strategic-cognition/recursive-investigator.ts` | `../signal-discovery/index.js` |
| `server/src/services/strategic-cognition/strategic-curiosity.ts` | `../signal-discovery/index.js` |
| `server/src/services/unified-agent-runner.ts` | `./agent-brain.js`, `./audience-saturation-analyzer.js`, `./creative-lifespan-predictor.js`, `./creative-returns-analyzer.js`, `./geo-profitability-analyzer.js`, `./inventory-velocity-predictor.js`, `./ltv-by-creative-analyzer.js`, `./margin-weighted-roas-analyzer.js`, `./new-repeat-analyzer.js`, `./placement-efficiency-analyzer.js`, `./rto-cod-analyzer.js`, `./time-of-day-analyzer.js` |

**15 files; ~25 unique missing module paths.** Until these are resolved (either by recovering the missing files or by deleting the imports), no TypeScript compile will succeed and **no Drizzle introspection, migration generation, or `vitest schema.test.ts` run can produce meaningful results**.

---

## 7. Numbers refresh (the strategy's claims vs current reality)

| Metric | Strategy claim | Current reality |
|---|---|---|
| Tables | 40 | **71** (60 in schema.ts + 11 elsewhere) |
| Source locations | 4 | **6** |
| Missing indexes (originally cited) | 13 | Already added 33+; **fresh recount needed** |
| Boolean-as-INT columns | 6 (per audit § F5) | Same; not modified |
| JSON-as-TEXT columns | 32 | More now (every new analyst-table has 1-3 JSON columns) |
| FK gaps (per audit § F3) | 5 tables | At least 7 user_id-bearing columns still without FK; new client_id columns add another ~8 |
| `ensureColumn` ALTER calls | (not enumerated) | **19** today; each is technical debt the migration must collapse |
| TypeScript compile state | n/a | **Broken** (15 files, ~25 missing modules) |
| Drizzle adoption | "Step 1" | **Not started** (not a dependency in `package.json`) |
| Postgres | "Step 2" | **Not started** (no driver, no env, no provider chosen) |

---

## 8. Suggested patch to `Database_migration_strat.md`

(Not applied here — listed so the owner can decide.)

1. **Add a "Current state" preamble** with the 71-table count, 6 source locations, and explicit "TypeScript build is broken" warning.
2. **Update § 2 soft-delete list** to include `service_clients`, `client_contexts`, `strategic_reports`, `strategic_recommendations` — the new client-level state tables.
3. **Add § 5 — Build prerequisites**: list the 15 files / 25 imports that must be resolved before Drizzle adoption can begin.
4. **Add § 6 — Seed-data policy**: where do the brand seed rows go after `add-audit-tables.ts` is collapsed?
5. **Add § 7 — Index priorities**: with 51 indexes now, the "missing 13" claim is stale; produce a fresh `EXPLAIN QUERY PLAN`-driven list.
6. **Add § 8 — Operator-tables PII**: GDPR/right-to-erasure path for `operator_*` tables.
7. **Reference `dev_reports/cleanup_plan.md` § 18** so the post-merge state context is durable.

---

## 9. What the graph confirms (and what it can't say)

The code-review-graph confirms:
- 376 files / 11,209 nodes / 84,530 edges, post-merge.
- `server/src/db/schema.ts` has 22 importers (importers_of query). Heavy coupling — every service touches the schema. Validates the strategy's premise that the schema is the central artefact.
- 1,958 `IMPORTS_FROM` edges total. Even one broken import (e.g., `intelligence-integration.js`) is enough to refuse compilation; we have ~25.

The code-review-graph **cannot say**:
- Whether the SQLite file on a production deploy matches `schema.ts` shape (no live DB introspection).
- Whether the `ensureColumn` migrations have run on every environment.
- Whether the seed data is still intact.
- Whether Drizzle's introspection would faithfully recover the current schema (no Drizzle is installed).

For those, a live `cosmisk.db` snapshot is required.

---

## 10. Will the migration strategy still work?

**Yes — but only after three prerequisite gates.**

| Gate | What | Status |
|---|---|---|
| **G1** | Resolve the 25 broken imports in 15 files (delete OR recover) | **Open** |
| **G2** | Reset `node_modules` ownership and `npm install` cleanly | **Open** |
| **G3** | Fold the 11 lazy/script tables into `schema.ts` so `createTables(db)` produces a complete fresh DB | **Open** |

Once G1–G3 are closed, the strategy's four architectural decisions (§ 1 JSON hybrid, § 2 soft-delete + cascade, § 3 two-step unification, § 4 indexing + enums) can be lifted into a fresh migration plan. The plan must absorb the 23 new analyst tables, the 5 new lazy tables, the 19 `ensureColumn` calls, and the missing FKs.

Without those gates, attempting to run the strategy results in:
- A Drizzle introspection that misses the lazy tables.
- A failing TypeScript build that prevents any migration tooling from executing.
- A non-deterministic schema across environments.
- A cascade rule that leaves orphan rows because FKs are absent at the SQLite layer.

---

**End of audit.**
