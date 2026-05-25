# Scope Alignment — 2026-04-26

This document maps my audit findings and proposed phasing against the **Cosmisk Project Documentation (Apr 15, 2026)** scope of work and academic-break milestones, and flags everything that falls outside.

---

## 1. Mapping audit findings to official scope

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

**Summary of in/out:**
- **Fully in-scope (and re-affirmed by audit):** Risk #1 / #2 / #3 from the Apr-15 doc.
- **Resolved as a side effect of Risk #1 once we move to Postgres + Drizzle:** Added Risk F (migrations) and Added Risk G (single replica).
- **Partially in-scope** because they touch Phase 2/3 deliverables: Added Risk B (cron → job queue is the natural form of "Automated Trigger Logic") and Added Risk C (retry/circuit breaker is the natural form of "Abstract Ingestion Engine" being production-grade).
- **Strictly out of scope** as the SoW reads today: Added Risk A (JWT cookie), Added Risk D (god-files), Added Risk E (LLM cost ceiling).

---

## 2. Mapping my proposed phases to the academic-break milestones

| Milestone (official) | Window | Allowed activity | My phases | Conflict? |
|---|---|---|---|---|
| Academic Exam Break | **Apr 15 – May 15** | **Analysis + architecture only. Zero implementation.** | Phase 0 + Phase 1 + Phase 2 (analysis only) | ⚠️ I proposed Phase 0 as immediate code work. **Conflicts** with the no-implementation rule unless P0 is reclassified as analysis-only or escalated. |
| Milestone 1 — Infrastructure | **May 16 – May 28** | PostgreSQL + types + logging | My Phase 1 + Phase 2 | ✅ Aligned. |
| Milestone 2 — Ingestion & Normalization | **May 29 – Jun 10** | Connectors, translation layer, Brain | (no equivalent in my plan — was outside audit) | ✅ Out of audit, no conflict. |
| Milestone 3 — AI Analysis (RAG + Anomaly) | **Jun 11 – Jun 22** | RAG pipeline + anomaly fallback | (no equivalent) | ✅ Out of audit, no conflict. |
| Milestone 4 — Generative Engine | **Jun 23 – Jul 3** | Creative Studio architecture, triggers, cloud upload | My Phase 3 (queue) + Phase 4 (resilience) lie *naturally adjacent* to this — they are infra prerequisites for the trigger + asset pipeline. | ⚠️ My Phase 3/4 are not in the official SoW but are arguably preconditions for Milestone 4. Need owner decision. |
| Milestone 5 — QA & Final Delivery | **Jul 4 – Jul 10** | E2E + deployment | — | ✅ |

---

## 3. Debating my Phase 0 against the academic-break rule

My original Phase 0 recommendation said *"Stop the bleeding in week 1: Sentry, request-id, cost ceiling, cookie auth."* That conflicts with the explicit **"Zero Implementation"** rule for Apr 15 – May 15.

**Three honest options.**

### Option A (defensible, follows the rule): Treat Phase 0 as analysis-only until May 16
- During the break: design docs, vendor selection (Sentry plan, cookie strategy, cost-ledger schema), risk-register entries.
- On May 16, Phase 0 + Phase 1 *both* start — but Phase 0 is now ~2 days of work that is independent of the PG migration, so it slots in as a parallel track.
- **Trade-off:** the bleeding (no Sentry, JWT in localStorage, unbounded LLM spend) continues for ~3 more weeks.

### Option B (carve-out): Run only the cost ceiling and Sentry as a hotfix during the break
- Argue these are not "implementation of new features" but **incident-prevention** — a closer cousin to "fix a P0 bug" than to "implement Phase 1."
- Cookie-auth migration and `console.*` cleanup wait until May 16.
- **Trade-off:** stretches the spirit of "zero implementation." Defensible only if you frame it as protecting the academic-break work itself (a runaway LLM bill or a Sentry-less production incident is the worst kind of distraction during exams).

### Option C (defer entirely): Push all of Phase 0 to Milestone 1
- Cleanest read of the rule. Phase 0 becomes part of May 16 – May 28 along with Phase 1.
- Milestone 1 was originally just "Phase 1 — Infrastructure"; absorbing my Phase 0 into it adds ~2–3 days of work but stays inside the same window.
- **Trade-off:** the listed risks (LLM bill, JWT, blindness) persist until May 16. Practically: the system has been running this way already; one more month is survivable as long as nothing changes.

**My recommendation:** **Option C** for the bulk of Phase 0, with one carve-out — **add the LLM cost ceiling now** as a defensive guard, because a single incident there could derail the whole project budget. Cost-ceiling code is ~3 hours, has near-zero blast radius, and protects the break itself. Sentry, request-id, and cookie auth wait for May 16.

Why I'm departing from my earlier "ship Phase 0 in week 1" answer: the academic-break rule wasn't on my radar when I drafted that. The rule is a hard constraint, not a preference, and the system has tolerated these gaps for some time already.

---

## 4. What is OUT of scope and should be flagged now

These items appear in my audit/plan but are **not** in the Apr-15 Scope of Work or any milestone:

1. **JWT cookie migration (Added Risk A — task P0.4 / #9).** Real security gap, but the SoW does not list authentication hardening. Recommend escalating as a scope-extension request. If declined, document the residual risk in a security register.
2. **In-process cron → BullMQ/pg-boss (Added Risk B — task P3.1 / #17).** Adjacent to Milestone 4's "Automated Trigger Logic" but the SoW does not require a queue. Recommend bundling P3.1 *into* Milestone 4 as the chosen implementation of Automated Trigger Logic, rather than treating it as separate scope.
3. **External-API retry/circuit breaker (Added Risk C — tasks P4.1–P4.3 / #19–#21).** Adjacent to Milestone 2's "Abstract Ingestion Engine" and Milestone 4's "Cloud Asset Pipeline." Recommend bundling P4.1 + P4.2 into the relevant milestones (ingestion gets retry, asset pipeline gets idempotency).
4. **Per-user LLM cost ceiling (Added Risk E — task P0.3 / #8).** Not in SoW. Recommend escalating as a hotfix during the break (Option B carve-out above) or absorbing into Milestone 1.
5. **God-file decomposition (Added Risk D — tasks P5.1–P5.3 / #22–#24).** Pure hygiene. Recommend dropping from the formal plan and tracking as opportunistic refactors during Milestones 1–4 ("if you're already touching `index.ts`, extract a route module").

Anything else I noted (e.g., backup drill, restore exercise, schema-migration ledger) is captured inside the Risk #1 deliverable (Postgres + Drizzle), so no separate flag needed.

---

## 5. Net recommendation for the Apr 15 – May 15 window

Spend the academic break producing:

- `audit.md` ✅ (done)
- `new_and_added_risks.md` ✅ (done)
- `suggested.md` ✅ (done)
- `tasklist.md` ✅ (done)
- `db_structure.md` (this delivery)
- `backend_wiring.md` (this delivery)
- A **scope-extension memo** if you want any of the four out-of-scope items (A, D, E, plus optional B/C bundling decisions) added to the formal plan.
- A **detailed PG schema design** for Milestone 1 (column types, FK rules, index list, seed strategy) — pure analysis, no implementation.
- A **Sentry + cookie-auth design doc** to drop into Milestone 1 day 1 — pure analysis, no implementation.

The only code I'd recommend writing during the break is the cost-ceiling guard (Option B carve-out), and only with explicit go-ahead.
