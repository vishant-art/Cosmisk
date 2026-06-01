> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 DB-structure refresh. Superseded by `26_05/database_state.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Database Structure — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/db_structure.md` (2026-04-26)
**Engine:** `better-sqlite3` (unchanged) — synchronous, single shared connection, WAL on, foreign_keys on.
**Path:** `./data/cosmisk.db` (from `config.databasePath`).
**Owner of `server/data/`:** **root** (a devcontainer ran as root once — see `19_05/run_guide.md` § 1).

---

## 1. Headline delta

| Metric | 2026-04-26 | 2026-05-19 | Delta |
|---|---:|---:|---:|
| Tables in `schema.ts` (`createTables()`) | 35 | **60** | +25 |
| Tables outside `schema.ts` | 5 | **11** | +6 |
| **Total unique tables in the system** | **40** | **71** | **+31** |
| Source locations defining `CREATE TABLE` | 3 | **6** | +3 |
| `shopify_tokens` definitions | 1 (script only) | **2** (schema.ts AND script — drift hazard) | new |
| Secondary indexes in `schema.ts` | ~17 | **51** | +34 |
| `ensureColumn` ALTER calls | 13 mentioned | **19** | +6 |
| FK `REFERENCES` clauses in `schema.ts` | (not enumerated) | **37** | n/a |
| `user_id TEXT NOT NULL` without FK | several | **7** | n/a |

---

## 2. Where every table lives

### 2.1 `schema.ts` — 60 tables

```
Identity / Integrations (9):
  users, meta_tokens, google_tokens, tiktok_tokens, shopify_tokens,
  password_reset_tokens, team_members, team_invitations, user_usage

Billing (3):
  subscriptions, user_usage, cost_ledger

Ad ops (4):
  campaigns, automations, autopilot_alerts, dna_cache

Creative pipeline (6):
  creative_sprints, creative_jobs, creative_assets,
  studio_generations, studio_outputs, score_predictions

Creative briefs (1, NEW):
  creative_briefs

UGC (3):
  ugc_projects, ugc_concepts, ugc_scripts

Content + Growth (3):
  content_bank, leads, swipe_file

Reports (1):
  reports

Activity (1):
  activity_log

Agent system (5):
  agent_runs, agent_decisions, agent_core_memory,
  agent_episodes, agent_entities

Agent + ops stores (5, NEW since 2026-04-26):
  service_clients,
  oos_agent_store, discount_agent_store,
  creative_agent_store, competitor_intel_store,

Agent extensions (4, NEW):
  agent_recommendations, client_reports,
  intelligence_predictions, intelligence_recommendations

Operator telemetry (3, NEW — potentially PII):
  operator_feedback, operator_behavior, operator_profiles

Intelligence / competitor (5, NEW):
  intelligence_metrics, competitor_snapshots, competitor_movements,
  creative_quality_scores, creative_evolution

Creative-intel knowledge (2, NEW):
  creative_intelligence_context, creative_category_knowledge

Comment-mining (2, NEW):
  comment_mining_reports, classified_comments

Recommendation telemetry (3, NEW):
  recommendations, prediction_accuracy, entity_state_snapshots

URL cache (1):
  url_analysis_cache
```

**25 new tables** since the 2026-04-26 snapshot, all created inside `createTables()` in `schema.ts`. They centre on the agency-delivery (`service_clients` as parent) and analyst-output (`*_agent_store`, `intelligence_*`, `operator_*`) surfaces.

### 2.2 Outside `schema.ts` — 11 tables

| Table | Defined in | Idempotent? | Notes |
|---|---|---|---|
| `brands` | `server/scripts/add-audit-tables.ts` | yes (`IF NOT EXISTS`) | Seeded with 3 rows by the same script. |
| `brand_context` | `server/scripts/add-audit-tables.ts` | yes | — |
| `audits` | `server/scripts/add-audit-tables.ts` | yes | Holds `full_output` blob (`text`) per audit run. |
| `shopify_tokens` | `server/scripts/add-shopify-tables.ts` | yes | **DUPLICATE** — also defined in `schema.ts`. Drift hazard. |
| `client_contexts` | `services/client-context.ts` (`ensureSchema`) | yes (lazy) | **NEW.** Per-client context document used by every analyst. |
| `strategic_reports` | `services/strategic-memory.ts` | yes (lazy) | **NEW.** Strategic-cognition working memory. |
| `strategic_recommendations` | `services/strategic-memory.ts` | yes (lazy) | **NEW.** |
| `strategic_running_context` | `services/strategic-memory.ts` | yes (lazy) | **NEW.** |
| `strategic_predictions` | `services/strategic-memory.ts` | yes (lazy) | **NEW.** |
| `scheduled_audits` | `services/audit-scheduler.ts` | yes (lazy) | Audit-scheduler job state. |
| `waitlist_leads` | `server/src/index.ts` (in `/waitlist/join` handler) | yes (lazy) | First-request DDL inside the bootstrap. |

