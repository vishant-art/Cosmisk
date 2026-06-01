> **Status: 🔵 ACTIVE (2026-05-31)** — current execution checklist; A0–A3 done, A4/B/C + DB-2 pending. (Terminology: "Phase 1" = **M1 completion**; "Phase 2"/the "M2 cutover" = **DB-2**.)
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Next Steps — Phase 1 Completion + M2 Cutover Backlog (Execution Checklist)

**Date:** 2026-05-31
**Branch:** `db-migration`
**Derived from:** [`phase1_completion_strategy.md`](./phase1_completion_strategy.md) (analysis + scrutiny) and [`../29_05/async_migration_call_site_audit.md`](../29_05/async_migration_call_site_audit.md) (M2 surface).
**Guardrails:** no `Co-Authored-By`/AI attribution in commits; explain each code change before applying; no destructive git ops; D3 adds a dependency and D2–D5 edit `server/src/` — confirm before applying (freeze override is local-only on this branch).
**Decisions locked this session:** A0 = recommended (conform pg-schema to app write contract). A1 = port-as-is (assessment below); merges deferred to M2. A3 = strategy written below, **apply on explicit go**.

---

## 0. State of the branch

- M1 done: 70 tables on Neon, connectivity fixed. SQLite still live; nothing in the request path imports the pg layer.
- Working tree: only `dev_reports/31_05/*` untracked. No `server/src/` edits since M1.

---

## 1. Track A — Data layer (one reviewed migration `0001`)

Additive only — no edits to existing reads except the two A3 lines.

### Step A0 — LOCKED: conform the 2 conflicting tables to the app's write contract

`global_patterns` (`pg-schema.ts:1058`) and `creative_analysis` (`pg-schema.ts:1002`) currently declare a uuid/array shape that **rejects how the app actually writes** (`pattern-transfer.ts:132` inserts its own TEXT id + JSON-string `source_clients`; `ad-watchdog.ts:781` inserts its own TEXT id). Edit the two `pgTable` defs to:
- `global_patterns`: `id text('id').primaryKey()`, `sourceClients text('source_clients')` (JSON string), keep `confidence` numeric, keep `(pattern, category)` unique.
- `creative_analysis`: `id text('id').primaryKey()`, `clientId text('client_id')` **nullable** (drop NOT NULL/FK).

Modernising to uuid/array is a separate M2 ticket with coordinated app edits — out of scope.

### Step A1 — Port orphan tables — ASSESSMENT-DRIVEN (was "port all 10")

**Assessment (verified by live read/write tracing).** Verdict per table: PORT-as-is for Phase 1 (additive, zero query rewrites) vs DROP vs defer-MERGE to M2.

| Table | Live refs | Nearest existing table | Phase-1 verdict | Note |
|---|---:|---|---|---|
| `brands` | 69 | `service_clients` (real superset: brand_name, category, meta_ad_account_id, shopify_store) | **PORT** | Merge into `service_clients` = rewriting 69 sites → **M2 consolidation**, not now |
| `audits` | 29 | none | **PORT** | core audit history; no equivalent |
| `scheduled_audits` | 10 | `automations` (different domain) | **PORT** | live cron-scheduler state |
| `client_contexts` | 5 | `service_clients` (+ agent-config overflow) | **PORT** | read by 5+ agents; consolidation = M2 |
| `strategic_predictions` | 9 | `predictions` (near-duplicate fields) | **PORT** | strongest merge candidate → **M2** |
| `strategic_recommendations` | 7 | `recommendations` (near-duplicate) | **PORT** | strong merge candidate → **M2** |
| `strategic_running_context` | 4 | `agent_core_memory` | **PORT** | consolidation = M2 |
| `strategic_reports` | 4 | `reports` | **PORT** | consolidation = M2 |
| `brand_context` | 3 | — (audit-local) | **PORT** | thin (5 cols, 1 reader at `audit/index.ts:349`); cheap to port, avoids behavioural change |
| `agent_execution_log` | 3 | `agent_runs` / `agent_decisions` | **DROP (skip port)** | **write-only, zero readers** — pure debug log; remove its 3 writes (`agent-orchestrator.ts:184/205/232`) in M2 |

**Net Phase-1 migration `0001`: port 9 tables + reshape 2 (A0). Skip `agent_execution_log`.**

**Why not merge now (scrutiny):** each merge = rewriting every reader/writer with column remapping = behavioural change against a HIGH blast-radius surface (graph: 500+ nodes within 2 hops). That is precisely the file-by-file call-site work M2 owns. Phase 1 stays additive: port for parity so the app boots on Postgres unchanged; consolidate during/after the cutover. The 6 verified merge opportunities are captured as **M2.5 consolidation tasks** (§4).

