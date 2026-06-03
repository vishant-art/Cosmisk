> **Status: ♻️ SUPERSEDED (2026-05-31)** — May-19 migration-strategy refresh. Superseded by the migration arc `26_05/database_state.md` → `29_05/async_migration_call_site_audit.md` → `31_05/next_steps.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# COSMISK Database Migration Strategy — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/Database_migration_strat.md` (2026-04-26)
**Companion:** `dev_reports/new_database_issues.md` (full audit, 269 lines).

> Same four architectural decisions as the original; numbers refreshed; preconditions added; new tables folded in. The strategy is still sound. It cannot be executed until the build is fixed (§ 0).

---

## 0. Preconditions (NEW — must close before Step 1)

| Gate | What | Owner |
|---|---|---|
| G1 | Resolve 25 broken imports in 15 files (`19_05/new_and_added_risks.md` § N) — `tsc` green | engineering |
| G2 | Reset `node_modules` ownership, `npm ci` succeeds | engineering |
| G3 | Collapse 11 lazy/script tables into `schema.ts` so `createTables(db)` is the single source | engineering |
| G4 | Document seed-data policy: where do the 3 `brands` seed rows live after `add-audit-tables.ts` is collapsed? | owner |

Until G1–G4 close, **Drizzle introspection cannot produce a faithful model of the schema**, and any migration tooling will silently miss the lazy tables.

---

## 1. JSON Data Type Strategy: Hybrid Approach (unchanged)

**Decision.** `jsonb` for queryable metadata; `text` (or plain `json`) for large read-only payload blobs.

**Apply to:**
- **`jsonb`:** `users.goals`, `users.competitors`, `users.notification_preferences`, `brand_context.*`, every analyst service's per-client config column (`oos_agent_store.config`, `discount_agent_store.config`, etc.), all `client_contexts.*` JSON columns.
- **`text`:** `audits.full_output`, `reports.data`, `dna_cache.payload`, `agent_decisions.payload`, `competitor_snapshots.snapshot`.

**New since the original:** 25 new tables in `schema.ts` introduce ~35 additional JSON columns. Most are per-row config and should be `jsonb`; the analyst output blobs (`client_reports.html`, `comment_mining_reports.full_text`) should be `text`.

---

## 2. Deletion Strategy: Core Soft Deletes + Leaf Cascades (UPDATED)

### 2.1 Tables that need soft delete (`deleted_at TIMESTAMPTZ NULL`)

| Table | Source | Reason |
|---|---|---|
| `users` | schema.ts | billing + audit |
| `brands` | add-audit-tables.ts → schema.ts (post-G3) | audit |
| `subscriptions` | schema.ts | billing |
| `creative_sprints` | schema.ts | audit |
| `cost_ledger` | schema.ts | billing |
| **`service_clients`** (NEW) | schema.ts | per-brand agency root; deletion would orphan ~23 analyst tables |
| **`client_contexts`** (NEW) | services/client-context.ts → schema.ts (post-G3) | strategic state |
| **`strategic_reports`, `strategic_recommendations`** (NEW) | services/strategic-memory.ts → schema.ts (post-G3) | strategic state |
| **`client_reports`** (NEW) | schema.ts | client-facing audit |

**Application impact.** Every read query on these tables needs `WHERE deleted_at IS NULL`. The migration adds the column + a partial index `... WHERE deleted_at IS NULL` for hot reads.

### 2.2 Tables with cascade (`ON DELETE CASCADE`)

| Table | Reason |
|---|---|
| `agent_runs` | regenerates from raw inputs |
| `agent_decisions` | run-scoped |
| `agent_episodes`, `agent_entities` | episode memory |
| `dna_cache` | rebuildable from external APIs |
| `studio_generations`, `studio_outputs` | rebuildable from prompts |
| `score_predictions` | rebuildable |
| `intelligence_predictions`, `prediction_accuracy` | rebuildable |
| `competitor_snapshots`, `competitor_movements` | rebuildable from Meta Ad Library |
| `creative_quality_scores`, `creative_evolution` | rebuildable |
| `operator_behavior` | telemetry; rebuildable from event stream if external (none today) |

### 2.3 Tables that should DENY delete (`ON DELETE RESTRICT`)

| Table | Reason |
|---|---|
| `agent_recommendations`, `recommendations` | audit trail of agency-delivery work |
| `comment_mining_reports`, `classified_comments` | client-paid analytical work |
| `audits.full_output` | regulated audit output |

The original strategy didn't carve out RESTRICT; the new analyst output tables justify a third category.

---

## 3. Schema Unification: Two-Step Migration (UPDATED)

**Decision (unchanged).** Consolidate into a single Drizzle SQLite schema first, test it, then swap dialect to PostgreSQL.

**What changed in step 1.**

Previously the work was: "consolidate 40 tables across 4 files into Drizzle." Now it's: "consolidate **71 tables across 6 source locations** into Drizzle, with 23 new analyst tables that didn't exist when the original was written, and 5 lazy tables that materialise only after first call."

