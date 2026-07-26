> **Status: 📖 REFERENCE (2026-05-31)** — SoW scope mapping refreshed for the post-break window; durable reference.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Scope Alignment — Refresh (2026-05-19/20)

**Supersedes:** `dev_reports/scope_alignment.md` (2026-04-26). **Audited against:** Apr 15, 2026 SoW + academic-break "analysis only" rule (Apr 15 – May 15, 2026). Break window CLOSED 2026-05-15; M1 should have started 2026-05-16.

## Unique essence preserved

### 1. Milestone-window status (post-break) — SoW source of truth

| Milestone | Window | Status today |
|---|---|---|
| Academic Exam Break | Apr 15 – May 15 | **CLOSED** |
| M1 — Infrastructure | **May 16 – May 28** | **In progress (day 4 of 13)**. Phases 0–2 should start (per `final_report.md`). LLM gateway shipped on cleanup branch (Phase 0.3), but **build is broken** and other Phase 0/1 items not started. |
| M2 — Ingestion & Normalization | May 29 – Jun 10 | Pending |
| M3 — AI Analysis (RAG + Anomaly) | Jun 11 – Jun 22 | Pending |
| M4 — Generative Engine | Jun 23 – Jul 3 | Pending |
| M5 — QA & Final Delivery | Jul 4 – Jul 10 | Pending |

### 2. Original mapping vs current reality (4 scope decisions from `final_report.md` §1 still stand)

| Finding | Original | Current |
|---|---|---|
| Audit Risk 1 (DB) | ✅ in scope | larger surface — 40→71 tables. |
| Audit Risk 2 (Observability) | ✅ in scope | larger — 96 console.* + no Sentry. |
| Audit Risk 3 (Type safety) | ✅ in scope | larger — 78 production `as any`. |
| Added Risk A (JWT cookie) | ✅ design-only during break | Still in scope. Design doc not produced; can now ship code. |
| Added Risk B (in-process cron) | Partial / M4 | **PROMOTED to P1** per Risk J — cadence quadrupled before isolation. |
| Added Risk C (no retry / CB) | Partial — M2/M4 | Same bundling. Worse (Shopify + Python scrapers added). |
| Added Risk D (god-files) | Out of scope | Out of scope; **competitor-creative-intel.ts (2,614 LOC)** first decomposition target per Risk H. |
| Added Risk E (LLM cost ceiling) | In scope (cleanup branch) | **Partially done.** Gateway shipped; 2 services still bypass. |
| Added Risk F (column-only migrations) | Resolved w/ Drizzle in M1 | Pending; **19 `ensureColumn` calls** (was 13). |
| Added Risk G (single-replica + SQLite-on-disk) | Resolved w/ PG migration | Pending. |

### 3. New scope items since 2026-04-26 (need owner decisions)
- **Risk H — God-file inflation:** 5 files >900 LOC, top three no tests. Owner gate before any decomposition.
- **Risk I — Direct-Anthropic bypass:** competitor-creative-intel + comment-mining-agent un-wrapped. ~1.5 days. Extends Risk E — fold in.
- **Risk J — Cron cadence:** watchdog every 6h, autopilot every 4h, all in-process. Promote Risk B (partial/M4) → P1.
- **Risk K — Schema drift:** `shopify_tokens` dual-defined. Owned by Risk F. ~0.5 day mechanical.
- **Risk L — Operator scripts vs gateway policy:** synthetic-principal vs bypass-flag. ~0.5 day once decided.
- **Risk M — Python scrapers no dep policy:** owner gate; out of scope unless added.
- **Risk N (CRITICAL) — Server does not compile:** 15 files, 25 missing modules. In scope by emergency triage — blocks all milestone work. 0.5–1 day.

### 4. Net recommendation for M1 window (day 4 of 13, 9 days left)

| Day | Item | Source |
|---|---|---|
| 1 | S0: chown env, npm ci | `cleanup_suggestions.md` |
| 1–2 | S1: fix 25 broken imports → `tsc` green | `cleanup_suggestions.md` |
| 3 | S2: collapse 11 lazy/script tables into `schema.ts` | `new_database_issues.md` §7 |
| 3 | S3.1–S3.2: wrap last 2 direct-Anthropic services | `rate_limiting/implementation_plan.md` |
| 4 | S4: repo hygiene + branch triage | `cleanup_plan.md` §3-4 |
| 4 | S5: CI grep guards | `cleanup_plan.md` §8 |
| 5 | P0.1 (Sentry server + browser) | `suggested.md` P0.1 |
| 5–6 | P0.2 (request-id + console.* migration) | `structured_logging.md` |
| 7 | P0.4 (JWT cookie + refresh) | `suggested.md` P0.4 |
| 8–9 | P1.1 (indexes) + P1.2 (typed rows) | `suggested.md` P1 |
| 10–11 | P2.1 (Drizzle on one route) + P2.2 (managed PG) | original P2 |
| 12–13 | P2.3 + P2.4 (cutover) | original P2 |

Compresses original P0–P2 plan into remaining M1 days; cleanup before new feature work.

### 5. Out of scope (still)
- God-file decomposition (Risk D / H); frontend god-file decomposition.
- Cron extraction (Risk B / J) — bundle into M4 as planned, **unless** Risk J's cadence forces it forward.
- External-API retry/CB (Risk C) — bundle into M2/M4.
- Python scrapers dep policy (Risk M).

### 6. Open decisions for owner

| ID | Question | Source |
|---|---|---|
| OG-1 | OK to `sudo chown -R` over root-owned dirs? | `cleanup_suggestions.md` S0 |
| OG-2 | Were the 4 missing routes ever written? Path A/B/C? | S1.1 |
| OG-3 | Was `intelligence-integration.ts` ever written? | S1.2 |
| OG-4 | Is the `ad-engine/` feature still planned? | S1.4 |
| OG-5 | Is the `signal-discovery/` cluster still planned? | S1.6 |
| OG-6 | Are the 12 unified-agent-runner analysers still planned? | S1.7 |
| OG-7 | Operator-script gateway policy — A or B? | S3.4 |
| OG-8 | `dev_reports/` tracking policy — A or B? | `cleanup_plan.md` §3.2 |
| OG-9 | OK to archive-and-delete 3× claude/* + dev + lean-devcontainer branches? | `cleanup_plan.md` §3.4-3.5 |
| OG-10 | External links to root-level `.md` files? | `cleanup_plan.md` §4.6 |
| OG-11 | OK to patch `Database_migration_strat.md`? | `new_database_issues.md` §8 |

## Cited & kept (referenced elsewhere)
- §1 M1..M5 milestone definitions, §2 audit-risk mapping, §3 new risks H..N, §4 M1 plan, §5 out-of-scope, §6 owner decisions — all retained above. SoW M1..M5 mapping is the source of truth cited by STATUS_INDEX.md.

## Pointer
- DURABLE_REFERENCE -> see: durable SoW M1..M5 mapping (and `dev_reports/05_05/scope_alignment.md` SoW source-of-truth).
