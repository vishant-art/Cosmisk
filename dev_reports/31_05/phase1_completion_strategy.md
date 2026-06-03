> **Status: 🔵 ACTIVE (2026-05-31)** — current M1-completion plan; A0/A1/A2/A3 landed. (Terminology: "Phase 1" = **M1 completion**; "Phase 2"/"M2" = **DB-2**.)
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Phase 1 — Completion Strategy + Implementation Scrutiny

**Date:** 2026-05-31
**Branch:** `db-migration`
**Status:** Strategy / spec. Code freeze respected — this is a spec for the dev team to implement; no `server/src/` edits made.
**Predecessors:** [`m1_postgres_migration_and_connectivity.md`](./m1_postgres_migration_and_connectivity.md) · [`../29_05/async_migration_call_site_audit.md`](../29_05/async_migration_call_site_audit.md) · [`../25_05/next_steps.md`](../25_05/next_steps.md)
**Ground truth:** verified against the working tree on `db-migration` (greps + Explore sweep + code-review-graph, graph last built 2026-05-31T01:40). Not transcribed from prior reports — where this doc and an older report disagree, this doc wins and the delta is called out.

---

## 0. What "Phase 1" means here

Phase 1 = the **SoW "Infrastructure / M1" milestone** (per `25_05/next_steps.md` §3), a *bundle* of deliverables, of which the Postgres stand-up was only one. It is **not** the call-site cutover — that is M2 / Phase 2 and is explicitly out of scope below (§8).

The Postgres **schema stand-up + Neon connectivity** sub-deliverable is **done and verified** (70 tables applied; Happy-Eyeballs fix). What remains of Phase 1 is six items, three of which the DB work eclipsed and never landed.

---

## 1. Ground-truth state (verified 2026-05-31)

| # | Deliverable | State | Evidence |
|---|---|---|---|
| D1 | Orphan/runtime tables in `pg-schema.ts` | **MISSING (12 tables)** + 2 in conflict | runtime DDL in 6 services + 2 scripts; pg-schema cross-checked |
| D2 | `shopify_tokens` fork reconciliation | **2-line bug, not landed** | `cohort-ltv-analyzer.ts:190`, `unified-agent-runner.ts:178` |
| D3 | Sentry | **ABSENT** | no `@sentry/*` in `server/package.json`; no `Sentry.init` |
| D4 | Request-ID / correlationId | **PARTIAL** | Pino configured (`utils/logger.ts`); `runId` in crons; HTTP `request.id` not threaded; `cost_ledger` has no `correlationId` column |
| D5 | `as any` cleanup (target <30) | **159 occurrences** (73 prod / 86 test) | `grep -rno "as any" server/src` |
| D6 | Re-seed brands + Postgres test target | **NOT DONE** | no `DB_BACKEND`, no PG test wiring |

**Corrections to prior reports (do not skip):**
- The `brands` table has **no `owner_user_id`** column — it has `user_id` (FK → `users.id ON DELETE SET NULL`), defined only in `scripts/add-audit-tables.ts:11-24`, not in any schema file. The `25_05` plan's "JOIN through `brands.owner_user_id`" is therefore **impossible and unnecessary** — see D2.
- `global_patterns` (`pg-schema.ts:1058`) and `creative_analysis` (`pg-schema.ts:1002`) **already exist** in pg-schema with a *different* shape than the runtime DDL in `pattern-transfer.ts` / `ad-watchdog.ts`. This is a drift-reconciliation decision, not a port — see D1.

---

## 2. D1 — Port the orphan/runtime tables into `pg-schema.ts`

This is the **true Phase-1 residual** and the one hard prerequisite for M2: the app *reads* these tables, but they are created by runtime `CREATE TABLE` (and two seed scripts), so they are absent from the migration-managed schema. Without them, a Postgres app boots and 500s on first read.

**12 tables to add** (table → defining site → already in pg-schema?):

