> **Status: 🔵 ACTIVE (2026-05-31)** — source of truth for the 635-call-site cutover (terminology: this doc's "M2" = canonical **DB-2**).
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Async Migration — Call-Site Audit (sync better-sqlite3 → async Drizzle/pg)

**Date:** 2026-05-29
**Branch:** `db-migration`
**Status:** M1 planning. SQLite remains the live DB. This report scopes the **M2 cutover** — the rewrite of every synchronous DB call site to async Postgres.
**Purpose:** Quantify and characterise the full surface that must change when the app moves off better-sqlite3's synchronous API onto Drizzle + `node-postgres` (async). Establishes the migration strategy and the verification approach that lets the new Postgres schema be validated **while SQLite stays live**.
**Predecessor:** [`../26_05/database_state.md`](../26_05/database_state.md) (current wiring), [`../26_05/hidden_ai_tables_schema.md`](../26_05/hidden_ai_tables_schema.md) (the 10 AI tables).

> Counts reflect the working tree on `db-migration`. "Call site" = one `.prepare(...)` occurrence. Production = excludes `src/__tests__/`.

---

## 1. TL;DR

- **The headline "300" undercounts by ~2×.** 300 is the `routes/` figure alone. The full production surface is **635 `.prepare()` call sites across 69 files**, plus **423 more in the test suite**.
- **`services/` is the harder half:** 291 calls / 35 files. Service functions are called by route handlers *and* by cron jobs *and* by other services — so async "colour" propagates further there than in routes.
- **Fastify route handlers are already async-capable** — this is what bounds the blast radius. For most of the 300 route calls, awaiting terminates at the handler. The deeper risk is the service call-graph.
- **5 files open their own `new Database()`**, bypassing `getDb()` — they must be re-pointed, not just adapted.
- **6 service files create tables at runtime** (DDL outside `schema.ts`) — these "lazy create" paths have no equivalent under a migration-managed Postgres schema and must be removed/replaced.
- **Dialect translation is real but bounded:** `datetime('now')` appears in **30 files**, `INSERT OR REPLACE`/`OR IGNORE` in 6, `json_extract` in 3, `AUTOINCREMENT` in 2.
- **Recommended strategy:** strangler-pattern via an **async SQL adapter** (mechanical, low-risk per site) migrated **file-by-file behind the existing vitest suite**, gated by a `DB_BACKEND` flag for instant rollback. Idiomatic Drizzle rewrite is a later, optional pass.

---

## 2. The core problem

better-sqlite3 is **synchronous**:

```ts
const u = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);  // value, immediately
```

Drizzle + `node-postgres` is **asynchronous**:

```ts
const u = (await db.select().from(users).where(eq(users.id, id)))[0];   // Promise
```

Every converted call gains two properties:

1. **Query-shape change** — raw SQL + `.get()/.all()/.run()` → either Drizzle query-builder or `db.execute(sql\`...\`)`.
2. **Async colour propagation** — the call returns a Promise → its function becomes `async` → its callers must `await` → up the call tree.

The propagation is **bounded** because the two main entry layers already tolerate async: Fastify route handlers may return Promises, and the cron/boot paths are already async-capable. The cost concentrates in **shared service functions** that are currently synchronous and called from many places.

---

## 3. Surface inventory

### 3.1 Totals

| Scope | `.prepare()` calls | Files |
|---|---:|---:|
| `src/routes/` | 300 | 30 |
| `src/services/` | 291 | 35 |
| `src/audit/` | 11 | 1 |
| `src/db/` | 8 | 2 |
| `src/index.ts` | 25 | 1 |
| **Production total** | **635** | **69** |
| `src/__tests__/` | 423 | 36 test files |
| Files importing `getDb`/`closeDb` (non-test) | — | **69** |

### 3.2 Routes — top files (30 files / 300 calls)

| File | calls | | File | calls |
|---|---:|---|---|---:|
| `routes/creative-engine.ts` | 65 | | `routes/dashboard.ts` | 11 |
| `routes/billing.ts` | 39 | | `routes/reports.ts` | 9 |
| `routes/content.ts` | 23 | | `routes/campaigns.ts` | 9 |
| `routes/agent.ts` | 19 | | `routes/automations.ts` | 9 |
| `routes/team.ts` | 18 | | `routes/ugc.ts` | 6 |
| `routes/ugc-workflows.ts` | 17 | | `routes/autopilot.ts` | 6 |
| `routes/creative-studio.ts` | 17 | | `routes/audits.ts` | 4 |
| `routes/auth.ts` | 16 | | `routes/ad-accounts.ts` | 4 |

Remaining (≤3 each): `tiktok-ads`, `swipe-file`, `shopify`, `memory`, `ai`, `ad-command`, `client-portal`, `brands`, `google-ads`, `director`, `competitor-spy`, `brain`, `assets`, `analytics`.

### 3.3 Services — top files (35 files / 291 calls)

| File | calls | | File | calls |
|---|---:|---|---|---:|
| `services/service-clients.ts` | 27 | | `services/morning-briefing.ts` | 9 |
| `services/job-queue.ts` | 23 | | `services/content-agent.ts` | 9 |
| `services/intelligence-persistence.ts` | 23 | | `services/creative-strategist.ts` | 8 |
| `services/ad-watchdog.ts` | 19 | | `services/creative-scorer.ts` | 7 |
| `services/strategic-memory.ts` | 16 | | `services/unified-agent-runner.ts` | 5 |
| `services/sales-agent.ts` | 16 | | `services/creative-intelligence.ts` | 5 |
| `services/recommendation-loop.ts` | 13 | | `services/client-context.ts` | 5 |
| `services/learning-engine.ts` | 13 | | `services/agent-orchestrator.ts` | 5 |
| `services/intelligence-infrastructure.ts` | 13 | | `services/memory-maintenance.ts` | 4 |
| `services/agent-memory.ts` | 13 | | `services/llm-gateway.ts` | 4 |
| `services/audit-scheduler.ts` | 10 | | `services/automation-engine.ts` | 4 |
| `services/report-agent.ts` | 9 | | (+13 files with ≤3 each) | |
| `services/pattern-transfer.ts` | 9 | | | |

---

## 4. Special hazards (not just count — shape)

### 4.1 Connection bypass — 5 files open `new Database()` directly
`services/audit-scheduler.ts`, `services/client-context.ts`, `services/strategic-memory.ts`, `audit/index.ts`, plus `db/index.ts` itself.
→ These don't go through `getDb()`, so a connection-layer swap **misses them**. Each needs to be re-pointed at the shared pg pool. (Consistent with the "4 services bypass `getDb()`" note in `26_05/database_state.md`.)

### 4.2 Runtime DDL — 6 service files `CREATE TABLE` on first use
`audit-scheduler.ts`, `ad-watchdog.ts`, `client-context.ts`, `pattern-transfer.ts`, `strategic-memory.ts`, `agent-orchestrator.ts`.
→ Lazy table creation has **no place** under a migration-managed Postgres schema. These tables must be declared in the Drizzle schema and the runtime `CREATE TABLE` paths deleted. (These are the source of the "tables created outside `schema.ts`" drift.)

### 4.3 SQLite SQL idioms requiring dialect translation

| Idiom | Files | Postgres equivalent |
|---|---:|---|
| `datetime('now')` | 30 | `now()` / `CURRENT_TIMESTAMP` |
| `INSERT OR REPLACE` | 5 | `INSERT … ON CONFLICT … DO UPDATE` |
| `ON CONFLICT …` (sqlite form) | 8 | mostly compatible; verify target syntax |
| `json_extract(col, '$.x')` | 3 | `col->>'x'` (jsonb) |
| `AUTOINCREMENT` | 2 | `generated always as identity` / `serial` |
| `INSERT OR IGNORE` | 1 | `ON CONFLICT DO NOTHING` |
| `?` positional placeholders | ~all | `$1, $2, …` |
| `0/1` booleans | many | keep as `integer`, or convert to `boolean` deliberately |

> `strftime` and explicit `RETURNING` were not found — two fewer translation classes to worry about.

---

## 5. Recommended migration strategy (M2)

**Pattern: strangler-fig via an async SQL adapter.** Lower risk than a 635-site idiomatic rewrite, and keeps the app bootable throughout.

1. **Async adapter** mirroring today's call shape — `await q.get(sql, params)` / `q.all` / `q.run` — backed by the pg pool, with a **dialect shim** for §4.3 (placeholder rewrite, upsert translation, `datetime('now')`, json operators). Turns each site into a near-mechanical edit, not a redesign.
2. **`DB_BACKEND=sqlite|postgres` flag** behind the adapter → instant per-environment rollback. *This* is the real safety net (far stronger than "keep the `.db` file").
3. **Pilot one low-risk route** end-to-end (e.g. `auth` login / `dashboard` read) with its existing test green — surfaces dialect gotchas early.
4. **Migrate file-by-file**, one commit each, **running `vitest` after every batch**. Order: independent leaf routes → shared services → the 5 bypass files (§4.1) → cron/boot. Delete runtime DDL (§4.2) as each owning service is converted.
5. **Make the test suite run on Postgres.** The 36 test files / 423 calls currently target SQLite; without a pg test target (Neon test branch, local Postgres, or `pg-mem`) we'd migrate 635 sites blind. **Prerequisite, not afterthought.**
6. **Retire** `getDb()`, the old `index.ts`/`schema.ts`, and `better-sqlite3` only once every site is green and the flag has defaulted to `postgres` for ≥1–2 commits.
7. **M3 (optional):** opportunistically convert hot paths from adapter-raw-SQL to type-safe Drizzle query-builder calls.

---

## 6. Verification — proving the pg schema works WHILE SQLite stays live

The M1 Drizzle/pg layer is **additive** (new files `db/pg-schema.ts`, `db/pg.ts`); nothing in the running request path imports it yet, so the live app keeps booting on SQLite. We validate the new schema **out-of-band**:

1. **Migration applies cleanly** — `drizzle-kit generate` produces SQL we review; `drizzle-kit migrate` against Neon exits 0. (Uses `MIGRATION_DATABASE_URL`, the direct/unpooled URL.)
2. **Standalone connectivity script** (read-only, run manually — not wired into boot): connect via the pg pool, `SELECT 1`, then list `information_schema.tables` to confirm all expected tables exist.
3. **Schema-parity check** — compare table+column inventory between the live SQLite DB (source of truth, dumped read-only) and the freshly migrated Postgres, and diff. Catches port mistakes before any code depends on them.
4. **Round-trip smoke in a rolled-back transaction** — `BEGIN; INSERT … ; SELECT … ; ROLLBACK;` against one or two representative tables (incl. a `jsonb` and a `text[]` column from the 10 AI tables) to confirm types/defaults behave. Rollback leaves Neon clean.
5. **Dedicated vitest spec for the pg layer** — exercises the adapter + a few Drizzle queries against the pg test target, runnable independently of the SQLite suite.

None of steps 1–5 touch `getDb()` or the live SQLite path, so the application continues to serve from SQLite unchanged while we gain confidence in Postgres.

---

## 7. Open prerequisites / flags

- **Env wiring mismatch:** `DATABASE_URL` + `MIGRATION_DATABASE_URL` are populated in the **repo-root `./.env`**, but `server/.env` (what `dotenv.config()` loads when drizzle-kit/the app run from `server/`) has `DATABASE_URL` empty and no `MIGRATION_DATABASE_URL`. M1 must point the Drizzle config + pg client at the root `.env` explicitly, or the keys must be mirrored into `server/.env`. Otherwise `drizzle-kit migrate` reads `undefined`.
- **Pooled vs direct:** app uses `DATABASE_URL` (PgBouncer pooled); drizzle-kit uses `MIGRATION_DATABASE_URL` (direct). Watch for prepared-statement issues on the pooled endpoint with `node-postgres`.
- **Test target for Postgres** must be decided before M2 (see §5.5).
- **No production data to migrate** — the live SQLite DB holds only seed/test rows (3 users, 3 brands, 1 activity_log; all 10 AI tables absent). A clean Neon start is safe; at most re-seed the 3 brands. See [`../26_05/database_state.md`](../26_05/database_state.md).
