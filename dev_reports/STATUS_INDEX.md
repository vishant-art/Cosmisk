# dev_reports — STATUS INDEX (master catalog)

> ⭐ **LATEST HANDOFF (2026-07-18):** [`ai_serv/2026-07-18-ai-engineer-handoff.md`](./ai_serv/2026-07-18-ai-engineer-handoff.md)
> — demo-prep session shipped UGC video UI + async delivery, chat formatting, AI-Studio
> retirement, and the `ai_feedback` capture layer. Google-Ads consumption untouched. **Read this first.**

**Date:** 2026-05-31 (index) · updated 2026-07-18 · **Status:** 🔵 ACTIVE (regenerate when reports are added/superseded).
**What this is:** the single place to check "is this report still true?". Every non-log report carries a matching banner at its top. Terminology is canonical per [`VOCABULARY.md`](./VOCABULARY.md) (`M1…M5` = SoW milestones; the DB migration runs in stages **DB-1 / DB-1.5 / DB-2 / DB-3** inside M1).

**Legend:** ✅ IMPLEMENTED · ❌ INVALIDATED · ♻️ SUPERSEDED · 🔵 ACTIVE · 📖 REFERENCE (durable) · 📓 LOG (untouched).
**Untouched by rule:** every `log.md`, `session_log.md`, and per-folder `INDEX.md` — chronological/navigation records, left as the raw history.

**2026-06-17 volume reduction:** the `05_05/` and `19_05/` report bodies were **compressed in-place** — redundant restatement removed; each file's unique essence + every externally-cited section retained; status banners and successor pointers unchanged. Logs (`05_05/log.md`, `19_05/log.md`, `19_05/INDEX.md`) left untouched. Folder sizes `05_05` 360K→164K, `19_05` 204K→152K. Full originals remain in git history. Operation log + per-file table: [`17_06/dev_reports_volume_reduction.md`](./17_06/dev_reports_volume_reduction.md).

---

## Active & current (read these first)

| File | Status | Note |
|---|---|---|
| `VOCABULARY.md` | 📖 REFERENCE | Canonical naming; resolves the M-vs-Phase collision |
| `STATUS_INDEX.md` (this) | 🔵 ACTIVE | Master catalog |
| `ON_HOLD.md` | 🔵 ACTIVE | Deferred-items ledger. **Items 1 & 7 ✅ resolved** this session |
| `31_05/next_steps.md` | 🔵 ACTIVE | Execution checklist (A0–A4 + B/C ✅; DB-2 pending) |
| `31_05/db2_execution_plan.md` | 🔵 ACTIVE | **DB-2 plan** — vitest repair + PG test target + adapter/shim + M2.0–M2.9 |
| `31_05/logs.md` | 📓 LOG | M1-completion execution log (A4/B1/B2/C1) + full smoke sweep |
| `31_05/phase1_completion_strategy.md` | 🔵 ACTIVE | M1-completion strategy + scrutiny |
| `31_05/dev_reports_consolidation_strategy.md` | ✅ IMPLEMENTED | This consolidation |
| `31_05/migration_0001_verification.md` | ✅ IMPLEMENTED | `0001` applied (79 tables) + verified |
| `31_05/m1_postgres_migration_and_connectivity.md` | ✅ IMPLEMENTED | DB-1 done & verified |
| `29_05/async_migration_call_site_audit.md` | 🔵 ACTIVE | **DB-2 source of truth** (635 sites). Its "M2" = DB-2 |

## AI-layer / demo era (2026-06 → 07) — newest first

| File | Status | Note |
|---|---|---|
| `ai_serv/2026-07-18-ai-engineer-handoff.md` | ⭐ 🔵 ACTIVE | **Latest handoff** → ai-engineer. Session summary + `ai_feedback` contract |
| `ai_serv/ai-studio-retired.md` | ✅ IMPLEMENTED | AI-Studio UI entry points removed; route kept for deep links |
| `docs/superpowers/plans/2026-07-17-ugc-video-ui-async.md` | ✅ IMPLEMENTED | Video UI + poller + routes (Tasks 1–7 done; T8 → dryayeet) |
| `docs/superpowers/plans/2026-07-17-chat-formatting-and-ai-studio-retirement.md` | ✅ IMPLEMENTED | Chat CSS + prompt + retirement |
| `docs/superpowers/plans/2026-07-17-feedback-ai-feedback.md` | ✅ IMPLEMENTED | `ai_feedback` table + route + thumbs |
| `ai_serv/creative/chat-to-studio-handoff-deferred.md` | 🔵 ACTIVE | Deferred design — chat→studio prefill handoff |
| `2026-07-17-execution-resume-note.md` | ✅ IMPLEMENTED | Compact-survival note; all 3 plans now executed (compressed) |
| `2026-07-17-ai-layer-demo-state-and-tasklist.md` | 🔵 ACTIVE | Demo state + per-route AI-serving map + persistence decisions |

