> **Status: ❌ INVALIDATED (2026-05-31)** — its two-shape/JOIN reconciliation premise was wrong; the real fix is a 2-line `brand_id`→`user_id` change (`brands.owner_user_id` never existed). Corrected in `31_05/next_steps.md` §2.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# `shopify_tokens` — Schema Fork Forensic + M1 Reconciliation Plan

**Date:** 2026-05-25
**Status:** **Diagnosed. Patch deferred to M1.** Will be resolved by the Postgres + Drizzle migration; no code change on `analysis-and-cleanup`.
**Affects:** all of `/shopify/*` routes against legacy-shape DBs; the two `brand_id`-keyed readers (`cohort-ltv-analyzer.ts`, `unified-agent-runner.ts`) against canonical-shape DBs.
**Reason for deferral:** the original Tier 1 plan thought this was a 30-min `ALTER TABLE` to add one column. It is in fact two divergent table definitions with different primary keys. Fixing it surgically is a 1-2 hour reconciliation that doesn't belong in a "bug fixes" PR. Production data was sacrificed (see [`railway_data_at_risk.md`](railway_data_at_risk.md)) so a cold-start canonical schema is the cleanest path.

---

## 1. TL;DR

There are two `shopify_tokens` table shapes in active use across this codebase. They have different primary keys, different columns, and different parent-table references. They cannot both be the right schema. Code paths query each shape, so any given DB environment will produce 500s in some route or other depending on which shape that DB happens to have.

| Shape | Source | Used by | Lives in |
|---|---|---|---|
| **Canonical (`user_id`-keyed)** | `src/db/schema.ts:408-414` | `routes/shopify.ts`, `services/shopify-client.ts`, `services/ad-watchdog.ts`, `audit/index.ts` | Fresh DBs only |
| **Legacy (`brand_id`-keyed)** | A migration script (historical, in git history, not currently executed at boot) | `services/cohort-ltv-analyzer.ts:184`, `services/unified-agent-runner.ts:178` | Existing pre-fork DBs (incl. current local dev) |

Fix: M1 (PG + Drizzle) builds the canonical shape from scratch. The two `brand_id`-keyed readers must be patched in M1 to the canonical shape, or their callers temporarily disabled until follow-up work.

---

## 2. The fork — schema comparison

### Canonical shape (`db/schema.ts:408`)

