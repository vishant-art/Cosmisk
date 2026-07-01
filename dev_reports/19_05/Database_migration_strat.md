> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 migration-strategy refresh. Superseded by the migration arc `26_05/database_state.md` → `29_05/async_migration_call_site_audit.md` → `31_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# COSMISK Database Migration Strategy — Refresh (2026-05-19/20)

Supersedes `dev_reports/Database_migration_strat.md` (2026-04-26). Companion: `new_database_issues.md` (269 lines, full verdict §10). Same four architectural decisions as the original; cannot execute until the build is fixed (§0).

## Unique essence preserved

- **Preconditions G1–G4 (NEW — close before Step 1):** G1 = resolve 25 broken imports in 15 files (`19_05/new_and_added_risks.md` §N), `tsc` green; G2 = reset `node_modules` ownership, `npm ci` succeeds; G3 = collapse 11 lazy/script tables into `schema.ts` so `createTables(db)` is single source; G4 = document seed policy for the 3 `brands` seed rows after `add-audit-tables.ts` collapsed. Until closed, Drizzle introspection silently misses the lazy tables.
- **Build prerequisites (§5) — source ref:** Per `19_05/new_database_issues.md` § 6, the codebase has 25 broken imports across 15 files; the migration cannot execute against a non-compiling codebase. (This § 6 finding is the source of the "25 broken imports across 15 files" figure also attributed to `new_and_added_risks.md` §N in G1 above.)
- **Build prerequisites (§5) — remediation rationale:** Resolve per `cleanup_suggestions.md` S1 — decide path A/B/C per file group, with an owner.
- **JSON hybrid (unchanged decision):** `jsonb` for queryable config (`users.goals/competitors/notification_preferences`, `brand_context.*`, per-client `config` cols, `client_contexts.*`); `text` for blobs (`audits.full_output`, `reports.data`, `dna_cache.payload`, `agent_decisions.payload`, `competitor_snapshots.snapshot`). 25 new tables add ~35 JSON cols; `client_reports.html` + `comment_mining_reports.full_text` = `text`.
- **Soft-delete additions** (`deleted_at TIMESTAMPTZ NULL` + partial index `WHERE deleted_at IS NULL`): core (`users`, `brands`, `subscriptions`, `creative_sprints`, `cost_ledger`) plus NEW `service_clients` (deletion would orphan ~23 analyst tables), `client_contexts`, `strategic_reports`, `strategic_recommendations`, `client_reports`.
- **RESTRICT category (NEW — original lacked it):** `agent_recommendations`, `recommendations`, `comment_mining_reports`, `classified_comments`, `audits.full_output`.
- **CASCADE tables:** `agent_runs`, `agent_decisions`, `agent_episodes`, `agent_entities`, `dna_cache`, `studio_generations`, `studio_outputs`, `score_predictions`, `intelligence_predictions`, `prediction_accuracy`, `competitor_snapshots`, `competitor_movements`, `creative_quality_scores`, `creative_evolution`, `operator_behavior`.
- **Consolidation order (per `19_05/cleanup_suggestions.md` S2):** 1 snapshot `cosmisk.db`; 2 collapse `shopify_tokens` dup (Risk K); 3 move `brands`/`brand_context`/`audits` (3 in `add-audit-tables.ts`); 4 move `client_contexts` (`services/client-context.ts`); 5 move `strategic_*` (4 in `services/strategic-memory.ts`); 6 move `scheduled_audits` (`services/audit-scheduler.ts`); 7 move `waitlist_leads` (`server/src/index.ts`); 8 verify fresh `createTables(new Database(':memory:'))` matches snapshot table-by-table.
- **Index recount:** `schema.ts` now has **51 `CREATE INDEX`** (was ~17); most original 13 gaps closed. Likely still missing: `cost_ledger(user_id, created_at)`, `competitor_snapshots(client_id)`, `competitor_movements(client_id)`, `operator_behavior(client_id, occurred_at)`, `*_agent_store(last_run_at)`. DoD: `EXPLAIN QUERY PLAN` shows `SEARCH ... USING INDEX` on top-10 hot queries; gateway cost-ledger lookup <1ms.
- **Enums ~35 total** (~25 original + ~10 new): `service_clients.status`, `agent_recommendations.priority`/`.status`, `client_reports.kind`, `intelligence_predictions.confidence`, `operator_feedback.sentiment`, `competitor_movements.kind`, `creative_quality_scores.tier`.
- **Seed policy (NEW):** `add-audit-tables.ts` seeds 3 `brands` rows. Recommend **Option A** (`seed.sql` via `drizzle-kit seed` post-migrate) over B (`POST /brands/seed` admin endpoint) or C (script as seeder).
- **Index-priority EXPLAIN targets** (land in first SQLite Drizzle PR before dialect swap): cost_ledger gateway daily-cap; agent_recommendations pending; operator_behavior last-7-days; competitor_snapshots latest-30; intelligence_predictions `verified IS NULL`.
- **Operator PII (NEW):** `operator_feedback`, `operator_behavior`, `operator_profiles` hold likely PII. Recommend hybrid — `service_clients.operator_id` cascades + on hard delete replace PII cols with `<redacted>`. Document in `19_05/privacy.md` once path chosen.
- **Verdict:** works with gates G1–G3 + 4 scope additions (soft-delete list, enums, seed policy, operator PII); original four decisions remain correct.

## Cited & kept (referenced elsewhere)

- **71-table consolidation** across **6 source locations** into Drizzle (was 40 across 4 files), with 23 new analyst tables and 5 lazy tables that materialise only after first call. Cited by `23_05/module_inventory.md:159`.
- **`shopify_tokens` dual-definition** (defined across two creation sites) = Risk K; collapse is step 2 of the consolidation order. Cited by `23_05/new_findings.md:31`.

## Pointer

- SUPERSEDED → see: `26_05/database_state.md` (full 71-table consolidation + shopify_tokens dup restatement), then arc `29_05/async_migration_call_site_audit.md` → `31_05/next_steps.md`.
