> **Status: ♻️ SUPERSEDED (2026-05-31)** — DB-migration audit against the Apr-26 strategy. Superseded by `26_05/database_state.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# New Database Issues — Audit of `Database_migration_strat.md`

## Unique essence preserved

**Baseline:** Audit dated 2026-05-19 (post-merge). Audited against `Database_migration_strat.md` (2026-04-26 era). Codebase = `analysis-and-cleanup` @ `ebff657` (merge commit, 34 commits ahead of `origin/main`). Graph rebuilt 2026-05-19T19:52:11 = **376 files / 11,209 nodes / 84,530 edges / 1,958 IMPORTS_FROM edges**. **Build does NOT compile.**

**Verdict:** Strategy is directionally correct — the 4 architectural decisions remain sound (§1 JSON hybrid `jsonb` vs `text`; §2 core-soft-delete + leaf-cascade; §3 two-step unify-then-swap-dialect; §4 indexing/enums first) — but operationally stale and unimplementable today. Reads as if written at the `69b4352` divergence point and never re-baselined.

**Stale numbers (strategy claim -> current reality):**
- Tables: 40 -> **71** (60 in schema.ts + 11 elsewhere).
- Source locations: 4 -> **6**.
- Missing indexes: 13 -> stale; schema.ts now has **51 CREATE INDEX** (up from 17-18, i.e. **33+ added** since the 13-cited baseline); fresh recount needed.
- `ensureColumn` ALTER calls: **19** today (each is debt the migration must collapse).
- JSON-as-TEXT: 32 -> more (every new analyst table has 1-3 JSON cols). Boolean-as-INT: **6** (unchanged).
- Drizzle: NOT a dependency (`server/package.json` lists only `better-sqlite3` + `@types/better-sqlite3`). Postgres: not started (no driver/env/provider). `getDb()` in `server/src/db/index.ts` still uses better-sqlite3; `config.databasePath` only slot.

**Where tables live today (6 locations):**
- `schema.ts createTables()` = **60** (authoritative, boot).
- `server/scripts/add-shopify-tables.ts` = `shopify_tokens` — **DUPLICATE of schema.ts** (separate CREATE TABLE IF NOT EXISTS); Risk K confirmed live.
- `server/scripts/add-audit-tables.ts` = `brands`, `brand_context`, `audits` (script-only) + 3 brand seed rows (tentative names emiacademy / cosmiskai / procurio).
- `server/src/index.ts` lazy = `waitlist_leads`. `audit-scheduler.ts` lazy = `scheduled_audits`.
- `server/src/services/client-context.ts` lazy = `client_contexts` (**NEW, uncatalogued**). Holds the per-brand context document used by every analyst; losing it is a **recoverable** data loss (rehydrates from `brand_context` plus Meta/Shopify) but recovery is **slow**.
- `server/src/services/strategic-memory.ts` `ensureSchema` = `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions` (**NEW, uncatalogued**).

**23 new schema.ts tables since strategy** (most FK `service_clients.client_id`, NOT `users.id`): service_clients, competitor_intel_store, oos_agent_store, discount_agent_store, creative_agent_store, agent_recommendations, client_reports, intelligence_predictions, intelligence_recommendations, operator_feedback, operator_behavior, operator_profiles, intelligence_metrics, competitor_snapshots, competitor_movements, creative_quality_scores, creative_evolution, creative_intelligence_context, creative_category_knowledge, comment_mining_reports, classified_comments, recommendations, prediction_accuracy, entity_state_snapshots, creative_briefs.

**Soft-delete / FK gaps:**
- `grep deleted_at|softDelete|isDeleted` in `server/src` = **0 hits**; none of the 5 listed tables has `deleted_at` (future behaviour only).
- Strategy soft-delete list (`users`, `brands`, `subscriptions`, `creative_sprints`, `cost_ledger`) OMITS `service_clients` (parent of ~23 child tables), `client_contexts`, and the 4 `strategic_*` tables. Deleting a `service_clients` row orphans children (many FKs absent).
- FK counts in schema.ts: **37 columns** REFERENCES users(id) ON DELETE CASCADE; **7 columns** `user_id TEXT NOT NULL` with no FK; new client_id columns add ~8 more. `creative_briefs/score_predictions/studio_generations/studio_outputs` index `user_id` but not always FK. Cascade unenforceable where FK absent.
- `dna_cache` has no user_id FK (only `account_id` indexed). `studio_outputs` references `studio_generations`, not users. `agent_runs.user_id` = REFERENCES users(id) ON DELETE CASCADE.
- Cascade chain: `service_clients.id <- recommendations.client_id <- intelligence_predictions.recommendation_id`; `<- oos_agent_store.client_id`; `<- client_reports.client_id`. Analyst-output tables are audit trails and must NOT cascade-delete.
- `operator_feedback/operator_behavior/operator_profiles` = user telemetry (PII; need GDPR right-to-erasure); key by `operator_id` not `user_id`, so soft-delete-on-users doesn't propagate.

**cost_ledger index (unique to this doc):** schema.ts has `idx_cost_ledger_user` but NOT `idx_cost_ledger_user_day` (composite `(user_id, created_at)`). LLM gateway (`server/src/services/llm-gateway.ts`) queries cost_ledger on `(userId, dayStart)` for the daily cap — hottest query. Captured in `rate_limiting/implementation_plan.md §5.4`; must be in the first PG migration.

**Seed-data policy (unresolved — strategy must decide):** after `add-audit-tables.ts` is collapsed, the 3 brand seed rows need a home. Three concrete options: (a) move seed rows to a separate `seed.sql` in the migration, (b) keep them in the bootstrap script, or (c) expose a `POST /brands/seed` admin endpoint.

**Prerequisites missing:** `server/node_modules/` empty AND root-owned -> `npm install` fails EACCES (per `cleanup_plan.md §3.3/§4.7`). Schema is non-deterministic across environments: 11 lazy/script tables missing on a fresh DB; Drizzle introspect against fresh DB misses them, against running DB sees whatever was touched.

**Three prerequisite gates (all OPEN):** G1 resolve the 25 broken imports (15 files, below); G2 reset node_modules ownership + clean npm install; G3 fold the 11 lazy/script tables into schema.ts so `createTables(db)` produces a complete fresh DB.

**Graph confirms / can't say:** schema.ts has **22 importers** (heavy coupling — every service touches it). Graph cannot confirm prod SQLite shape, whether `ensureColumn` migrations ran per environment, seed integrity, or Drizzle introspection fidelity (no Drizzle installed) — needs a live `cosmisk.db` snapshot.

**Suggested patch to strategy (not applied):** current-state preamble (71/6/build-broken); expand soft-delete list; add build-prereqs section; seed-data policy (where do brand seed rows go after `add-audit-tables.ts` is collapsed); fresh index priorities; operator-tables PII section; reference `cleanup_plan.md §18`.

## Cited & kept (referenced elsewhere)

**§6 — Full build-break inventory (15 files; ~25 unique missing module paths).** Until resolved (recover or delete imports), no tsc compile / Drizzle introspection / `vitest schema.test.ts` can run:

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

## Pointer
- SUPERSEDED -> see: `19_05/db_structure.md`, `26_05/database_state.md`
