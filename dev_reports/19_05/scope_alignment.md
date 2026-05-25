# Scope Alignment — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/scope_alignment.md` (2026-04-26)
**Audited against:** Cosmisk Project Documentation (Apr 15, 2026 SoW) + the academic-break "analysis only" rule (Apr 15 – May 15, 2026).

> The academic-break window has **closed** (ended 2026-05-15). The original constraint that drove this document — "analysis only, zero implementation" — no longer applies. Milestone 1 should have started 2026-05-16.

---

## 1. Milestone-window status (post-break)

| Milestone | Window | Status today |
|---|---|---|
| Academic Exam Break | Apr 15 – May 15 | **CLOSED** |
| M1 — Infrastructure | **May 16 – May 28** | **In progress (day 4 of 13)**. Per `final_report.md`, this is when Phases 0–2 should start. Today: LLM gateway shipped on the cleanup branch (Phase 0.3 in the original numbering), but **build is broken** and other Phase 0/1 items have not started. |
| M2 — Ingestion & Normalization | May 29 – Jun 10 | Pending |
| M3 — AI Analysis (RAG + Anomaly) | Jun 11 – Jun 22 | Pending |
| M4 — Generative Engine | Jun 23 – Jul 3 | Pending |
| M5 — QA & Final Delivery | Jul 4 – Jul 10 | Pending |

---

## 2. Original mapping vs current reality

The four in-conversation scope decisions logged in `dev_reports/final_report.md` § 1 still stand:

| Finding | Original status | Current status |
|---|---|---|
| Audit Risk 1 (DB) | ✅ In scope | **In scope, larger surface** — 40 tables → 71. |
| Audit Risk 2 (Observability) | ✅ In scope | **In scope, larger surface** — 96 console.* + no Sentry. |
| Audit Risk 3 (Type safety) | ✅ In scope | **In scope, larger surface** — 78 production `as any`. |
| Added Risk A (JWT cookie) | ✅ In scope (design-only during break) | **Still in scope.** Design doc not yet produced; can now ship code. |
| Added Risk B (in-process cron) | Partial / Milestone 4 | **PROMOTED to P1** per Risk J — cadence quadrupled before isolation. |
| Added Risk C (no retry / CB) | Partial — bundle in M2/M4 | Same bundling. Materially worse (Shopify + Python scrapers added). |
| Added Risk D (god-files) | Out of scope | **Out of scope** but **competitor-creative-intel.ts** (2,614 LOC) is the first concrete decomposition target per Risk H. |
| Added Risk E (LLM cost ceiling) | In scope (carve-out, done on cleanup branch) | **Partially done.** Gateway shipped; 2 services still bypass. |
| Added Risk F (column-only migrations) | Resolved with Drizzle in M1 | Pending; 19 `ensureColumn` calls today (was 13). |
| Added Risk G (single-replica + SQLite-on-disk) | Resolved with PG migration | Pending. |

---

## 3. New scope items surfaced since 2026-04-26

These were not in the original SoW and need owner decisions on whether to fold them into the milestones:

### 3.1 New Risk H — God-file inflation
Five files >900 LOC, top three with no tests. Was out-of-scope by original framing; **owner gate needed** before any decomposition.

### 3.2 New Risk I — Direct-Anthropic call sites bypass gateway
Two services still un-wrapped (competitor-creative-intel, comment-mining-agent). **Effort:** ~1.5 days. **Naturally extends Risk E (in scope)** — recommend folding in.

### 3.3 New Risk J — Cron cadence increased without isolating cron from API
Watchdog now every 6 h, autopilot every 4 h, all in-process. **Promote Risk B from "partial / M4" to a P1 item.**

### 3.4 New Risk K — Schema drift (`shopify_tokens` dual-defined)
Owned by Risk F (Drizzle migration). Cleanup is mechanical (~0.5 day).

### 3.5 New Risk L — Operator scripts vs gateway policy
Owner choice: synthetic-principal vs bypass-flag. Effort once decided: ~0.5 day.

### 3.6 New Risk M — Python scrapers no dep policy
Owner gate. Out of scope unless explicitly added.

### 3.7 New Risk N (CRITICAL) — Server does not compile
15 files, 25 missing modules. **In scope by emergency triage** — no other Milestone work can ship until this is resolved. Effort: 0.5–1 day.

---

## 4. Net recommendation for the M1 window (now)

The M1 window started 2026-05-16; today is 2026-05-20 (day 4 of 13). The order of work for the remaining 9 days should be:

| Day | Item | Source |
|---|---|---|
| 1 | S0: chown env, npm ci | `cleanup_suggestions.md` |
| 1–2 | S1: fix 25 broken imports → `tsc` green | `cleanup_suggestions.md` |
| 3 | S2: collapse 11 lazy/script tables into `schema.ts` | `new_database_issues.md` § 7 |
| 3 | S3.1–S3.2: wrap last 2 direct-Anthropic services | `rate_limiting/implementation_plan.md` |
| 4 | S4: repo hygiene + branch triage | `cleanup_plan.md` § 3-4 |
| 4 | S5: CI grep guards | `cleanup_plan.md` § 8 |
| 5 | P0.1 (Sentry server + browser) | original `suggested.md` P0.1 |
| 5–6 | P0.2 (request-id + console.* migration) | `structured_logging.md` |
| 7 | P0.4 (JWT cookie + refresh) | original `suggested.md` P0.4 |
| 8–9 | P1.1 (indexes) + P1.2 (typed rows) | original `suggested.md` P1 |
| 10–11 | P2.1 (Drizzle on one route) + P2.2 (managed PG) | original P2 |
| 12–13 | P2.3 + P2.4 (cutover) | original P2 |

This compresses the original P0–P2 plan into the remaining M1 days, prioritising the cleanup before any new feature work.

---

## 5. Out of scope (still)

- God-file decomposition (Risk D / H).
- Frontend god-file decomposition.
- Cron extraction (Risk B / J) — bundle into M4 as originally planned, **unless** Risk J's higher cadence forces it forward.
- External-API retry/CB (Risk C) — bundle into M2/M4.
- Python scrapers dep policy (Risk M).

---

## 6. Open decisions for owner

| ID | Question | Source |
|---|---|---|
| OG-1 | OK to `sudo chown -R` over root-owned dirs? | `cleanup_suggestions.md` S0 |
| OG-2 | Were the 4 missing routes ever written? Path A/B/C? | `cleanup_suggestions.md` S1.1 |
| OG-3 | Was `intelligence-integration.ts` ever written? | S1.2 |
| OG-4 | Is the `ad-engine/` feature still planned? | S1.4 |
| OG-5 | Is the `signal-discovery/` cluster still planned? | S1.6 |
| OG-6 | Are the 12 unified-agent-runner analysers still planned? | S1.7 |
| OG-7 | Operator-script gateway policy — A or B? | S3.4 |
| OG-8 | `dev_reports/` tracking policy — A or B? | `cleanup_plan.md` § 3.2 |
| OG-9 | OK to archive-and-delete 3× claude/* + dev + lean-devcontainer branches? | `cleanup_plan.md` § 3.4-3.5 |
| OG-10 | External links to root-level `.md` files? | `cleanup_plan.md` § 4.6 |
| OG-11 | OK to patch `Database_migration_strat.md`? | `new_database_issues.md` § 8 |

---

**End of refresh.**
