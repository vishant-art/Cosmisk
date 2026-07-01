> **Status: 📖 REFERENCE (2026-05-31)** — SoW milestone source of truth (Apr-15 scope mapping); cited downstream as canonical.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Scope Alignment — 2026-04-26

Maps audit findings + proposed phasing against the **Cosmisk Project Documentation (Apr 15, 2026)** scope of work and academic-break milestones; flags everything out of scope.

## Unique essence preserved

### 1. Mapping audit findings to official scope (DB = Risk #1)

| My finding | Official Risk #1 (DB) | Official Risk #2 (Observability) | Official Risk #3 (Type safety) | Original SoW (Phase 2/3 deliverables) | In scope? |
|---|---|---|---|---|---|
| Audit Risk 1 — SQLite + missing indexes | ✅ | | | | **In scope** |
| Audit Risk 2 — No Sentry / split logging | | ✅ | | | **In scope** |
| Audit Risk 3 — `as any` casts | | | ✅ | | **In scope** |
| Added Risk A — JWT in localStorage | | | | | **Out of scope** |
| Added Risk B — In-process cron | | partly (Risk #2 covers job failure visibility) | | partly (Phase 3 "Automated Trigger Logic") | **Partially in scope** |
| Added Risk C — No retry/circuit breaker on external APIs | | partly (Risk #2 covers silent failure) | | partly (Phase 2 "Abstract Ingestion Engine", Phase 3 "Cloud Asset Pipeline") | **Partially in scope** |
| Added Risk D — God-files | | | | | **Out of scope** |
| Added Risk E — Cost ceilings only on creative jobs | | | | | **Out of scope** |
| Added Risk F — Custom column-only migrations | ✅ (resolved by Drizzle adoption in Risk #1) | | | | **In scope, free with Risk #1** |
| Added Risk G — Single-replica + SQLite-on-disk | ✅ (resolved by PostgreSQL migration in Risk #1) | | | | **In scope, free with Risk #1** |

**Summary:** Fully in-scope (re-affirmed by audit): Risk #1/#2/#3. Resolved as side effect of Risk #1 (Postgres + Drizzle): Added F (migrations), Added G (single replica). Partially in-scope (touch Phase 2/3): Added B (cron → job queue = natural form of "Automated Trigger Logic"), Added C (retry/circuit breaker = production-grade "Abstract Ingestion Engine"). Strictly out of scope: Added A (JWT cookie), Added D (god-files), Added E (LLM cost ceiling).

### 2. Proposed phases vs academic-break milestones

| Milestone (official) | Window | Allowed activity | My phases | Conflict? |
|---|---|---|---|---|
| Academic Exam Break | **Apr 15 – May 15** | **Analysis + architecture only. Zero implementation.** | Phase 0 + Phase 1 + Phase 2 (analysis only) | ⚠️ P0 proposed as immediate code work — **Conflicts** with no-implementation rule unless reclassified analysis-only or escalated. |
| Milestone 1 — Infrastructure | **May 16 – May 28** | PostgreSQL + types + logging | Phase 1 + Phase 2 | ✅ Aligned. |
| Milestone 2 — Ingestion & Normalization | **May 29 – Jun 10** | Connectors, translation layer, Brain | (no equivalent — outside audit) | ✅ No conflict. |
| Milestone 3 — AI Analysis (RAG + Anomaly) | **Jun 11 – Jun 22** | RAG pipeline + anomaly fallback | (no equivalent) | ✅ No conflict. |
| Milestone 4 — Generative Engine | **Jun 23 – Jul 3** | Creative Studio architecture, triggers, cloud upload | Phase 3 (queue) + Phase 4 (resilience) naturally adjacent — infra prerequisites for trigger + asset pipeline. | ⚠️ Not in official SoW but arguably preconditions for M4. Owner decision needed. |
| Milestone 5 — QA & Final Delivery | **Jul 4 – Jul 10** | E2E + deployment | — | ✅ |

### 3. Phase 0 vs the "Zero Implementation" rule
Original Phase 0 ("Stop the bleeding week 1: Sentry, request-id, cost ceiling, cookie auth") conflicts with Apr 15 – May 15 zero-implementation rule.
- **Option A (follows rule):** Phase 0 = analysis-only until May 16 (design docs, vendor selection, risk-register entries); on May 16, P0 + P1 both start, but Phase 0 is now ~2 days of work that is independent of the PG migration, so it slots in as a parallel track. Trade-off: bleeding continues ~3 weeks.
- **Option B (carve-out):** run only cost ceiling + Sentry as incident-prevention hotfix during break; cookie-auth + `console.*` cleanup wait until May 16. Trade-off: stretches "zero implementation."
- **Option C (defer):** push all Phase 0 into Milestone 1 (May 16 – May 28); adds ~2–3 days, same window. Trade-off: risks persist until May 16.
- **Recommendation: Option C** for bulk of Phase 0, with one carve-out — **add the LLM cost ceiling now** (~3 hrs, near-zero blast radius, protects the break itself). Sentry, request-id, cookie auth wait for May 16. (Earlier "ship Phase 0 week 1" answer revised because the academic-break rule is a hard constraint.)

### 4. OUT of scope — flag now
1. **JWT cookie migration** (Added Risk A — task P0.4 / #9): real security gap, not in SoW. Escalate as scope-extension; if declined, document residual risk in security register.
2. **In-process cron → BullMQ/pg-boss** (Added Risk B — P3.1 / #17): adjacent to M4 "Automated Trigger Logic" but SoW doesn't require a queue. Bundle P3.1 *into* M4 as the chosen implementation.
3. **External-API retry/circuit breaker** (Added Risk C — P4.1–P4.3 / #19–#21): adjacent to M2 "Abstract Ingestion Engine" + M4 "Cloud Asset Pipeline." Bundle P4.1 + P4.2 (ingestion gets retry, asset pipeline gets idempotency).
4. **Per-user LLM cost ceiling** (Added Risk E — P0.3 / #8): not in SoW. Escalate as hotfix during break (Option B) or absorb into M1.
5. **God-file decomposition** (Added Risk D — P5.1–P5.3 / #22–#24): pure hygiene. Drop from formal plan; track as opportunistic refactors during M1–M4.

Backup drill / restore exercise / schema-migration ledger are captured inside the Risk #1 deliverable (Postgres + Drizzle) — no separate flag needed.

### 5. Net recommendation for Apr 15 – May 15
Break deliverables: `audit.md` ✅, `new_and_added_risks.md` ✅, `suggested.md` ✅, `tasklist.md` ✅, `db_structure.md` (delivered), `backend_wiring.md` (delivered); a **scope-extension memo** (for out-of-scope A/D/E + optional B/C bundling); a **detailed PG schema design** for M1 (column types, FK rules, index list, seed strategy — analysis only); a **Sentry + cookie-auth design doc** for M1 day 1 (analysis only). Only code recommended during break = cost-ceiling guard (Option B carve-out), with explicit go-ahead.

## Cited & kept (referenced elsewhere)
- §1 DB=Risk#1 audit-finding mapping table — cited by 24_05/next_steps, 24_05/priority_db_vs_cleanup §1, 24_05/sow_alignment, 25_05/next_steps, VOCABULARY.md, STATUS_INDEX.md.
- §2 audit Phase 0-4 → milestone M1..M5 mapping (windows + allowed activity) — same downstream citations.

## Pointer
- DURABLE_REFERENCE -> see: durable SoW source-of-truth; restated in 19_05/scope_alignment.md