```sql
CREATE TABLE IF NOT EXISTS shopify_tokens (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token TEXT NOT NULL,
  shop_domain TEXT NOT NULL,
  shop_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Legacy shape (verified in local dev DB via `PRAGMA table_info`)

```sql
CREATE TABLE shopify_tokens (
  brand_id TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  shop_domain TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  scope TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Diff

| Aspect | Canonical | Legacy |
|---|---|---|
| Primary key | `user_id` | `brand_id` |
| Parent table | `users(id)` | `brands(id)` |
| `shop_name` column | yes | no |
| `scope` column | no | yes |
| `shop_domain` | yes | yes (same) |
| `encrypted_access_token` | yes | yes (same) |
| `created_at` | yes | yes (same) |

It's not just "missing one column" — it's a fundamentally different join graph. Canonical joins `shopify_tokens → users`. Legacy joins `shopify_tokens → brands`. The semantic question is: "does a Shopify connection belong to a user or to a brand?"

---

## 3. How the fork was discovered

Timeline on 2026-05-24 evening:

1. Plan called for Commit 4 to patch a "missing `shop_name`" column on existing DBs.
2. Probed local dev DB with `better-sqlite3` Node REPL — expected to find `shop_name` missing on an otherwise-canonical table.
3. Instead found a wildly different table — `brand_id` PK, `scope` column, no `shop_name`, no `user_id`.
4. Grepped source for `CREATE TABLE.*shopify_tokens` — only one result in current source (`db/schema.ts`).
5. Grepped git history with `git log --all --oneline -p --diff-filter=A -- '*shopify*'` — found the legacy migration script in an earlier commit; it created the `brand_id`-keyed version.
6. Grepped source for `shopify_tokens` usages — found two callers (`cohort-ltv-analyzer.ts:184`, `unified-agent-runner.ts:178`) still using `WHERE brand_id = ?`; everyone else uses `WHERE user_id = ?`.

Reproduction:

```bash
$ cd server
$ node -e "const db = require('better-sqlite3')('./data/cosmisk.db', { readonly: true });
  console.log(db.prepare(\"PRAGMA table_info('shopify_tokens')\").all());"
# Returns the legacy shape — brand_id PK, scope, no shop_name.
```

---

## 4. Why the fork exists

Sequence of events (reconstructed from git log):

1. Long ago, a migration script in repo created `shopify_tokens` with `brand_id` PK. That script was run against the local dev DB and (probably) the deployed Railway DB. Both got the legacy shape.
2. Some time later, `db/schema.ts` added a `CREATE TABLE IF NOT EXISTS shopify_tokens (...)` block declaring the canonical (`user_id`-keyed) shape.
3. Because the table already existed, `IF NOT EXISTS` was a no-op — neither dev nor prod DBs got the new shape.
4. Newer code (routes/shopify.ts, services/shopify-client.ts, etc.) was written against the canonical shape. Older code (cohort-ltv-analyzer.ts, unified-agent-runner.ts) was written against the legacy shape. Both groups compile fine because SQLite is dynamically typed and the column-name errors only surface at query time.
5. The two readers continued to coexist in the codebase, each working in environments that happen to have its preferred shape. Neither tripped a test because tests run against fresh DBs (canonical shape) and the legacy-keyed readers aren't covered by tests that actually exercise the query.

No single person made a "wrong" choice — it's accreted drift across many commits, hidden by `IF NOT EXISTS` and dynamic typing.

---

## 5. Local dev DB state (verified)

As of 2026-05-25:

```
$ ls -la server/data/cosmisk.db
-rw-r--r--  778240 May 23 21:32 server/data/cosmisk.db

$ node -e "...PRAGMA table_info('shopify_tokens')..."
[
  { cid: 0, name: 'brand_id',              type: 'TEXT', pk: 1 },
  { cid: 1, name: 'shop_domain',           type: 'TEXT', pk: 0 },
  { cid: 2, name: 'encrypted_access_token', type: 'TEXT', pk: 0 },
  { cid: 3, name: 'scope',                 type: 'TEXT', pk: 0 },
  { cid: 4, name: 'created_at',            type: 'TEXT', pk: 0 }
]

$ node -e "...SELECT COUNT(*) FROM shopify_tokens..."
0
```

**Row count is 0.** Local dev DB has the legacy shape but no rows. We could drop and recreate without losing anything, and tests already do this implicitly by running against fresh DBs. Local dev is therefore not a critical path for the M1 reconciliation.

---

## 6. Production DB state (assumed, not verified)

Per [`railway_data_at_risk.md`](railway_data_at_risk.md):

- Old Railway deployment used a persistent volume.
- Volume held `cosmisk.db` (SQLite).
- We are **not** retrieving that file — all data was test/mock.
- New Railway account starts cold.

Almost certainly the Railway DB also had the legacy shape (same migration history), but we will not confirm and don't need to. The fix is to cold-start.

---

## 7. Code paths that query each shape

| File | Line | Query | Shape used |
|---|---|---|---|
| `routes/shopify.ts` | 168 | `INSERT INTO shopify_tokens (user_id, encrypted_access_token, shop_domain, shop_name) VALUES (...) ON CONFLICT(user_id) DO UPDATE SET ...` | Canonical |
| `routes/shopify.ts` | 191 | `SELECT shop_domain, shop_name, created_at FROM shopify_tokens WHERE user_id = ?` | Canonical |
| `routes/shopify.ts` | 220 | `DELETE FROM shopify_tokens WHERE user_id = ?` | Canonical |
| `services/shopify-client.ts` | 615 | `SELECT * FROM shopify_tokens WHERE user_id = ?` | Canonical |
| `services/shopify-client.ts` | 628 | `SELECT user_id FROM shopify_tokens WHERE user_id = ?` | Canonical |
| `services/ad-watchdog.ts` | 584 | `SELECT * FROM shopify_tokens WHERE user_id = ?` | Canonical |
| `audit/index.ts` | 381 | `SELECT encrypted_access_token FROM shopify_tokens` (no WHERE clause — works either way) | Shape-agnostic |
| **`services/cohort-ltv-analyzer.ts`** | **184** | **`SELECT shop_domain, encrypted_access_token FROM shopify_tokens WHERE brand_id = ?`** | **Legacy** |
| **`services/unified-agent-runner.ts`** | **178** | **`SELECT * FROM shopify_tokens WHERE brand_id = ?`** | **Legacy** |

**Six canonical readers / writers + two legacy readers + one shape-agnostic reader.** The canonical side is the majority and matches the canonical schema in `db/schema.ts` — that's the side we keep.

---

## 8. Why Commit 4 was dropped from this PR

The original Tier 1 plan (`24_05/next_steps.md`) framed Commit 4 as:

> "Generalise the `ensureUsersColumn` helper at `server/src/index.ts:335` into `ensureColumn(table, column, def)` and add the missing column."

That fix would have added `shop_name TEXT` to whichever shape the DB currently has. Against a legacy-shape DB, this still leaves:

- The PK column wrong (`brand_id` vs. expected `user_id`) — INSERTs in `routes/shopify.ts:168` still fail.
- The lookup column wrong — SELECTs in `routes/shopify.ts:191` still fail.
- A residual `scope` column that the canonical schema doesn't declare (harmless).

So the original plan does not actually fix the 500. It would be a true no-op against the legacy-shape DB (which is what production had).

Three options were considered (full analysis in chat with Sanskar on 2026-05-25):

- **A. Reconcile in-place via on-boot migration.** Rename legacy → `shopify_tokens_legacy`, recreate canonical, leave migration of `brand_id → user_id` rows for follow-up. ~1-2 hours, mid-risk, expands PR scope.
- **B. Defer entirely, document, ship the rest.** No code change in this PR; M1 picks it up. ~10 min of doc-writing.
- **C. Ship the original ensureColumn anyway, as a no-op.** ~15 min, fixes nothing, misleading commit message.

Chose **B**. Reasons:

1. PR is supposed to be "build unblock + close two production bugs" — quietly adding a schema reconciliation changes its character.
2. No production data → no live 500 → no time pressure.
3. M1 is 1-4 days away and will reconcile this cleanly with proper migrations.
4. The two `brand_id`-keyed readers (`cohort-ltv-analyzer.ts`, `unified-agent-runner.ts`) need code changes too, which compound the reconciliation. Better to do it once, in M1, with all context loaded.

---

## 9. M1 reconciliation plan

When M1 starts (next branch off post-merge `main`, likely 2026-05-26):

### 9.1 — Schema (Drizzle table builder)

```typescript
// server/src/db/drizzle/schema.ts (new file in M1)
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users';

export const shopifyTokens = pgTable('shopify_tokens', {
  userId:                text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  encryptedAccessToken:  text('encrypted_access_token').notNull(),
  shopDomain:            text('shop_domain').notNull(),
  shopName:              text('shop_name'),
  createdAt:             timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
```

Note: drop the legacy `scope` column. Nothing in the canonical-side codebase reads it; the two legacy-side readers (`cohort-ltv-analyzer.ts`, `unified-agent-runner.ts`) only select `shop_domain` and `encrypted_access_token`, not `scope`. If we ever need scope, it's recoverable from a Shopify API call.

### 9.2 — Patch the two `brand_id` readers

**`services/cohort-ltv-analyzer.ts:184`** — currently:

```typescript
db.prepare(
  'SELECT shop_domain, encrypted_access_token FROM shopify_tokens WHERE brand_id = ?'
).get(brandId)
```

After M1 patch:

```typescript
// brand → user owner → shopify_token
db.prepare(`
  SELECT st.shop_domain, st.encrypted_access_token
  FROM shopify_tokens st
  JOIN brands b ON b.owner_user_id = st.user_id
  WHERE b.id = ?
`).get(brandId)
```

(or equivalent in Drizzle query syntax after migration). Assumes `brands` has an `owner_user_id` column linking to `users.id` — verify before writing the JOIN.

**`services/unified-agent-runner.ts:178`** — same fix; same JOIN. The query is `SELECT * FROM shopify_tokens WHERE brand_id = ?` — the same canonical-via-JOIN pattern.

### 9.3 — Drop the legacy migration script

If the legacy-shape `CREATE TABLE shopify_tokens (brand_id ...)` is still in any executed code path (it isn't currently — the script that created it is in git history but not in the boot sequence), delete it.

### 9.4 — Verification

After M1:

- [ ] `npm test` — all green against PG.
- [ ] Boot server with empty PG → Drizzle migrations run → 71 tables created.
- [ ] `psql ... -c '\d shopify_tokens'` → confirms `user_id` PK, no `brand_id`, no `scope`.
- [ ] Smoke test: POST a fake Shopify OAuth callback → row appears in `shopify_tokens` keyed by `user_id`.
- [ ] Smoke test: invoke `unified-agent-runner` with a valid brand → it successfully joins to a shopify_token via the new query.
- [ ] Smoke test: invoke `cohort-ltv-analyzer` for the same brand → same successful join.

### 9.5 — Open question for M1

**Does `brands.owner_user_id` exist?** Need to verify when M1 starts. If brands has a different column name (`user_id`, `created_by`, etc.) the JOIN clause changes. If brands has no owner reference at all (unlikely), the JOIN is impossible and we have to introduce one — at which point the legacy `brand_id`-keyed readers tell us something genuinely important: there might be brands without users, or many-users-per-brand cases that the canonical shape doesn't capture.

A 10-minute review of the `brands` table schema at M1 start will settle this.

---

## 10. Related docs

- [`railway_data_at_risk.md`](railway_data_at_risk.md) — why production data sacrifice is acceptable; M1 starts cold.
- [`next_steps.md`](next_steps.md) — Tier 1 renumbered; M1 expanded.
- [`../24_05/next_steps.md`](../24_05/next_steps.md) — predecessor plan (Tier 1.5a section).
- [`../24_05/session_log.md`](../24_05/session_log.md) — diagnostic timeline from 2026-05-24 evening.

---

## 11. Single-line summary for `/compact`

> `shopify_tokens` has two coexisting shapes: canonical `user_id`-keyed (6 readers/writers) and legacy `brand_id`-keyed (2 readers). Local dev DB has legacy shape. Production DB sacrificed. M1 builds canonical from scratch in Drizzle + patches the two `brand_id`-keyed readers to JOIN through `brands` to canonical `user_id`.