**Implication.** A "fresh DB" produced by `createTables(new Database())` is missing 11 tables. The lazy ones materialise only on first call to their owner service.

---

## 3. New per-table notes (only for the 25+ new schema.ts arrivals)

(Per-table details for the existing 35 tables in the original `db_structure.md` remain valid. Below: only what's new since 2026-04-26.)

### 3.1 `service_clients`
- **Purpose.** Per-brand identity for the agency-delivery model. New ownership root.
- **FKs in:** `recommendations.client_id`, `client_reports.client_id`, `intelligence_predictions.client_id`, plus 6 `*_agent_store.client_id`.
- **Migration concern.** Should be soft-delete (the strategy's logic for billing/audit trails applies). Currently no `deleted_at` column anywhere.

### 3.2 `oos_agent_store`, `discount_agent_store`, `creative_agent_store`, `competitor_intel_store`
- **Pattern.** Each is keyed by `client_id` and holds per-client analyst state (JSON blobs, run-IDs, last-tick timestamps).
- **Index status.** Indexed on `client_id`. **No (last_run_at, client_id) composite index** — future "recent runs" queries will scan.

### 3.3 `agent_recommendations`, `client_reports`, `intelligence_predictions`, `intelligence_recommendations`
- **Pattern.** Output tables. Each row is an artefact generated by an analyst.
- **Migration concern.** Are these audit trails (no delete) or cache (cascade)? Strategy doesn't classify. See `19_05/Database_migration_strat.md` § 4.5.

### 3.4 `operator_feedback`, `operator_behavior`, `operator_profiles`
- **Purpose.** Click telemetry + feedback + per-operator preferences.
- **PII status.** Likely PII — operator names, possibly emails. Needs GDPR-style right-to-erasure path.
- **Strategy gap.** Not classified.

### 3.5 `recommendations`, `prediction_accuracy`, `entity_state_snapshots`
- **Pattern.** Closed-loop tracking + reality-testing output.
- **Index status.** `idx_recommendations_client`, `idx_recommendations_agent`, `idx_recommendations_pending`, `idx_predictions_client`, `idx_predictions_unverified` — well-indexed for the dashboards.

### 3.6 `creative_briefs`
- Indexed on `user_id` and `account_id`. Already in good shape.

### 3.7 `creative_intelligence_context`, `creative_category_knowledge`
- Knowledge-base tables for the creative-intelligence cluster.

### 3.8 `comment_mining_reports`, `classified_comments`
- Output of the comment-mining agent.

---

## 4. FK + index audit (post-merge)

### 4.1 FK gap inventory
7 `user_id TEXT NOT NULL` columns have **no `REFERENCES users(id)` clause**. Spot-check the 7 (line-by-line) and add explicit FKs in the next PR; the original audit's F3 finding is still alive.

### 4.2 Index gap inventory
Of the 25 new tables, 17 have at least one index; 8 do not. The "scan vs search" gap most likely sits in:
- `competitor_snapshots`, `competitor_movements` — likely scanned during competitor dashboards.
- `operator_behavior` — likely scanned during the operator dashboard.

`EXPLAIN QUERY PLAN` on the hottest queries against these is the only authoritative check.

### 4.3 ALTER inventory (19 `ensureColumn`)
Unchanged in shape; +6 new columns being lazily added at boot.

---

## 5. Constraints / pragmas

Unchanged from 2026-04-26:
- `journal_mode = WAL` (concurrent reads, serialised writes).
- `foreign_keys = ON` (per-connection — `getDb()` sets it).
- Single in-process connection. WAL files at `server/data/cosmisk.db-wal` and `-shm`.

---

## 6. Migration implications

The Postgres + Drizzle plan in `Database_migration_strat.md` cannot be executed until the 11 outside-`schema.ts` tables are consolidated. See `19_05/Database_migration_strat.md` for the patched strategy and `19_05/new_database_issues.md` for the build-prerequisite gates.

---

**End of refresh.**
