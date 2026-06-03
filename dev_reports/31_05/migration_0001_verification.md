> **Status: ✅ IMPLEMENTED (2026-05-31)** — migration `0001` applied to Neon (79 tables) and verified.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Migration `0001` — Production-Safety + Use-Case Verification

**Date:** 2026-05-31
**Branch:** `db-migration`
**Artifact:** `server/drizzle/0001_damp_ghost_rider.sql` (generated, USING-hardened, **not yet applied**)
**Verdict:** ✅ **SAFE to apply to Neon.** 9 new tables + 2 empty-table reshapes. No data risk (cold-start DB). One DB-2 follow-up noted, not a blocker.

---

## 1. What the migration does

- **CREATE** 9 tables: `brands`, `brand_context`, `audits`, `scheduled_audits`, `client_contexts`, `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions`.
- **ALTER** the 2 conflict tables (`creative_analysis`, `global_patterns`) to the app's write contract (A0).
- **ADD** 3 FKs (`brand_context→brands`, `brands→users`, `scheduled_audits→brands`) + 3 indexes.
- `agent_execution_log` intentionally **not** created (write-only; dropped in DB-2).

---

## 2. Production-safety checks

| Check | Result |
|---|---|
| **Data loss risk** | **None.** Neon holds the 70 tables from `0000`, all empty (M1 confirmed: live SQLite had no prod data). The 2 reshape ALTERs run on empty tables. |
| **`text[]`→`text` cast** (`global_patterns.source_clients`) | **Fixed.** drizzle emitted bare `SET DATA TYPE` (would fail — no implicit array→text cast). Added `USING "source_clients"::text`; same for `id` (uuid→text), `confidence`/`spend` (numeric→real). |
| **FK ordering** | **Safe.** All `CREATE TABLE` run first; the 3 FKs are added via `ALTER` at the end, after every referenced table exists (alphabetical create order puts `scheduled_audits` before `brands`, but the FK is a trailing ALTER — no dependency error). |
| **Idempotency / partial apply** | drizzle journal prevents re-run; on a cold empty DB a failed apply is trivially re-runnable. |
| **`0000` artifacts preserved** | `global_patterns` unique(pattern,category) and the table rows are kept; only the 4 column types + 1 dropped FK change. |

---

## 3. Verified against documented use cases (dev_reports)

| Use case (source) | Schema supports it? |
|---|---|
| **FK enforcement parity** — does Postgres newly break inserts SQLite allowed? | **No new breakage.** `db/index.ts:61` sets `PRAGMA foreign_keys = ON` — SQLite **already enforces** FKs today. Porting `scheduled_audits→brands`, `brand_context→brands`, `brands→users` preserves existing behaviour. This also *validates* keeping the FKs. |
| **Audit scheduler** (`audit-scheduler.ts:221` insert) | `scheduled_audits` columns + `brand_id` FK match. brand_id must exist in `brands` — already true under SQLite FK=ON. |
| **`brands` population** | Only the 3-row seed (`add-audit-tables.ts:65-67`); **no other INSERT INTO brands** in `server/src`. → `brands` is effectively a static 3-row lookup (casorro / pratap-sons / salt-attire). Audits are limited to these 3 — a product fact, not a migration defect. Seed covered by A4. |
| **Strategic memory** (`strategic-memory.ts:220/501` inserts) | Column lists match the ported tables exactly (transcribed from the app's own runtime DDL → guaranteed parity). `data_json` NOT NULL honoured by the writers. |
| **`shopify_tokens` fix (A3)** | Independent of `0001`; already applied + verified (`user_id` on both readers). |
| **Conflict tables write contract (A0)** | `creative_analysis` (`ad-watchdog.ts:781`) and `global_patterns` (`pattern-transfer.ts:132`) inserts now match (TEXT id, nullable client_id, JSON-string source_clients, real types). |

---

## 4. One DB-2 follow-up (not a Phase-1 blocker)

**Timestamp string format.** The ported `*_at` / `verify_after` / `generated_at` columns are `timestamptz`. Today the app writes them on the **SQLite** path, so they don't touch Postgres yet. At the **DB-2 cutover**, confirm writers pass ISO-parseable values:
- ✅ `scheduled_audits.next_run_at` already uses `.toISOString()` (`audit-scheduler.ts:265`).
- ⚠️ `strategic_reports.generated_at`, `strategic_predictions.verify_after` are bound params (`report.generatedAt`, `pred.verifyAfter`) — ensure these are `Date.toISOString()` (or a `'YYYY-MM-DD HH:MM:SS'` string, which timestamptz still parses) when the pg adapter goes live. Defaults (`created_at`/`updated_at`) use `defaultNow()` — DB-filled, no app concern.
- `audits.date_range_start/end` deliberately kept `text()` (preformatted range bounds) — no coercion risk.

---

## 5. Apply procedure (on go)

```bash
cd server
npm run db:migrate     # applies 0001 via MIGRATION_DATABASE_URL (direct)
npm run db:check       # expect 79 public tables (70 + 9) on pooled + direct
```
Post-apply spot check: `\d global_patterns` shows `id text`, `source_clients text`; `\d creative_analysis` shows `id text`, `client_id` nullable.