**Order of consolidation (per `19_05/cleanup_suggestions.md` S2):**

1. Snapshot the live `cosmisk.db` (`server/data/cosmisk.db.snapshot-<timestamp>`).
2. Collapse the `shopify_tokens` dual definition (Risk K).
3. Move `brands`, `brand_context`, `audits` (3 tables in `add-audit-tables.ts`).
4. Move `client_contexts` (1 table in `services/client-context.ts`).
5. Move `strategic_*` (4 tables in `services/strategic-memory.ts`).
6. Move `scheduled_audits` (1 table in `services/audit-scheduler.ts`).
7. Move `waitlist_leads` (1 table in `server/src/index.ts`).
8. Verify a fresh `createTables(new Database(':memory:'))` matches the live snapshot, table-by-table.

Then begin Drizzle introspection.

---

## 4. Indexing & Type Safety (Priority 1.1) — UPDATED

### 4.1 Index recount

The original strategy said "13 critical missing indexes." `schema.ts` today has **51 `CREATE INDEX` statements** (was ~17). Most original gaps are closed. A fresh recount is required.

Likely still missing:
- `cost_ledger(user_id, created_at)` — composite for the gateway daily-cap query.
- `competitor_snapshots(client_id)`, `competitor_movements(client_id)` — likely scanned during the competitor dashboard.
- `operator_behavior(client_id, occurred_at)` — likely scanned during the operator dashboard.
- `*_agent_store(last_run_at)` — for "recent runs" queries.

**DoD.** `EXPLAIN QUERY PLAN` shows `SEARCH ... USING INDEX` for the top-10 hot queries; the gateway's cost-ledger lookup is < 1 ms on a representative DB.

### 4.2 Enum migration

Original list (~25 columns). Add the new ones from analyst tables:

| Column | Domain |
|---|---|
| `service_clients.status` | active/paused/cancelled |
| `agent_recommendations.priority` | high/medium/low |
| `agent_recommendations.status` | pending/accepted/rejected/applied |
| `client_reports.kind` | weekly/monthly/adhoc |
| `intelligence_predictions.confidence` | high/medium/low |
| `operator_feedback.sentiment` | positive/neutral/negative |
| `competitor_movements.kind` | new-ad/removed-ad/spend-up/spend-down |
| `creative_quality_scores.tier` | s/a/b/c/d |

Adds ~10 to the ~25 from the original. Total ~35 enums to declare in the PG side.

---

## 5. Build prerequisites (NEW)

Per `19_05/new_database_issues.md` § 6, the codebase has 25 broken imports across 15 files. The migration cannot execute against a non-compiling codebase. Resolve per `cleanup_suggestions.md` S1 (decide path A/B/C per file group with owner).

---

## 6. Seed-data policy (NEW)

The original strategy did not address seed data. `add-audit-tables.ts` seeds three `brands` rows. Decision needed:

- **Option A:** Move seeds into a separate `seed.sql` invoked by `drizzle-kit seed` post-migrate.
- **Option B:** Add a `POST /brands/seed` admin endpoint and run it once after deploy.
- **Option C:** Keep the bootstrap script as the seeder; move only the `CREATE TABLE` blocks.

Recommend **Option A** for migration-tool consistency.

---

## 7. Index priorities (NEW)

Before swapping the dialect, run `EXPLAIN QUERY PLAN` on:

1. `SELECT * FROM cost_ledger WHERE user_id = ? AND date(created_at) = date('now')` (gateway).
2. `SELECT * FROM agent_recommendations WHERE client_id = ? AND status = 'pending'` (dashboard).
3. `SELECT * FROM operator_behavior WHERE client_id = ? AND occurred_at > date('now', '-7 days')` (operator dashboard).
4. `SELECT * FROM competitor_snapshots WHERE client_id = ? ORDER BY captured_at DESC LIMIT 30` (competitor dashboard).
5. `SELECT * FROM intelligence_predictions WHERE client_id = ? AND verified IS NULL` (reality testing).

Each one identifies one or more missing indexes. Land them in the first SQLite Drizzle PR before the dialect swap.

---

## 8. Operator-tables PII (NEW)

`operator_feedback`, `operator_behavior`, `operator_profiles` hold per-operator data that is likely PII (names, click streams, possibly emails). A GDPR-style right-to-erasure path is required:

- Soft delete via `deleted_at`? (preserves audit, fails strict erasure.)
- Hard delete via `ON DELETE CASCADE` from a `service_clients` parent? (breaks audit.)

**Recommend** a hybrid: `service_clients.operator_id` cascades, and on hard delete, replace the operator-PII columns with `<redacted>` placeholders. Document in a separate `dev_reports/19_05/privacy.md` once the path is chosen.

---

## 9. Will the strategy work? (verdict)

**Yes**, with three prerequisite gates (G1–G3 above) and four scope additions (§ 2.1 soft-delete list, § 4.2 enums, § 6 seed policy, § 8 operator PII). The original four decisions remain correct.

See `19_05/new_database_issues.md` § 10 for the full verdict.

---

**End of refresh.**
