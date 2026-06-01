> **Status: ♻️ SUPERSEDED (2026-05-31)** — point-in-time gap check of `23_05/next_steps.md` vs the SoW; the gap it flags was closed in `24_05/next_steps.md`. Superseded by `24_05/next_steps.md`. For the durable SoW mapping see `05_05/scope_alignment.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# SoW Alignment — Verifying `next_steps.md` Against the Original Scope of Work

**Source of truth:** `dev_reports/05_05/scope_alignment.md` (Cosmisk Project Documentation, Apr 15 2026).
**Audited document:** `dev_reports/23_05/next_steps.md`.
**Date:** 2026-05-24.

---

## 1. TL;DR

`next_steps.md` is a **bug-fix and cleanup-arc plan**. It correctly captures urgent bugs and the long-tail of repo hygiene. But it does **not currently surface the four official M1 deliverables** from the SoW. Those need to be added.

| Coverage | Where |
|---|---|
| ✅ Build hygiene | Tier 1 (unblock commit) |
| ✅ Bug fixes | Tier 1 (schedules auth, shop_name drift) |
| ✅ Quality / test hygiene | Tier 2 (fix 9 + 8 test fails) |
| ✅ Code organisation | Tier 3 (CI guards, god-file decomposition, gateway wraps) |
| ✅ Feature work | Tier 4 (stubs → real) |
| ❌ **M1 official deliverables** | **Not in the plan** |

---

## 2. Original SoW recap

From `dev_reports/05_05/scope_alignment.md`:

### Three official risks (Apr 15 doc)

| Risk | Description | Status in `next_steps.md` |
|---|---|---|
| **#1 — Database** | SQLite + missing indexes → migrate to PostgreSQL + Drizzle | **Not explicitly in `next_steps.md`.** Tier 3.8 mentions "schema consolidation" but interprets it as "consolidate SQLite `CREATE TABLE` sites", not "migrate to Postgres". |
| **#2 — Observability** | No Sentry, split logging, no request-id | **Not in `next_steps.md`.** |
| **#3 — Type safety** | `as any` casts, lax typing | **Partially in `next_steps.md`** — Tier 2 covers the test-fail cleanup which touches type usage, but no audit-pass over the 78 `as any` instances. |

### Milestone calendar

| Milestone | Window | Allowed activity |
|---|---|---|
| Academic Exam Break | Apr 15 – May 15 | Analysis + architecture only. Zero implementation. |
| **M1 — Infrastructure** | **May 16 – May 28** | **PostgreSQL + types + logging** ← **current window, 4 days left** |
| M2 — Ingestion & Normalisation | May 29 – Jun 10 | Connectors, translation layer, Brain |
| M3 — AI Analysis (RAG + Anomaly) | Jun 11 – Jun 22 | RAG pipeline + anomaly fallback |
| M4 — Generative Engine | Jun 23 – Jul 3 | Creative Studio architecture, triggers, cloud upload |
| M5 — QA & Final Delivery | Jul 4 – Jul 10 | E2E + deployment |

### What's officially out of scope

| Item | Status in `next_steps.md` |
|---|---|
| Risk A — JWT-in-localStorage | Listed as deferred (Tier 3.11) ✅ correct |
| Risk D — God-files | Listed as deferred (Tier 3.10) ✅ correct |
| Risk E — LLM cost ceiling | Already shipped (the gateway). Tier 2.5 finishes it. ✅ |
| Risk B — In-process cron → queue | Listed as deferred (Tier 3.11). Partially in M4 scope. ⚠️ |
| Risk C — Retry on external APIs | Listed as deferred (Tier 3.11). Partially in M2 scope. ⚠️ |

---

## 3. Item-by-item audit of `23_05/next_steps.md`

| Item | SoW relationship | Verdict |
|---|---|---|
| Tier 1.1 — Commit unblock work | Build hygiene — supports M1 type-safety (Risk #3) | ✅ In scope |
| Tier 1.2 — `/schedules` auth | Security — same family as Risk A; out per SoW | ⚠️ Out of scope but defensible as P0 bug fix |
| Tier 1.3 — `shop_name` drift | DB — Risk #1 adjacent; fixed properly by PG+Drizzle anyway | ✅ In scope |
| Tier 2.4 — Intelligence auth audit | Security — same as 1.2 | ⚠️ Out of scope, defensible |
| Tier 2.5 — Wrap 2 LLM-gateway bypasses | LLM cost — Risk E (was out, gateway shipped, this finishes the arc) | ⚠️ Out of original scope; in-scope by extension |
| Tier 2.6 — Unblock 9 skipped tests | Type-safety + observability adjacent — Risk #3 | ✅ In scope |
| Tier 2.7 — Fix 8 pre-existing test fails | Type-safety + quality — Risk #3 | ✅ In scope |
| Tier 3.8 — Schema consolidation (SQLite) | DB — Risk #1, but mis-scoped: SoW wants migration to Postgres, not SQLite cleanup | ⚠️ Partial — should be Postgres+Drizzle |
| Tier 3.9 — CI grep guards | DevEx — not in SoW | ❌ Out of scope |
| Tier 3.10 — Docs refresh | Admin — not in SoW | ❌ Out of scope |
| Tier 3.11 — Deferred (JWT, cron, retry, principal) | Mix of out-of-scope and partially-in-scope | ⚠️ Correctly deferred |
| Tier 4 — Feature work (stubs → real) | M2-M4 product scope | ❌ Premature — M1 first |

---

## 4. Gaps — what the SoW requires that `next_steps.md` doesn't cover

Reading `next_steps.md` against `scope_alignment.md`, these official-scope items are **missing from the plan**:

### 4.1 PostgreSQL + Drizzle migration (Risk #1)

**Status today:**
```
$ grep -E 'drizzle|postgres|pg\b' server/package.json
(empty — still SQLite, no Drizzle)
```

**M1 expectation:** by end of May 28, the server runs against Postgres via Drizzle, with all existing tests passing.

**Effort:** 3-5 days. Critical path for all downstream milestones.

### 4.2 Sentry integration (Risk #2)

**Status today:**
```
$ grep -rE '@sentry|Sentry\.|sentry\.init' server/src --include='*.ts' | grep -v __tests__
(empty)
```

**M1 expectation:** error capture + release tracking working in dev and prod.

**Effort:** ~half day for basic init; ~1 day if you wire it into all error-response paths.

### 4.3 Request-ID / correlationId in logs (Risk #2)

**Status today:**
- 492 `logger.*` calls vs 24 `console.*` — adoption is good
- BUT no `requestId` or `correlationId` field threaded through

**M1 expectation:** every log line tied to a request, every cron run tied to a run-id.

**Effort:** ~half day (Fastify `genReqId` + log binding + thread `runId` through cron entrypoints).

### 4.4 `as any` audit cleanup (Risk #3)

**Status today:**
```
$ grep -rE 'as any' server/src --include='*.ts' | grep -v __tests__ | wc -l
78
```

Up from 35 in `19_05/audit.md`. Direction of travel is wrong.

**M1 expectation:** trend down, ideally to <20.

**Effort:** ~1 day for an audit-and-replace pass (most `as any` casts can become a specific type with grep + manual review).

---

## 5. Recommendation

Insert a new **Tier 1.5 — M1 Official Deliverables** section in `next_steps.md`, between current Tier 1 (immediate bug fixes) and Tier 2 (cleanup-arc tail). It contains:

1. PostgreSQL + Drizzle migration (Risk #1)
2. Sentry integration (Risk #2)
3. Request-ID / correlationId wiring (Risk #2)
4. `as any` audit cleanup (Risk #3)

Time-box to May 28. If you finish early, Tier 2 items absorb the slack. If you slip, drop everything in Tier 2-4 first and never drop Tier 1 / 1.5.

See `24_05/next_steps.md` for the updated plan with this section added.

---

## 6. What the SoW does NOT mandate, but `next_steps.md` includes anyway

This is fine — it's hygiene work that's cheap and shouldn't get dropped. But it's worth flagging that these are *additions* to the formal SoW, not the SoW itself:

| Item | Why it's still worth doing |
|---|---|
| `/schedules` auth | Security bug. SoW doesn't mandate auth hardening but shipping a known auth hole is non-negotiable. |
| `shop_name` drift | Risk #1 adjacent. Even though the proper fix is PG migration, the 30-min on-boot patch closes a live 500 immediately. |
| LLM gateway bypass wraps | Closes the gateway adoption story. Cheap. |
| 8 test fails | Test hygiene. Don't merge while red. |
| CI guards | Long-term hygiene insurance. |

---

## 7. What the SoW mandates that `next_steps.md` correctly defers

| Item | Why deferral is correct |
|---|---|
| God-file decomposition (Risk D) | SoW explicitly lists as "opportunistic refactor". |
| JWT-cookie migration (Risk A) | SoW explicitly says "out of scope". |
| In-process cron → queue (Risk B) | Adjacent to M4; bundle there. |
| External-API retry/CB (Risk C) | Adjacent to M2 (ingestion); bundle there. |

These are correctly held back in Tier 3.11. No change needed.

---

## 8. Single-line scorecard

> `next_steps.md` covers the **branch-merge gates and the post-M1 cleanup arc**. It does **not** cover the **M1 deliverables themselves**. Add Tier 1.5, time-box to May 28, and the plan becomes complete.
