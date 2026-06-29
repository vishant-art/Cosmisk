> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 DB-structure refresh. Superseded by `26_05/database_state.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Database Structure — Refresh (2026-05-19/20)

## Unique essence preserved

**SQLite-era engine (pre-Postgres migration):**
- `better-sqlite3`, synchronous, single shared in-process connection, `journal_mode=WAL`, `foreign_keys=ON` (per-connection, set by `getDb()`). DB path `./data/cosmisk.db` (from `config.databasePath`). WAL files at `server/data/cosmisk.db-wal` / `-shm`.
- `server/data/` owned by **root** (a devcontainer ran as root once — see `19_05/run_guide.md` §1).

**Headline delta 2026-04-26 → 2026-05-19:**
- schema.ts tables (`createTables()`) 35 → **60** (+25); outside schema.ts 5 → **11** (+6); **total unique tables 40 → 71 (+31)**.
- `CREATE TABLE` source locations 3 → **6**; `shopify_tokens` defs 1 → **2** (schema.ts AND script — drift hazard).
- secondary indexes in schema.ts ~17 → **51** (+34); `ensureColumn` ALTERs 13 → **19** (+6); **37** FK `REFERENCES` in schema.ts; **7** `user_id TEXT NOT NULL` cols without FK.

**§2.1 cluster-grouped table breakdown (60 schema.ts tables, per-cluster counts):**
- Identity/Integrations (9); Billing (3); Ad ops (4); Creative pipeline (6); Creative briefs (1 NEW); UGC (3); Content+Growth (3); Reports (1); Activity (1); Agent system (5); Agent+ops stores (5 NEW); Agent extensions (4 NEW); Operator telemetry (3 NEW); Intelligence/competitor (5 NEW); Creative-intel knowledge (2 NEW); Comment-mining (2 NEW); Recommendation telemetry (3 NEW); URL cache (1).
- _(successor §3.1 carries only a flat alphabetical 60-table list, so these cluster counts are unique here.)_

**11 tables OUTSIDE schema.ts** (a fresh `createTables(new Database())` is missing all 11; lazy ones materialise on first owner-service call):
- `brands`, `brand_context`, `audits` — `server/scripts/add-audit-tables.ts` (idempotent). `brands` seeded 3 rows by same script; `audits` holds `full_output` text blob per run.
- `shopify_tokens` — `server/scripts/add-shopify-tables.ts`. **DUPLICATE** of schema.ts def — drift hazard.
- `client_contexts` — `services/client-context.ts` (`ensureSchema`, lazy). Per-client context doc used by every analyst.
- `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions` — `services/strategic-memory.ts` (lazy).
- `scheduled_audits` — `services/audit-scheduler.ts` (lazy).
- `waitlist_leads` — `server/src/index.ts` `/waitlist/join` handler (first-request DDL).

**Per-table notes (new schema.ts arrivals):**
- `service_clients` = new agency-delivery ownership root. FKs in: `recommendations.client_id`, `client_reports.client_id`, `intelligence_predictions.client_id`, + 6 `*_agent_store.client_id`. Needs soft-delete but **no `deleted_at` column anywhere**.
- `*_agent_store` (`oos`/`discount`/`creative`/`competitor_intel`) keyed by `client_id`, indexed on `client_id`, but **no `(last_run_at, client_id)` composite** → "recent runs" queries will scan.
- `operator_feedback`/`operator_behavior`/`operator_profiles` — likely **PII** (names, possibly emails); needs GDPR right-to-erasure path; strategy doesn't classify.
- `recommendations`/`prediction_accuracy`/`entity_state_snapshots` well-indexed: `idx_recommendations_client`/`_agent`/`_pending`, `idx_predictions_client`/`_unverified`.
- §3.6: `creative_briefs` is indexed on **`user_id` AND `account_id`** ("already in good shape") — index detail absent from the successor `26_05/database_state.md` (which lists `creative_briefs` by name only).
- §3.7: the creative-intel knowledge cluster = **knowledge-base tables for the creative-intelligence cluster**.
- §3.8: the comment-mining cluster = **output of the comment-mining agent**.

**FK + index audit:**
- 7 `user_id TEXT NOT NULL` cols lack `REFERENCES users(id)` — original audit **F3 finding still alive**; add explicit FKs next PR.
- Of 25 new tables, 17 indexed, 8 not. Likely-scanned: `competitor_snapshots`, `competitor_movements` (competitor dashboards), `operator_behavior` (operator dashboard). `EXPLAIN QUERY PLAN` on hottest queries is the only authoritative check.

**Migration:** Postgres+Drizzle plan cannot execute until the 11 outside-schema.ts tables are consolidated. See `19_05/Database_migration_strat.md` (patched strategy; §4.5 classifies output tables as audit-trail vs cache) + `19_05/new_database_issues.md` (build-prerequisite gates).

## Cited & kept (referenced elsewhere)
- The schema-consolidation requirement (71 tables → `db/schema.ts`) and the `shopify_tokens` duplication-across-two-creation-sites warning are detailed in `19_05/Database_migration_strat.md` (cited by `23_05/module_inventory.md:159`, `23_05/new_findings.md:31`).

## Pointer
- SUPERSEDED → see: `26_05/database_state.md`