## Durable reference (point-in-time facts, still accurate)

| File | Note |
|---|---|
| `26_05/database_state.md`, `26_05/hidden_ai_tables_schema.md` | DB snapshots that fed DB-1 |
| `25_05/railway_data_at_risk.md` | Decision record: prod data sacrificed |
| `23_05/state_of_codebase.md`, `module_inventory.md`, `live_http_surface.md`, `risk_register.md`, `smoke_test_results.md` | Durable inventories/registers |
| `19_05/scope_alignment.md`, `05_05/scope_alignment.md` | SoW milestone mapping (M1–M5 source of truth) |
| `19_05/smoke_test_results.md` | May-20 smoke record (cited by ON_HOLD) |
| `05_05/guide.md`, `05_05/run_guide.md` | Codebase/run guides |
| `05_05/rate_limiting/*`, `19_05/rate_limiting/*` (non-impl) | Upstream-limit refs + decision matrices |

## Implemented (built & shipped)

| File | Note |
|---|---|
| `25_05/pre_pr_review.md` | M0 PR shipped |
| `19_05/section_2_implementation.md` | build-unblock + gateway reconciliation (55 tsc→0) |
| `05_05/rate_limiting/implementation_plan.md` | llm-gateway rate limiter shipped (`1521cce`) |

## Invalidated (premise was wrong — do not follow)

| File | Corrected by | Why |
|---|---|---|
| `25_05/shopify_tokens_fork.md` | `31_05/next_steps.md` §2 | The JOIN-through-`brands.owner_user_id` plan is wrong; fix is a 2-line `brand_id`→`user_id`. `owner_user_id` never existed. |
| `25_05/next_steps.md` §3 (shopify sub-step) | `31_05/next_steps.md` | (the file is ♻️ overall; this *section* is ❌) |

## Superseded (correct for their date; replaced as source of truth)

| File | Superseded by |
|---|---|
| `25_05/next_steps.md` | `31_05/next_steps.md` (Tier-1 commits ✅; M1 deliverables + shopify plan replaced) |
| `24_05/next_steps.md` | `25_05/next_steps.md` |
| `24_05/merge_readiness.md` | `25_05/pre_pr_review.md` |
| `24_05/priority_db_vs_cleanup.md`, `24_05/sow_alignment.md` | `24_05/next_steps.md` / `26_05/database_state.md` |
| `23_05/next_steps.md`, `23_05/new_findings.md` | `24_05/next_steps.md` |
| `19_05/*` (audit, backend_wiring, db_structure, final_report, guide, new_and_added_risks, structured_logging, suggested, tasklist, Database_migration_strat, run_guide) | `23_05` state/inventories, `26_05/database_state.md`, the migration arc |
| `05_05/*` (audit, backend_wiring, cleanup_*, db_structure, final_report, new_*, structured_logging, suggested, tasklist, Database_migration_strat) | their `19_05/` restatements / `26_05/database_state.md` |

---

## Per-folder roll-up

| Folder | Theme | Dominant status |
|---|---|---|
| `05_05/` | Initial audit (Apr–early May) | ♻️ SUPERSEDED (+ refs, 1 implemented) |
| `19_05/` | Audit refresh w/ current numbers | ♻️ SUPERSEDED (+ refs, 1 implemented) |
| `23_05/` | Codebase state + inventories | 📖 REFERENCE (+ superseded next_steps) |
| `24_05/` | Merge-readiness + planning | ♻️ SUPERSEDED |
| `25_05/` | PR plan + fork forensic + Railway decision | mixed (✅ PR, ❌ fork, 📖 Railway, ♻️ plan) |
| `26_05/` | DB snapshots | 📖 REFERENCE |
| `29_05/` | Async cutover audit | 🔵 ACTIVE (DB-2) |
| `31_05/` | DB-1 + M1-completion + this consolidation | 🔵 ACTIVE / ✅ |

> Logs excluded above by rule: `05_05/log.md`, `19_05/log.md`, `19_05/INDEX.md`, `23_05/INDEX.md`+`session_log.md`, `24_05/INDEX.md`+`session_log.md`, `25_05/INDEX.md`+`session_log.md`.