| Table | Defined at | PK | Conflict? |
|---|---|---|---|
| `brands` | `scripts/add-audit-tables.ts:11` | `id TEXT` | new |
| `brand_context` | `scripts/add-audit-tables.ts:27` | `brand_id TEXT` | new |
| `audits` | `scripts/add-audit-tables.ts:39` | `id TEXT` | new |
| `scheduled_audits` | `services/audit-scheduler.ts:136` | `id TEXT` | new |
| `client_contexts` | `services/client-context.ts:104` | `id TEXT` | new |
| `strategic_reports` | `services/strategic-memory.ts:158` | `id TEXT` | new |
| `strategic_recommendations` | `services/strategic-memory.ts:172` | `id TEXT` | new |
| `strategic_running_context` | `services/strategic-memory.ts:188` | `client_id TEXT` | new |
| `strategic_predictions` | `services/strategic-memory.ts:197` | `id TEXT` | new |
| `agent_execution_log` | `services/agent-orchestrator.ts` | `id TEXT` | new |
| `global_patterns` | `services/pattern-transfer.ts` | `id TEXT` | **CONFLICT** vs `pg-schema.ts:1058` |
| `creative_analysis` | `services/ad-watchdog.ts` | `id TEXT` | **CONFLICT** vs `pg-schema.ts:1002` |

