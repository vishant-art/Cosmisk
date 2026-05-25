# Priority — Database Stabilisation vs Repository Cleanup

**Date:** 2026-05-24
**Question on the table:** With ~5 working days until the M1 milestone deadline (May 28), should the next chunk of work go into database stabilisation, or into the broader repository cleanup arc?

---

## 1. Verdict

**Database stabilisation, by a clear margin.** Three independent reasons converge.

| Reason | Evidence |
|---|---|
| **The official SoW says so.** | `dev_reports/05_05/scope_alignment.md` § 1 — DB is **Risk #1**. Repo cleanup items (god-files = Risk D, `as any` cleanup = adjacent to Risk #3) are listed as in-scope-but-secondary. God-file decomposition is explicitly recommended as "opportunistic refactor", not a milestone. |
| **There's a live production 500 from the DB.** | `/shopify/status` 500s today because `shopify_tokens.shop_name` is queried but the column doesn't exist in the `CREATE TABLE` definition. See `dev_reports/23_05/new_findings.md` § 1. Repo cleanup has no comparable customer-facing failure. |
| **DB blocks downstream milestones.** | M2 (Ingestion & Normalisation, May 29 – Jun 10), M3 (RAG + Anomaly, Jun 11 – Jun 22), and M4 (Generative Engine, Jun 23 – Jul 3) all assume Postgres exists. If M1 (current window, ends **May 28** — 4 days from today) slips, the entire downstream chain slips. |

---

## 2. What "DB stabilisation" actually entails

Ordered by increasing effort + decreasing urgency:

| Step | Effort | Lands what |
|---|---|---|
| **1.** Patch `shopify_tokens.shop_name` column drift | ~30 min | Live 500 closes. Stop the bleeding. |
| **2.** Generalise the `ensureUsersColumn` migration helper into `ensureColumn(table, column, def)` | ~30 min | Adds same on-boot column-add safety for any future drift. |
| **3.** Soft-delete columns on every table (`deleted_at TIMESTAMP NULL`) | ~half day | Makes data deletion auditable; matches CRM/billing requirements. Risk-register item Q from `19_05/audit.md`. |
| **4.** Consolidate `CREATE TABLE` statements into a single `db/schema.ts` | ~1 day | 71 tables across 6 source locations → one. Removes the drift class entirely. Closes Risk B from 19_05. |
| **5.** **PostgreSQL + Drizzle migration (the M1 deliverable)** | ~3-5 days | Risk #1 from SoW closed. Foundation for M2-M4. Schema-migration ledger comes free with Drizzle. |
| **6.** Schema-migration ledger documentation | ~half day | Free with Drizzle; just needs writing up. |

Steps 1+2 are tiny. Step 3 makes downstream life easier but isn't on the critical path. Steps 4+5 are the actual M1 work and are the biggest risk-to-deliver in the next 4 days.

---

## 3. What "repository cleanup" entails (and why it can wait)

The cleanup arc described across `dev_reports/19_05/cleanup_suggestions.md` and `23_05/next_steps.md`:

| Item | SoW status | Why it can wait |
|---|---|---|
| Wrap 2 remaining LLM-gateway bypasses | Out of scope per SoW; carry-over from Risk E | Cost is bounded — these two services aren't the highest-spend paths. Wrap during M1 if there's idle time. |
| Fix 8 pre-existing test failures | In scope (Risk #3 quality) | Mark with `it.skip` for now; fix during M1 if there's idle time. |
| CI grep guards | Out of scope (DevEx) | Lower priority than shipping. Land during M2 cool-down. |
| God-file decomposition | Explicitly out of scope per SoW | "Opportunistic refactor" — touch only when already in the file. |
| Stub-to-real fleshing (16 service stubs, 4 route stubs) | M2-M4 product scope | These ARE the future product work but they assume DB foundation. |
| Doc refresh / risk-register maintenance | Admin | This *is* what dev_reports/24_05/ exists for. Done. |

---

## 4. The combined picture — what 5 days of "DB-first" looks like

| Day | Date | Item | Bucket |
|---|---|---|---|
| 1 | 2026-05-24 | shop_name patch + schedules auth fix | Bug-fix pre-merge |
| 1 | 2026-05-24 | Local Docker build smoke | Pre-merge validation |
| 1 | 2026-05-24 | Push branch, open PR, merge, monitor Railway | Get cleanup live |
| 2 | 2026-05-25 | Open fresh M1 branch off `main`. Design Postgres schema (column types, FK rules, index list). Set up Drizzle config. | DB stabilisation |
| 2-3 | 2026-05-25/26 | Write migration script: SQLite → Postgres dump → restore | DB stabilisation |
| 3 | 2026-05-26 | Update `db/index.ts` to open Postgres connection (env-driven). Drizzle schema types autogen. | DB stabilisation |
| 4 | 2026-05-27 | Update 30+ call sites that use `better-sqlite3` API to use Drizzle's API | DB stabilisation |
| 4 | 2026-05-27 | Test parity: every existing test passes against Postgres | DB stabilisation |
| 5 | 2026-05-28 | M1 review: Sentry integration + request-ID middleware (Risk #2) bundled if time permits | M1 finish |
| 5 | 2026-05-28 | M1 retrospective + handoff doc to M2 | M1 close |

Realistic risk: **steps 2-4 take 4-5 days, not 3**. PG migration is the kind of work where one schema-drift surprise eats a day. Plan for slippage.

---

## 5. What gets cut if M1 slips

If by May 28 we're not done with PG+Drizzle, in priority order:

1. **Drop**: god-file decomposition, CI guards, doc refresh — never blocks anything.
2. **Drop or defer**: Sentry + request-ID middleware. Risk #2 from SoW; defer to start of M2 if M1 slips.
3. **Drop or defer**: the 8 test-fix work. They were red anyway; status quo.
4. **NEVER drop**: the production bug fixes (`/schedules`, `shop_name`). Those are 30 min each and ship value immediately.
5. **NEVER drop**: PG+Drizzle. If it slips a day, slip the deadline a day, but don't drop it.

---

## 6. Counter-argument considered

> "Repo cleanup is concrete and fast (the gateway-bypass wrap is half a day; the 8 test fixes are 3 hours). DB stabilisation is a 4-day risk with unclear deliverable boundaries. Shouldn't we do the small wins first?"

**Why this loses:**

- "Small wins" don't unstick downstream milestones. M2 cannot start until PG exists.
- DB cleanup is **already on the formal milestone calendar** (May 16-28). Repo cleanup is not. Doing repo cleanup during M1 means slipping the formal deliverable.
- The two genuinely urgent items in the "repo cleanup" bucket (`/schedules` auth, `shop_name` drift) are **bug fixes, not cleanup**. They're in the DB-first plan anyway (Day 1).

---

## 7. Decision summary

```
Today (Day 0)  : Ship the unblock + close /schedules + close shop_name → merge
Days 1-5       : PG + Drizzle (the official M1 deliverable)
Days 5+        : Sentry + request-ID if M1 finishes early; else defer
M2 cool-down   : Repo cleanup arc resumes (gateway wraps, CI guards, etc.)
```

**Do not start M1 work until the unblock commits are merged to main.** A fresh branch off `main` post-merge is much cleaner than building M1 atop the cleanup branch.
