# M1 — Postgres/Drizzle Stand-Up + Neon Connectivity Fix

**Date:** 2026-05-31
**Branch:** `db-migration`
**Status:** ✅ M1 COMPLETE. Schema applied to Neon (70 tables); both endpoints connect by hostname. SQLite remains live and untouched.
**Purpose:** Record what was built and the connectivity root-cause/fix, so M2 (the call-site cutover) starts from a known-good base.
**Predecessors:** [`../29_05/async_migration_call_site_audit.md`](../29_05/async_migration_call_site_audit.md) · [`../26_05/database_state.md`](../26_05/database_state.md) · [`../26_05/hidden_ai_tables_schema.md`](../26_05/hidden_ai_tables_schema.md)

---

## 1. TL;DR

- Stood up the Postgres/Drizzle layer **additively** — `getDb()`/better-sqlite3 path is unchanged and still live. Nothing in the request path imports the new pg layer yet.
- **70 tables** (60 canonical + 10 locked AI tables) ported to Drizzle, generated as migration `0000`, and **applied to Neon** (verified: 70 public tables on both pooled + direct endpoints; round-trip through array/jsonb/uuid OK).
- Hit a hard blocker: Neon connections failed by hostname with intermittent `AggregateError [ETIMEDOUT]`. **Root cause was Node 20 "Happy Eyeballs," not a firewall.** Fixed with two DNS/socket settings applied before any connection.
- Five incremental commits on `db-migration`: `c76a841`, `b5686ab`, `7b62737`, `953bd8e`, `bef992b`.

---

## 2. What was built (M1 scope)

Strangler/additive approach — new files beside the old, so the app keeps booting on SQLite the whole time.

| File | Role |
|---|---|
| `server/drizzle.config.ts` | drizzle-kit config; uses **`MIGRATION_DATABASE_URL`** (direct/unpooled) |
| `server/src/db/pg-schema.ts` | 60 canonical tables (ported from `schema.ts` `createTables`) + 10 locked AI tables |
| `server/src/db/pg.ts` | pooled `pg.Pool` (**`DATABASE_URL`**, PgBouncer) + Drizzle `pgDb` |
| `server/drizzle/0000_*.sql` | generated migration (70 `CREATE TABLE`) |
| deps | `drizzle-orm`, `pg` (runtime); `drizzle-kit`, `@types/pg` (dev) |

**Porting rules applied:**
- `created_at`/`updated_at` and the `*_at`/`date` family → `timestamp({ mode: 'string', withTimezone: true })` so Drizzle returns ISO strings to Node (avoids rewriting date parsing).
- JSON-bearing `TEXT` columns stay `text()` — the app does `JSON.parse` on them. Only the 10 AI tables use `jsonb` (no legacy readers).
- `0/1` boolean flags stay `integer()` to preserve the app's `=== 1` checks.
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `serial()`; composite PKs and partial indexes carried over; per-table-prefixed index names (SQLite reused names that collide under Postgres).

---

## 3. Connectivity blocker — root cause & fix

### Symptom
App pool and `drizzle-kit migrate` could not connect to Neon **by hostname** — intermittent `AggregateError [ETIMEDOUT]` from Node's `internalConnectMultiple`. Raw IPv4-address connects worked; hostname connects did not.

### Correction to an earlier wrong diagnosis
An earlier claim that "outbound port 5432 is firewall-blocked" was **false** — it rested on a bogus control test (`TCP 1.1.1.1:5432`, which always times out because Cloudflare runs no Postgres). A correct probe to Neon's real IPv4 showed 5432 was reachable all along.

### Root cause (proven empirically)
```
TCP4 44.236.37.42:5432            -> OPEN 287ms      (Neon IPv4 reachable)
TLS by hostname:5432              -> ETIMEDOUT        (hostname path fails)
ipv4first ONLY                   -> FAIL ETIMEDOUT    (prior incomplete fix)
ipv4first + autoSelectFamily=off -> OK  ~2s           (BOTH endpoints connect)
```
**Node 20 "Happy Eyeballs."** `net.autoSelectFamily` (default ON since Node 20) races IPv4 vs IPv6 with a **250 ms per-attempt timeout**. Neon's IPv4 TLS handshake takes **~287 ms (> 250 ms)**, so Node abandons the *working* IPv4 attempt, races in IPv6, and IPv6 is unreachable on WSL2 (`ENETUNREACH`) → the intermittent timeout. `dns.setDefaultResultOrder('ipv4first')` only reorders DNS; it does **not** stop the race.