**Strategy:**
1. For the **10 new tables**, transcribe each runtime DDL into Drizzle table builders in `pg-schema.ts`, applying the M1 porting rules already established (`m1_*.md` §2): `*_at`/`date` → `timestamp({mode:'string',withTimezone:true})`; JSON-bearing TEXT (`*_json`, `winning_patterns`, `context`, `output`) stays `text()` (app `JSON.parse`s it); `0/1` flags stay `integer()`; carry partial indexes with table-prefixed names.
2. For the **2 conflicts**, this is a **decision, not a transcription** (see §6 decision log). Pick the canonical shape and delete the loser's DDL path. Do **not** let two shapes coexist — that is the exact "schema drift" that started this migration.
3. Generate migration `0001` (`npm run db:generate`), review the SQL, apply (`npm run db:migrate`), re-run `npm run db:check` to confirm table count rises by the net new count.
4. The runtime `CREATE TABLE` statements stay **in place and harmless** during Phase 1 (they're `CREATE TABLE IF NOT EXISTS`, SQLite-only path). They get *deleted* during M2 when each owning service is converted — not now.

---

## 3. D2 — `shopify_tokens` fork: the real (2-line) fix

**Finding (verified).** Canonical `shopify_tokens` is keyed by `user_id` in both `schema.ts:408` and `pg-schema.ts:462`. Every writer/reader uses `user_id` — `routes/shopify.ts:168/191/220`, `shopify-client.ts:615/628`, `ad-watchdog.ts:891`. **Exactly two** readers query `WHERE brand_id = ?`, and **both bind a user id** as the value:

```
cohort-ltv-analyzer.ts:190   SELECT ... WHERE brand_id = ?   .get(userId)
unified-agent-runner.ts:178  SELECT * ... WHERE brand_id = ?  .get(userId)
```

Under canonical Postgres these throw `column "brand_id" does not exist`. The fix is to change the column name to match the value already being passed:

```diff
- WHERE brand_id = ?
+ WHERE user_id = ?
```

**No JOIN. No `brands.owner_user_id` (it doesn't exist).** Drop the `25_05` JOIN sub-step entirely. The "fork" was a divergent init script (`scripts/add-shopify-tables.ts` creates a `brand_id`-PK variant) shadowing the canonical `user_id` shape; canonical Postgres + these two query edits collapse the fork.

**Caveat to confirm before editing:** verify the bound `userId` at both call sites is genuinely a `users.id` and not a brand id flowing through a misnamed variable. The variable name and every sibling query say user id, but confirm the caller once (it's a 5-min trace, not a JOIN design).

---

## 4. D3 — Sentry

**Strategy (minimal, ~½ day):**
- `npm install @sentry/node` (note: adding a dependency — needs sign-off given the freeze).
- `Sentry.init({ dsn, environment, tracesSampleRate })` at the **very top** of `server/src/index.ts`, before the Fastify factory at `index.ts:59`.
- There is already a global error handler at `index.ts:118` (`app.setErrorHandler(...)`) — call `Sentry.captureException(error)` inside it rather than adding `setupFastifyErrorHandler`, so the existing `DailyCapExceededError`/`UpstreamRateLimitedError` branching is preserved.
- DSN via env (`SENTRY_DSN`); no-op when unset so local/test don't ship noise.
- **DoD:** a thrown error in any route appears in the Sentry project within 30s.

---

## 5. D4 — Request-ID / correlationId

Fastify already mints `request.id`; Pino is already the logger (`utils/logger.ts`). The gap is **threading**, not infrastructure.

**Strategy (~½ day):**
- HTTP: configure Fastify to honour an inbound `x-request-id` and fall back to its native id; ensure `request.log` (the per-request child logger) carries it — most of this is Fastify config, not new middleware.
- Cron/agent paths already mint `runId` (`unified-agent-runner.ts`, `report-agent.ts`, `ad-watchdog.ts`, `sales-agent.ts`) — standardise the field name to `runId` and ensure it's in the log context at each entrypoint.
- LLM cost trail: `cost_ledger` (`schema.ts:224`) has **no `correlationId` column** — it currently embeds context in the `metadata` JSON written by `llm-gateway.ts:204`. **Cheapest correct option:** write `correlationId`/`runId` into that existing `metadata` JSON at `recordCost()` — **no schema change**, so it doesn't enlarge D1's migration. Only add a real column if a query needs to filter on it.
- **DoD:** every request-scoped log line has `reqId`; every cron line has `runId`; recent `cost_ledger` rows carry the id in metadata.

---

## 6. D5 — `as any` cleanup

**Reality:** 159 today, not 78. 86 are in tests; **73 in production**. Target <30 was set against the old count.

**Strategy (~1 day, scoped to production):**
- Ignore test-file casts for Phase 1 (defer to M2 cool-down). Focus the 73 production casts, concentrated in `intelligence-persistence.ts` (11), `recommendation-loop.ts` (8), `intelligence-infrastructure.ts` (8), `audit/index.ts` (7), `service-clients.ts` (6).
- **Sequencing note:** many of these casts wrap raw `db.prepare(...).get()` row results — they will be **rewritten anyway during M2** when rows become typed Drizzle results. Doing a deep `as any` pass now risks churning code that M2 rewrites. **Recommendation:** down-scope D5 for Phase 1 to "production count <50, each residual cast gets a one-line justification comment," and let the DB-row casts die naturally in M2. Flag this as a deliberate scope cut, not a miss.

---

## 7. D6 — Re-seed brands + Postgres test target

- **Re-seed:** the 3 brands lost in the Railway sacrifice (`25_05/railway_data_at_risk.md`). Trivial once `brands` exists in pg-schema (D1). A short seed script against `DATABASE_URL`.
- **Postgres test target:** the 36 test files / 423 calls target SQLite. A PG test target (Neon test branch / local Postgres / `pg-mem`) is a **prerequisite for M2, not Phase 1** — but the *decision* should be made now so D1's new tables can get a parity test. **Phase-1 minimum:** add one vitest spec that connects to the pg layer and asserts the 12 new tables exist + a round-trip on a `*_json` text column. Full suite port is M2.

---

## 8. Scrutiny — implementation issues

1. **Schema-drift trap (D1 conflicts).** `global_patterns` and `creative_analysis` exist twice with different shapes (uuid+users-FK in pg-schema vs TEXT-id in the service DDL). If both survive, Postgres uses the migration shape and the service's runtime `CREATE TABLE IF NOT EXISTS` silently no-ops against it — then the service's *inserts* fail on column mismatch at runtime, not migrate-time. **Must** pick one shape and delete the other's DDL. Decision owner: whoever knows which columns the live readers actually select.
2. **Order dependency.** D1 (`brands`) must land before D6 (seed) and before D2's confirmation (the fork story references `brands`). Sentry/Request-ID/`as any` are independent and can land in parallel.
3. **Freeze conflicts.** D3 adds a dependency; D2/D3/D4/D5 edit `server/src/`. CLAUDE.md freezes `server/src/`. The user has overridden the freeze for local work on `db-migration`, but D3's new dependency and any `index.ts` edits should be explicitly confirmed before applying.
4. **Pooled-endpoint hazard carried into D1.** The app uses the PgBouncer-pooled `DATABASE_URL`; `node-postgres` prepared statements can misbehave on a transaction-pooled endpoint. Not triggered in Phase 1 (no request-path reads yet), but the D6 test spec should run against the **pooled** URL, not just the direct one, to surface it before M2.
5. **`request.id` uniqueness (D4).** Honouring inbound `x-request-id` without validation lets a client set a constant id and collapse log correlation. Prefer "generate our own, attach inbound as a separate `parentRequestId` field" if the API is internet-facing.
6. **D2 value-semantics confirmation.** The 2-line fix is correct *only if* the bound value is a user id at both sites. Confirm the caller of `analyzeCohortLTV`/the unified runner once before editing — cheap, and the only thing standing between "trivial fix" and "silent wrong-tenant data."

## 9. Scrutiny — optimisation issues

1. **Don't widen D1's migration with a `correlationId` column.** Writing the id into the existing `cost_ledger.metadata` JSON (D4) avoids a second migration and a backfill. Only promote to a column if a real query needs to filter/index on it.
2. **Don't over-invest in D5 now.** A full 159→<30 sweep touches DB-row casts that M2 rewrites — wasted churn on a high-fan-in surface. Scope it to non-DB production casts; let the rest die in M2.
3. **Batch the schema work.** D1 + the D6 parity test + the D2 query edits all touch the data layer — land them as one reviewed migration `0001` + a single test spec, rather than three round-trips through `db:generate`/`db:migrate`.
4. **High blast radius — keep Phase 1 additive.** code-review-graph impact for the 8 Phase-1 touch-files: **71 nodes changed directly, 500+ impacted within 2 hops, 51 additional files, risk HIGH** (`ad-watchdog.ts` and `unified-agent-runner.ts` are high fan-in). This argues for keeping D1 strictly additive (new tables, no edits to existing reads) and confining behavioural change to the two D2 lines — exactly the strangler posture M1 used. Do **not** opportunistically refactor inside these files during Phase 1.
5. **Indexes travel with the tables.** The runtime DDL ships indexes (`idx_global_patterns_*`, `idx_exec_log_*`, `idx_creative_analysis_client`). Port them in the same migration so the first Postgres reads aren't seq-scans — cheaper than discovering it under load in M2.

---

## 10. Sequencing & Definition of Done

```
Parallel track A (data layer, one migration):
  D1 port 10 tables  →  resolve 2 conflicts  →  D2 two-line fix  →  D6 seed + parity test
        └── generate/review/apply migration 0001 once at the end
Parallel track B (observability, independent):
  D3 Sentry          D4 Request-ID/correlationId
Deferred / down-scoped:
  D5 as-any  → production casts only, <50, justify residuals (rest → M2)
```

**Phase 1 DoD:**
- `npm run db:check` shows the 12 added tables; migration `0001` reviewed + applied.
- No table is defined in two conflicting shapes.
- `cohort-ltv-analyzer` and `unified-agent-runner` resolve a Shopify token by `user_id` with no `brand_id` reference remaining.
- A thrown route error reaches Sentry; request logs carry `reqId`, cron logs carry `runId`; recent `cost_ledger` rows carry the id in metadata.
- 3 brands seeded; one pg-layer vitest spec green against the **pooled** URL.
- Production `as any` < 50 with justified residuals.

---

## 11. Out of scope (M2 / Phase 2)

The **635 sync `.prepare()` call-site cutover**, the `DB_BACKEND=sqlite|postgres` adapter, deletion of the runtime `CREATE TABLE` paths and the 5 `new Database()` bypasses, and the full 423-call test-suite port. All tracked in [`../29_05/async_migration_call_site_audit.md`](../29_05/async_migration_call_site_audit.md). Phase 1 deliberately leaves the runtime DDL in place (it's harmless `IF NOT EXISTS`) and changes nothing in the request path beyond the two D2 lines.
