# dev_reports — Canonical Vocabulary (milestones vs. phases vs. migration stages)

**Date:** 2026-05-31 · **Status:** 📖 REFERENCE (durable). This is the single source of truth for naming. The `STATUS_INDEX` and all banners use these terms.

---

## 1. The problem: three overlapping number-lines

Reports across dates used "Phase N" and "MN" to mean **different things**, which collide:

| Where it appears | "M1 / M2 / M3 …" meant | "Phase 0–4" meant |
|---|---|---|
| **SoW / `05_05/scope_alignment.md`** (contract, Apr 15 2026) | **Project Milestones**: M1 Infrastructure · M2 Ingestion · M3 AI Analysis · M4 Generative · M5 QA | the audit's *internal* work phases, later mapped onto the milestones |
| **`29_05` + `31_05` DB-migration reports** | **migration stages**: M1 = schema stand-up · M2 = call-site cutover · M3 = idiomatic Drizzle | — |
| **`31_05/phase1_completion_strategy.md` + `next_steps.md`** (mine) | — | "Phase 1" = finish Infrastructure · "Phase 2" = the 635-site cutover |

The collision: **"M2" means "Ingestion & Normalization" in the contract but "call-site cutover" in the migration reports.** And "Phase 2" has meant three different things. This doc fixes the names; it does **not** change any plan.

---

## 2. Canonical scheme (use these going forward)

### Tier 1 — **Milestones** `M1…M5` — RESERVED for the SoW contract. Never reuse.
| Milestone | Window (SoW) | Scope |
|---|---|---|
| **M1 — Infrastructure** | May 16 – 28 | PostgreSQL + types + logging |
| **M2 — Ingestion & Normalization** | May 29 – Jun 10 | Connectors, translation layer, Brain |
| **M3 — AI Analysis (RAG + Anomaly)** | Jun 11 – 22 | RAG pipeline + anomaly fallback |
| **M4 — Generative Engine** | Jun 23 – Jul 3 | Creative Studio, triggers, cloud upload |
| **M5 — QA & Final Delivery** | Jul 4 – 10 | E2E + deployment |

> Always write **"M1"** / **"Milestone 1"** for these. Today (Jun 1) we are completing **M1**, which has run past its May 28 window.

### Tier 2 — **DB-migration stages** `DB-1…DB-3` — RENAMED (were "M1/M2/M3" in the migration reports).
The whole database migration is a **work-stream inside M1 — Infrastructure**, with stages:
| Stage | Was called | Scope | State |
|---|---|---|---|
| **DB-1** | "M1" (29_05/31_05) | Postgres/Drizzle stand-up + Neon connectivity | ✅ done |
| **DB-1.5** | (new) | Schema parity — port the 9 orphan tables (migration `0001`) | 🔵 in flight |
| **DB-2** | "M2" (29_05/31_05) | sync→async call-site cutover (635 sites) + delete runtime DDL | ⏳ pending |
| **DB-3** | "M3" (29_05/31_05) | optional idiomatic Drizzle rewrite | ⏳ optional |

### Tier 3 — "Phase 1 / Phase 2" in my recent docs → **realias, then retire the term.**
| Old term (my docs) | Canonical meaning |
|---|---|
| **"Phase 1"** | **M1 completion** = DB-1 ✅ + DB-1.5 + the non-DB M1 deliverables (Sentry, Request-ID, `as any`) + the A3 shopify fix |
| **"Phase 2"** | **DB-2** (call-site cutover) — still *inside* M1 Infrastructure, **not** SoW M2 (Ingestion) |

---

## 3. Disambiguation rules

1. **"M1…M5" = SoW milestones only.** If you mean a migration stage, write **"DB-1/DB-2/DB-3"**, never "M2".
2. **The DB migration lives under M1.** DB-2 (cutover) is M1 plumbing, **not** M2 (Ingestion). SoW M2 starts only after the app runs on Postgres.
3. **Avoid bare "Phase N"** in new docs. Use "M1 completion" or the specific "DB-N" stage. Existing docs get a banner mapping their term to this table.
4. **The audit's historical "Phase 0–4"** (in `05_05`/`19_05`) are frozen history — mapped onto milestones in `05_05/scope_alignment.md §2`; left as-is, banner points here.

---

## 4. Quick map (so old reports stay readable)

```
SoW:        M1 Infrastructure ───────────────────────► M2 Ingestion ► M3 ► M4 ► M5
              │
              ├─ DB-1   Postgres stand-up            ✅  (29_05/31_05 called this "M1")
              ├─ DB-1.5 schema parity (9 tables)     🔵  (migration 0001)
              ├─ DB-2   async call-site cutover      ⏳  (29_05/31_05 called this "M2")
              ├─ DB-3   idiomatic Drizzle (optional) ⏳
              └─ non-DB: Sentry · Request-ID · as-any
"Phase 1" (my docs) = M1 completion   |   "Phase 2" (my docs) = DB-2
```