### Fix (commit `bef992b`)
Applied before any connection, in `server/src/db/net-config.ts` (imported first by app/migrations/scripts) and mirrored in `drizzle.config.ts`:
```ts
dns.setDefaultResultOrder('ipv4first');
if (typeof net.setDefaultAutoSelectFamily === 'function') {
  net.setDefaultAutoSelectFamily(false);
}
```
- `typeof` guard → no-op on Node <19.4.
- **TLS untouched:** `sslmode=require` preserved; no `rejectUnauthorized:false`.
- Cross-platform: only changes connect ordering/race; IPv6-healthy hosts unaffected.

### Supporting changes
- `server/src/db/load-env.ts` — strips empty `DATABASE_URL`/`MIGRATION_DATABASE_URL` before `dotenv.config()` so `.env` is authoritative (dotenv won't overwrite an already-present, even empty, var → a stray empty shell export was silently shadowing the real value).
- `server/src/db/check-connection.ts` + `package.json` scripts: `npm run db:check`, `db:migrate`, `db:generate`.

---

## 4. Verification (all green, from the sandbox)

| Step | Result |
|---|---|
| `npm run db:check` (pre-migrate) | ✓ both endpoints connect — 0 tables |
| `npm run db:migrate` | `[✓] migrations applied successfully!` (exit 0) |
| `npm run db:check` (post-migrate) | ✓ pooled + direct — **70 public tables** |
| Rolled-back round-trip (direct URL) | array `["a","b"]` ✓ · jsonb `42` ✓ · uuid valid ✓ · rollback clean (0 leftover) ✓ |
| `tsc --noEmit -p tsconfig.json` | 1 error — pre-existing `stripe` decl in `billing.ts`; none in db files |

> **Note (not a defect):** the raw-`pg` round-trip returns `created_at` as a JS `Date`, not a string. `mode:'string'` is a **Drizzle-layer** parser setting — the ISO-string guarantee applies to queries through `pgDb` (Drizzle), not raw pool queries.

---

## 5. Env / data facts

- Both `DATABASE_URL` (pooled) and `MIGRATION_DATABASE_URL` (direct) live in repo-root `./.env` and are mirrored into `server/.env` (drizzle-kit/app load `.env` from `server/`). Neon host: `ep-little-rain-akekou1s` (us-west-2).
- Live SQLite held **no production data** — only seed/test rows (3 users, 3 brands, 1 activity_log; all 10 AI tables absent). Clean Neon start was safe; no ETL performed. At most, re-seed the 3 brands later.

---

## 6. Commits

| Hash | Summary |
|---|---|
| `c76a841` | docs: audit async cutover surface (635 call sites) + verification plan |
| `b5686ab` | build: drizzle-orm/pg/drizzle-kit deps + drizzle.config (direct URL) |
| `7b62737` | feat: Postgres/Drizzle schema (60 canonical + 10 AI) + pooled pg client |
| `953bd8e` | chore: generate initial migration 0000 (70 tables) |
| `bef992b` | fix: connect to Neon by hostname — disable Happy Eyeballs family race |

---

## 7. Outstanding — deferred to M2 (the cutover)

Connectivity and schema are done; the application logic is **not** migrated yet.

- **~635 sync `.prepare()` call sites** (routes 300 / services 291 / audit 11 / index 25) must convert better-sqlite3 (sync) → Drizzle/pg (async). Strategy: async SQL adapter + `DB_BACKEND=sqlite|postgres` flag, file-by-file behind the existing vitest suite. Full plan in [`../29_05/async_migration_call_site_audit.md`](../29_05/async_migration_call_site_audit.md).
- **5 files** open their own `new Database()` (bypass `getDb()`); **6 services** create tables at runtime — both need handling.
- **Orphan/runtime tables NOT yet in `pg-schema.ts`:** `brands`, `brand_context`, `audits`, `scheduled_audits`, `client_contexts`, `strategic_*`. The app reads them — reverse-engineer from service-init code **before** M2.
- **423 test call sites** need a Postgres test target (Neon test branch, local Postgres, or `pg-mem`).
- Retire `getDb()`, `schema.ts`, `index.ts`, and `better-sqlite3` only once every call site is green and the flag has defaulted to `postgres` for 1–2 commits.
