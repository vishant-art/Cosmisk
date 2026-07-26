> **Status: ♻️ SUPERSEDED (2026-05-31)** — Apr-26 migration strategy; numbers/preconditions stale. Superseded by `19_05/Database_migration_strat.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# COSMISK Database Migration Strategy

## Unique essence preserved
- **JSON type strategy (hybrid):** `jsonb` for queryable metadata (`users.goals`, `brand_context`) to enable GIN binary indexing; standard `json`/`text` for large read-only payload blobs (`audits.full_output`, `reports.data`) where jsonb parse overhead adds no value and slows writes.
- **Deletion strategy:** soft deletes (`deleted_at`) for core entities = `users`, `brands`, `subscriptions`, `creative_sprints`, `cost_ledger` — blanket cascade risks catastrophic loss (e.g. deleting a user wipes their billing ledger). `ON DELETE CASCADE` for transient/regeneratable leaf data = `agent_runs`, `dna_cache`, `studio_outputs`. App layer must append `WHERE deleted_at IS NULL` on core-entity reads.
- **Schema unification (two-step plan):** consolidate fragmented schema into a single Drizzle SQLite schema first + test, THEN swap dialect to Postgres — avoids conflating engine-mismatch vs missing-table when debugging data drops. (Pre-Neon SQLite-era plan; the 19_05 successor superseded this with direct consolidation to `db/schema.ts`.)
- **Pre-migration fragmentation baseline:** 40 tables scattered across 4 files (some lazy-loaded, some one-off scripts). [19_05 reports 71 tables consolidated to `db/schema.ts`.]
- **Indexing & type safety (Priority 1.1):** audit found **13 critical missing indexes** (e.g. `cost_ledger(user_id, created_at)`, `subscriptions(user_id)`) — missing on Postgres causes severe CPU spiking under load; plus **25+ string columns** to convert to strict Postgres `ENUM` types to shrink row sizes.

## Pointer
- SUPERSEDED -> see: `19_05/Database_migration_strat.md`