Porting rules (from M1 §2): timestamps `mode:'string',withTimezone:true`; `*_json`/JSON-bearing TEXT stays `text()`; `0/1` flags stay `integer()`; carry indexes with table-prefixed names (`idx_global_patterns_*`, `idx_creative_analysis_client`).

Leave the runtime `CREATE TABLE IF NOT EXISTS` paths in place (SQLite-only, harmless); they're deleted in M2.5.

**DoD:** `tsc --noEmit` no new db errors.

### Step A2 — Generate, review, apply migration `0001` — ✅ DONE (2026-05-31)

`drizzle/0001_damp_ghost_rider.sql` generated, `USING`-hardened (see [`migration_0001_verification.md`](./migration_0001_verification.md)), and **applied to Neon**. `db:check` → **79 public tables** on pooled + direct. Reshaped columns verified (`global_patterns.source_clients` text, `creative_analysis.client_id` nullable, etc.); all 9 ported tables present; `agent_execution_log` correctly absent.

> **A0 + A1 + A2 + A3 are now complete.** Remaining Phase-1 (M1-completion) work: **A4** (seed brands + pg-layer parity test), **B1/B2** (Sentry, Request-ID), **C1** (`as any`). Then **DB-2** (the 635-site cutover, §4).

### Step A3 — `shopify_tokens` fix — STRATEGY (apply on go) — see §2 below

### Step A4 — Seed 3 brands + pg-layer parity test

- Idempotent seed of 3 brands against `DATABASE_URL`.
- One vitest spec: connect to the **pooled** pg layer, assert the 9 new tables exist, round-trip one `*_json` TEXT column.

**DoD:** spec green against pooled URL.

---

## 2. A3 STRATEGY — `shopify_tokens` brand_id → user_id (apply after explicit go)

**Verified facts (not assumptions):**
- Canonical `shopify_tokens` PK = `user_id` (`schema.ts:408`, `pg-schema.ts:462`). Every writer uses it: OAuth write `routes/shopify.ts:168` (`request.user.id`), `shopify-client.ts:615/628`, reader `ad-watchdog.ts:891`.
- Exactly **two** readers query `WHERE brand_id = ?`, and both bind a **user id**:
  - `unified-agent-runner.ts:178` — `userId` is the function's 1st positional param (`:115`); the sibling lookup one line up (`meta_tokens WHERE user_id = ?`, `:171`) uses the same `userId` correctly. `brand_id` is the outlier.
  - `cohort-ltv-analyzer.ts:190` — only live caller is `ad-watchdog.ts:954 → quickCohortLTVCheck(user.id)` (a real `users.id`). The `clientId` path `analyzeCohortLTVForClient` (`:824`) has **zero live callers** — dead.

