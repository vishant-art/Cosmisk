> **Status: ✅ IMPLEMENTED (2026-05-31)** — banners applied across all folders; catalog in `dev_reports/STATUS_INDEX.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# dev_reports Consolidation — Strategy (status-marking, non-destructive)

**Date:** 2026-05-31
**Branch:** `db-migration`
**Goal:** Make `dev_reports/` navigable by marking which reports (and which *sections* within them) have been **implemented** or **invalidated/superseded**, so the folder stays a complete record of all work done — **nothing is deleted**, and **logs are left untouched**.
**Status:** STRATEGY — awaiting approval before implementing.

---

## 1. Principles

1. **Non-destructive.** No report is deleted or rewritten. We only *prepend* a small status banner and *add* one master index. The historical record stays intact (the whole point).
2. **Logs are sacrosanct.** Files whose job is to be a chronological record are **never touched**: `*log.md`, `session_log.md`, `log.md`, and each folder's `INDEX.md` (those are navigation, already accurate for their date).
3. **Truth at the section level.** A report is rarely 100% done or 100% wrong. Where a report mixes outcomes, the status is recorded **per section** in the master index (and summarised in the banner), not as a single verdict on the file.
4. **Point forward.** Every "Invalidated/Superseded" mark names the doc that replaced it, so a reader always lands on current truth.

---

## 2. Status taxonomy

| Tag | Meaning | Action |
|---|---|---|
| ✅ **IMPLEMENTED** | The plan/section was built and verified | Banner + index note; body untouched |
| ❌ **INVALIDATED** | The plan/section was wrong or the premise changed | Banner naming the correction + index note |
| ♻️ **SUPERSEDED** | Still correct, but a later doc replaces it as source of truth | Banner naming the successor |
| 🔵 **ACTIVE** | Current source of truth, work in flight | Banner = "current"; no change to body |
| 📖 **REFERENCE** | Durable factual reference (schema dumps, inventories) | Marked durable; not time-boxed |
| 📓 **LOG** | Chronological record | **Untouched** (rule §1.2) |

---

## 3. Mechanism (two artifacts only)

### 3.1 Master index — `dev_reports/STATUS_INDEX.md` (new)
One table for the whole folder: every non-log file → status tag → one-line note → superseding doc (if any). This is the single place a reader checks "is this still true?". Mixed-status files get a short sub-list of their sections.

### 3.2 Per-report status banner (prepend only)
A 3-line block at the very top of each non-log report, e.g.:
```
> **Status: ❌ INVALIDATED (2026-05-31)** — the `shopify_tokens` JOIN plan here is wrong;
> corrected to a 2-line `user_id` fix in `31_05/next_steps.md` §2. Rest of doc still valid.
> _Body preserved unchanged for the record._
```
Banner only. The body below it is never edited.

---

## 4. Draft classification (first pass — confirm during implementation)

> High-level; the implementation pass reads each file and records section-level detail in `STATUS_INDEX.md`. Logs in each folder are excluded here by rule.

| Folder / file | Proposed status | Note / successor |
|---|---|---|
| `05_05/*` (audit, tasklist, cleanup_*, suggested, rate_limiting/, structured_logging) | ♻️ SUPERSEDED (mostly) | Earliest analysis; re-stated with current numbers in `19_05/*`. Confirm which rate-limiting items shipped (llm-gateway rate limiter merged per `25_05`). |
| `19_05/*` (audit, tasklist, suggested, smoke_test, section_2_impl) | mixed ✅/♻️ | "Phase 1 — DB indexes + typed rows" partially done; superseded by the DB-migration arc. |
| `23_05/*` (state_of_codebase, module_inventory, live_http_surface, risk_register, next_steps) | 📖 REFERENCE / ♻️ | Inventories are durable reference; `next_steps` superseded by `24_05`→`25_05`. |
| `24_05/*` (merge_readiness, priority_db_vs_cleanup, sow_alignment, next_steps) | ♻️ SUPERSEDED | `next_steps` explicitly superseded by `25_05/next_steps.md`. |
| `25_05/next_steps.md` | mixed ✅/❌ | Tier 1 commits ✅ implemented; **`shopify_tokens` JOIN plan ❌ INVALIDATED** → `31_05/next_steps.md` §2; M1 deliverables ♻️ superseded by `31_05`. |
| `25_05/shopify_tokens_fork.md` | ❌ INVALIDATED | Fork is a 2-line `user_id` fix, not a JOIN; `owner_user_id` doesn't exist. → `31_05`. |
| `25_05/railway_data_at_risk.md` | 📖 REFERENCE | Decision record (data sacrificed); still the rationale for "no ETL". |
| `26_05/database_state.md`, `hidden_ai_tables_schema.md` | 📖 REFERENCE | Fed M1; still accurate snapshots. |
| `29_05/async_migration_call_site_audit.md` | 🔵 ACTIVE | M2 source of truth (635 sites). Current. |
| `31_05/m1_postgres_migration_and_connectivity.md` | ✅ IMPLEMENTED | M1 done + verified. |
| `31_05/phase1_completion_strategy.md`, `next_steps.md` | 🔵 ACTIVE | Current Phase-1 plan; A0/A1/A3 now landing. |
| `ON_HOLD.md` (top level) | 🔵 ACTIVE | Known-issues register; update item statuses, don't archive. |
| `*/session_log.md`, `*/log.md`, `*/INDEX.md` | 📓 LOG | **Untouched.** |

---

## 4a. Prerequisite — canonical vocabulary (DONE)

Before any banner is written, the **milestone-vs-phase-vs-migration-stage** name collision is resolved in [`../VOCABULARY.md`](../VOCABULARY.md): `M1…M5` = SoW milestones only; the DB migration's old "M1/M2/M3" become **DB-1 / DB-2 / DB-3** (a work-stream *inside* M1); my "Phase 1/Phase 2" realias to "M1 completion" and "DB-2". **Every banner and `STATUS_INDEX` row uses those canonical terms** — and where a report's body says "M2 = cutover" or "Phase 2", its banner adds a one-line "terminology: this doc's 'M2' = canonical **DB-2**" note (body unchanged).

## 5. Implementation steps (on approval)

1. Read each non-log report once; record section-level status in `STATUS_INDEX.md` (the catalog), **normalising every milestone/phase reference to the `VOCABULARY.md` terms**.
2. Prepend the 3-line banner to each non-log report per its verdict (no body edits).
3. Cross-link: every ❌/♻️ banner names its successor; `STATUS_INDEX.md` links every row.
4. Update `ON_HOLD.md` item statuses where this session resolved them (e.g., `shopify_tokens` — now fixed by A3).
5. Leave all `*log.md` / `session_log.md` / per-folder `INDEX.md` untouched.

## 6. Verification

- `grep -rL "Status:" dev_reports --include=*.md` returns only logs/INDEX files (every other report got a banner).
- `STATUS_INDEX.md` lists every folder; no non-log file missing.
- No diff to any `*log.md` / `session_log.md` (`git diff --stat` shows them unchanged).
- Every ❌/♻️ row has a non-empty successor link.

## 7. Open choices for you

- **Banner placement:** top-of-file banner (recommended, visible inline) vs index-only (less intrusive, but you must consult the index). Recommend banner + index.
- **Granularity:** section-level notes for the mixed files only (recommended) vs every file. Recommend mixed-only to keep effort bounded.
- **Scope:** all folders back to `05_05` (recommended — complete record) vs only `23_05`+ (the active arc).