**The change (2 lines):**
```diff
# unified-agent-runner.ts:178  and  cohort-ltv-analyzer.ts:190
- WHERE brand_id = ?
+ WHERE user_id = ?
```
No JOIN, no `brands.owner_user_id` (doesn't exist). Under canonical Postgres the old `brand_id` query throws `column "brand_id" does not exist`; this aligns the column to the value already bound.

**Documented caveat (do NOT fix now):** if the dead `analyzeCohortLTVForClient(clientId)` path is ever revived, it would pass a `service_clients.id` into a `user_id`-keyed lookup and resolve nothing. But clients resolve Shopify via `service_clients.shopify_store` / `client-context.shopifyStores`, **not** the `shopify_tokens` table — the client flow is architecturally separate. This is a pre-existing latent issue, orthogonal to the migration. Note it; leave it.

**Verify after apply:** `grep -rn "shopify_tokens" server/src | grep brand_id` → empty; exercise the watchdog path (`quickCohortLTVCheck`) and a unified run; confirm a token resolves.

**Status: ✅ DONE (2026-05-31).** Both lines edited to `WHERE user_id = ?`; `grep brand_id` against `shopify_tokens` empty; `tsc` clean for both files. Live path verified (ad-watchdog → `quickCohortLTVCheck(user.id)`; unified runner's `userId` matches sibling `meta_tokens` lookup).

---

## 3. Tracks B & C (unchanged from prior)

- **B1 Sentry** (~½d): `@sentry/node`; `Sentry.init` atop `index.ts` (before factory `:59`); `captureException` inside existing handler `:118`; no-op when `SENTRY_DSN` unset.
- **B2 Request-ID/correlationId** (~½d): own `request.id` + inbound as `parentRequestId`; standardise cron `runId`; write id into existing `cost_ledger.metadata` JSON at `llm-gateway.ts:204` (no schema column).
- **C1 `as any`** (~½d, prod-only): 159 total → target prod <50, justify residuals; skip casts wrapping `db.prepare().get()` rows (rewritten in M2). Hot files: `intelligence-persistence.ts`(11), `recommendation-loop.ts`(8), `intelligence-infrastructure.ts`(8), `audit/index.ts`(7), `service-clients.ts`(6).

---

## 4. Phase 2 — M2 ASYNC CUTOVER (the 635 sync `.prepare()` call sites)

The full surface that must convert sync better-sqlite3 → async Drizzle/pg. **635 prod call sites / 69 files** (routes 300/30 · services 291/35 · audit 11/1 · db 8/2 · index 25/1) + **423 test calls / 36 files**. Source: [`../29_05/async_migration_call_site_audit.md`](../29_05/async_migration_call_site_audit.md). Ordered tasks:

- **M2.0 — Prereqs (blockers).**
  - Pick a Postgres **test target** (Neon test branch / local PG / `pg-mem`) — without it the 635 sites migrate blind.
  - Build an **async SQL adapter** mirroring today's shape (`await q.get/all/run`) over the pg pool, with a **dialect shim**: `?`→`$n` placeholders, `datetime('now')`→`now()`, `INSERT OR REPLACE/IGNORE`→`ON CONFLICT …`, `json_extract(c,'$.x')`→`c->>'x'`. (30 files use `datetime('now')`, 6 use upserts, 3 use `json_extract`.)
  - Add **`DB_BACKEND=sqlite|postgres`** flag behind the adapter (instant rollback — the real safety net).
- **M2.1 — Pilot** one low-risk route end-to-end (`auth` login or `dashboard` read) with its existing test green; surfaces dialect gotchas early.
- **M2.2 — Routes (300/30), leaf-first.** Heaviest: `creative-engine.ts`(65), `billing.ts`(39), `content.ts`(23), `agent.ts`(19), `team.ts`(18), `ugc-workflows.ts`(17), `creative-studio.ts`(17), `auth.ts`(16). One commit per file; `vitest` after each batch.
- **M2.3 — Services (291/35), the harder half** (async colour propagates through the call-graph). Heaviest: `service-clients.ts`(27), `job-queue.ts`(23), `intelligence-persistence.ts`(23), `ad-watchdog.ts`(19), `strategic-memory.ts`(16), `sales-agent.ts`(16).
- **M2.4 — Re-point the 5 `new Database()` bypass files** (`audit-scheduler.ts`, `client-context.ts`, `strategic-memory.ts`, `audit/index.ts`, `db/index.ts`) at the shared pg pool.
- **M2.5 — Delete runtime DDL + schema consolidation** (depends on A1 ports landed):
  - Remove the 6 services' `CREATE TABLE IF NOT EXISTS` paths.
  - **Drop `agent_execution_log`** — remove its 3 writes (`agent-orchestrator.ts:184/205/232`).
  - Optional consolidation (verified-real merges from A1): `strategic_predictions`→`predictions`, `strategic_recommendations`→`recommendations`, `strategic_reports`→`reports`, `strategic_running_context`→`agent_core_memory`, `brands`/`client_contexts`→`service_clients`. Each = rewrite that table's readers/writers; do only with explicit value.
- **M2.6 — Convert `audit/index.ts`(11) + `index.ts`(25)** (boot/cron paths — already async-capable).
- **M2.7 — Port 423 test call sites** to the M2.0 Postgres test target.
- **M2.8 — Flip `DB_BACKEND` default to `postgres`**; bake ≥1–2 commits.
- **M2.9 — Retire** `getDb()`, `schema.ts`, the old `index.ts` DB path, and `better-sqlite3`.

---

## 5. Execution order & drop-priority

```
PHASE 1 (now):
  A0 ✓locked ─► A1 port(9) ─► A2 migrate ─► A3 fix(on go) ─► A4 seed+test
  B1 Sentry / B2 Request-ID / C1 as-any  (parallel)
PHASE 2 (after Phase 1): M2.0 ─► M2.1 ─► M2.2/2.3 ─► M2.4 ─► M2.5 ─► M2.6 ─► M2.7 ─► M2.8 ─► M2.9
```

| Priority | Item |
|---|---|
| NEVER DROP | A0–A2 (schema parity — M2 can't start without it), A3 (else 2 services 500 on PG) |
| KEEP | A4 parity test |
| DEFER | B1 (init only) |
| DROP→M2 | B2, C1 |

---

## 6. Phase 1 Definition of Done

- Migration `0001` applied; `db:check` shows the 9 new tables on pooled + direct.
- No table in two conflicting shapes (A0).
- No `brand_id` ref against `shopify_tokens`; both readers resolve by `user_id`.
- Sentry catches a thrown error; request logs carry `reqId`, cron logs `runId`, `cost_ledger` rows carry the id in metadata.
- 3 brands seeded; pg-layer vitest spec green against pooled URL.
- Prod `as any` < 50, residuals justified.
