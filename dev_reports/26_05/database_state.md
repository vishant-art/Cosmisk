> **Status: 📖 REFERENCE (2026-05-31)** — accurate pre-M1 DB snapshot (wiring, drift, forks) that fed DB-1 stand-up.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Database — Current State, System Requirements, Prior Strategy

**Date:** 2026-05-26
**Branch:** `analysis-and-cleanup` (post-PR #1 merge to `main`)
**Status:** Pre-M1. SQLite remains the live DB; Postgres + Drizzle migration is the next sprint.
**Purpose:** Single source of truth for M1 planning. Documents (a) how the DB is wired today, (b) every drift and known fork, (c) what the system genuinely requires from a DB, and (d) the strategy decisions made in 24_05 and 25_05 that constrain M1.

> All `:line` references reflect the working tree at HEAD `93e516d`. Tables marked **canonical** are declared in `server/src/db/schema.ts`. Tables marked **orphan** exist in the live local DB but have no creator in current source — they were added by a historical migration script that no longer runs at boot.

---

## 1. TL;DR

- One process, one SQLite file (`./data/cosmisk.db`), single global connection in `db/index.ts:54`. WAL + foreign keys ON. `mkdir -p` hardened on `c4c4536`.
- **60 canonical tables** declared in `schema.ts`; **64 user tables** present in the local DB. The 4-table delta is **orphan drift** (`audits`, `brands`, `brand_context`, `scheduled_audits`) — pre-existing rows persist locally but a fresh deployment will not create them.
- **5 tables created at runtime outside `schema.ts`** by service-init functions: `scheduled_audits`, `client_contexts`, `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions`. Boot order matters: their creators only run when the owning service is first invoked.
- **One known schema fork:** `shopify_tokens` has two coexisting shapes (canonical `user_id`-keyed vs. legacy `brand_id`-keyed). 6 readers/writers use canonical, 2 use legacy. Forensic in [`../25_05/shopify_tokens_fork.md`](../25_05/shopify_tokens_fork.md).
- **One in-place migration helper** (`ensureColumn` in `schema.ts:6-16`) called for ~15 columns on boot. One ad-hoc `ALTER TABLE` in `agent-orchestrator.ts:525`.
- **4 services bypass `getDb()`** and open their own `new Database()` connection.
- `DATABASE_URL` is declared in config but has zero plumbing. No `pg`/`drizzle` imports anywhere yet.
- Production data was **deliberately sacrificed** (see [`../25_05/railway_data_at_risk.md`](../25_05/railway_data_at_risk.md)). New Railway environment is a cold start. Today's redeploy on Railway succeeded after `NODE_ENV=production` was set; data dir is empty.

---

## 2. How the DB is built today

### 2.1 Driver, file, open path

- Driver: `better-sqlite3` (synchronous, native).
- Path: `config.databasePath` → `env.DATABASE_PATH || './data/cosmisk.db'` (`server/src/config.ts:11`).
- Open: `getDb()` at `server/src/db/index.ts:54`.
  - Idempotent — caches a module-level singleton.
  - On first call: `mkdirSync(dirname(path), { recursive: true })`, opens DB, sets `pragma journal_mode = WAL`, sets `pragma foreign_keys = ON`, calls `createTables(db)` (schema.ts), calls `seedReviewerAccount(db)`.

No other pragmas (`busy_timeout`, `synchronous`, `cache_size`, `page_size`) are configured. Concurrency relies entirely on WAL.

### 2.2 Auto-seeding on boot

`seedReviewerAccount()` at `db/index.ts:11-52` runs on every `getDb()` first-call. Idempotent. Inserts a `reviewer@cosmisk.com` user (bcrypt'd password `MetaReview2026!`) and copies a Meta token from any admin user so the Meta App Review reviewer sees real ad data. This means **every cold-start ships with a known credential** — needs to be flagged for M1 and for any prod-hardening pass.

### 2.3 Migration model

There is no proper migration tool. Three patterns coexist:

| Pattern | Where | Notes |
|---|---|---|
| `CREATE TABLE IF NOT EXISTS …` in `schema.ts` | 60 tables | Idempotent. Runs on every boot. |
| `ensureColumn(db, table, col, def)` helper | `schema.ts:6-16`, called for 15 columns at `schema.ts:468-489` | Reads `PRAGMA table_info`, conditionally `ALTER TABLE ADD COLUMN`. |
| One-off `ALTER TABLE` in app code | `agent-orchestrator.ts:525` adds `recommendations.metadata` | Wrapped in try/catch. |
| Runtime `CREATE TABLE IF NOT EXISTS` inside services | see §3.3 | Only runs when the service is first invoked. Risky for boot-order. |

There are **no migration files** (no `migrations/`, `drizzle/`, `prisma/`). Every shape change requires hand-editing `schema.ts` or one of the runtime creators.

### 2.4 Local vs. live DB

```
$ ls -lah server/data/cosmisk.db
-rw-r--r-- 760K May 23 21:32 server/data/cosmisk.db
```

Local DB has 65 SQLite objects (64 user tables + `sqlite_sequence`). Production data is **gone**: previous Railway volume was abandoned with the trial account. Today's deploy on the new account has an empty `./data/`.

---

## 3. Tables — three groups

### 3.1 Canonical (declared in `db/schema.ts`, created on every boot)

60 tables. The full alphabetical list:

```
activity_log, agent_core_memory, agent_decisions, agent_entities, agent_episodes,
agent_recommendations, agent_runs, automations, autopilot_alerts, campaigns,
classified_comments, client_reports, comment_mining_reports, competitor_intel_store,
competitor_movements, competitor_snapshots, content_bank, cost_ledger,
creative_agent_store, creative_assets, creative_briefs, creative_category_knowledge,
creative_evolution, creative_intelligence_context, creative_jobs,
creative_quality_scores, creative_sprints, discount_agent_store, dna_cache,
entity_state_snapshots, google_tokens, intelligence_metrics, intelligence_predictions,
intelligence_recommendations, leads, meta_tokens, oos_agent_store, operator_behavior,
operator_feedback, operator_profiles, password_reset_tokens, prediction_accuracy,
recommendations, reports, score_predictions, service_clients, shopify_tokens,
studio_generations, studio_outputs, subscriptions, swipe_file, team_invitations,
team_members, tiktok_tokens, ugc_concepts, ugc_projects, ugc_scripts,
url_analysis_cache, user_usage, users
```

### 3.2 Runtime-created outside `schema.ts` (created when their service starts)

| Table | Created by | Risk |
|---|---|---|
| `scheduled_audits` | `services/audit-scheduler.ts:137` | Created only if scheduler init runs. If a route reads it before then → "no such table". |
| `client_contexts` | `services/client-context.ts:105` | Same. |
| `strategic_reports` | `services/strategic-memory.ts:158` | Same. |
| `strategic_recommendations` | `services/strategic-memory.ts:172` | Same. |
| `strategic_running_context` | `services/strategic-memory.ts:188` | Same. |
| `strategic_predictions` | `services/strategic-memory.ts:197` | Same. |

Each of these is created the first time its module-level `initXxxTables(db)` is invoked, which happens lazily. Boot order is undocumented. Migration to Drizzle should fold all of them into the canonical schema declarations.

### 3.3 Orphan tables (present in local DB, no creator in source)

These four tables exist in the local SQLite file but have **no `CREATE TABLE` statement anywhere in the current source tree**:

| Table | Live in local DB? | Created in source? | Implication |
|---|---|---|---|
| `audits` | Yes | **No** | Read by `audit/index.ts:414,497,513`. Cold-start will 500 on these queries. |
| `brand_context` | Yes | **No** | Read by `audit/index.ts:349,469,478`. Same. |
| `brands` | Yes | **No** | Read by `audit/index.ts:297,338`, `services/unified-agent-runner.ts:188`. Same. The `shopify_tokens` JOIN-strategy hinges on this table — see §6. |
| `scheduled_audits` | Yes | Lazily, in `audit-scheduler.ts` | Listed here for the historical view; if scheduler init runs at boot, this becomes a §3.2 entry rather than an orphan. |

**These are the artefacts of a historical migration script that ran against the legacy dev/prod DB but is no longer in the boot path.** Same pattern as the `shopify_tokens` fork — `IF NOT EXISTS` no-ops against existing tables masked the drift.

### 3.4 Tables referenced in code that the agent survey flagged but I could not independently confirm

The 25_05 survey listed these as "referenced but not in schema": `creative_analysis`, `creative_returns`, `customer`, `daily_metrics`, `decision_traces`, `evaluation_metrics`, `global_patterns`, `human_reviews`, `ltv_by_creative`, `pattern_store`, `predictions`. I have not independently grepped each one — flagging them as needing verification at M1 start. The lookup is cheap; a 10-min grep at the top of M1 day 1 will close this list.

---

## 4. Drift hotspots

### 4.1 `shopify_tokens` schema fork

Two divergent shapes coexist:

| Shape | PK | Extra cols | Used by |
|---|---|---|---|
| **Canonical** (`schema.ts:408-414`) | `user_id` REFERENCES users(id) | `shop_name` | `routes/shopify.ts:168/191/220`, `services/shopify-client.ts:615/628`, `services/ad-watchdog.ts:584`, `audit/index.ts:381` |
| **Legacy** (historical migration; no longer in source) | `brand_id` REFERENCES brands(id) | `scope` | `services/cohort-ltv-analyzer.ts:184`, `services/unified-agent-runner.ts:178` |

Local dev DB has the legacy shape (row count 0). New Railway env will get canonical (empty). Full forensic: [`../25_05/shopify_tokens_fork.md`](../25_05/shopify_tokens_fork.md).

**M1 fix:** rebuild canonical in Drizzle; patch the two `brand_id`-keyed readers to JOIN through `brands.user_id` (verified 2026-05-26 via `PRAGMA table_info('brands')` — the FK column is `user_id`, not `owner_user_id`; the latter exists only on `team_members`).

### 4.2 Multiple DB connections per process

Four services bypass `getDb()` and open their own `new Database()`:

| File:line | Effect |
|---|---|
| `audit/index.ts:289` | Separate connection (no pragmas applied). |
| `services/client-context.ts:92` | Separate connection; runs `initClientContextTables()` against it. |
| `services/audit-scheduler.ts:32` | Separate connection. |
| `services/strategic-memory.ts:145` | Separate connection; runs `initStrategicMemoryTables()`. |

WAL handles concurrent reads across processes, but **each new connection re-opens the file and bypasses `foreign_keys = ON` if not re-applied**. M1 cleanup: route everything through the canonical `getDb()` (or Drizzle's connection pool equivalent).

### 4.3 In-place ALTER TABLE outside the schema declaration

`agent-orchestrator.ts:525`:

```ts
db.exec(`ALTER TABLE recommendations ADD COLUMN metadata TEXT DEFAULT '{}'`)
```

Wrapped in try/catch (no logging). Anything similar in the future will accumulate as silent boot-time mutations. Tier 3.2 of the next-steps plan calls for a CI grep guard banning `CREATE TABLE` and `ALTER TABLE` outside the Drizzle schema dir.

### 4.4 `as any` over query results

50+ instances across `audit/index.ts`, `creative-intelligence.ts`, `cohort-ltv-analyzer.ts`, `routes/creative-engine.ts`, `unified-agent-runner.ts`, `routes/shopify.ts`, and test helpers. Each `as any` is a place where the row's true shape isn't known to the type system — a candidate for a runtime crash if a column is renamed or removed. Tier 1.5d in the next-steps plan budgets one day to cut the count from 78 to <30.

---

## 5. What the system actually requires from a DB

### 5.1 Auth, users, sessions

- `users` (incl. 11 columns added via `ensureColumn`: `brand_name`, `website_url`, `goals`, `competitors`, `active_brand`, `phone`, `notification_preferences`, `timezone`, `language`, `currency`, `date_format`)
- `password_reset_tokens`
- `team_members`, `team_invitations`
- `user_usage` (incl. `creative_count` added via `ensureColumn`)
- `subscriptions` (incl. `gateway`, `razorpay_subscription_id`, `razorpay_customer_id`, `trial_ends_at` added via `ensureColumn`)

### 5.2 OAuth tokens (encrypted with `TOKEN_ENCRYPTION_KEY`)

- `meta_tokens`, `google_tokens`, `tiktok_tokens`, `shopify_tokens`

Re-OAuth is mandatory on any environment change because tokens are encrypted with the env's key. The new Railway env's `TOKEN_ENCRYPTION_KEY` is set; no migration of old tokens is possible.

### 5.3 Cost ledger (gateway billing accountability)

- `cost_ledger` — written from `services/llm-gateway.ts:206-210` (every successful `createMessage`) and `services/job-queue.ts:253-256` (creative-job costs). Read from `getDailyLimitStatus()` (`llm-gateway.ts:92-98`), creative-engine route aggregations, and sales-agent upsell detection.
- **Critical for M1.5c:** every row needs a `correlationId` so a request can be traced through the gateway. Currently the column is written via the `metadata` JSON blob; the request-id middleware story makes this a first-class column.

### 5.4 Agents & intelligence (the learning loop)

- `agent_core_memory`, `agent_episodes`, `agent_entities`, `agent_decisions`, `agent_runs`, `agent_recommendations`
- `intelligence_metrics`, `intelligence_predictions`, `intelligence_recommendations`
- `creative_intelligence_context`, `creative_category_knowledge`, `creative_evolution`, `creative_quality_scores`, `prediction_accuracy`, `score_predictions`
- `operator_profiles`, `operator_behavior`, `operator_feedback`
- `entity_state_snapshots`, `dna_cache`
- Strategic memory (lazy): `strategic_reports`, `strategic_recommendations`, `strategic_running_context`, `strategic_predictions`

### 5.5 Creative engine

- `creative_sprints`, `creative_jobs`, `creative_assets`, `creative_briefs`
- `studio_generations`, `studio_outputs` (incl. `score_json` added via `ensureColumn`)
- `swipe_file`, `content_bank`
- `ugc_projects`, `ugc_concepts`, `ugc_scripts`

### 5.6 Audits & monitoring

- `audits`, `brand_context`, `brands` (**orphans — see §3.3**)
- `scheduled_audits` (lazy)
- `oos_agent_store`, `discount_agent_store`, `creative_agent_store`, `competitor_intel_store`
- `competitor_snapshots`, `competitor_movements`
- `autopilot_alerts`, `automations`
- `reports`, `client_reports`, `comment_mining_reports`, `classified_comments`
- `url_analysis_cache`

### 5.7 Misc

- `service_clients` (the brands we serve — distinct from platform `users`)
- `leads` (waitlist + sales funnel)
- `activity_log`
- `recommendations` (incl. `metadata` added by the ad-hoc ALTER in `agent-orchestrator.ts`)

### 5.8 Tests

36 test files in `server/src/__tests__/`. All set up an in-memory DB via the shared `createTestApp()` helper (`__tests__/helpers/test-app.ts:1-50`). Tests are authoritative because they run against a fresh canonical schema; they would not catch the orphan-table or legacy-shape drift since they never start with those legacy shapes.

---

## 6. Brief: previous strategies & plans

### 6.1 23_05 — initial cleanup proposal

`dev_reports/23_05/` framed the analysis-and-cleanup branch's mission: unblock the broken `main` build, audit auth, and gate cron jobs. DB-specific work was framed as "schema consolidation" (a Tier 3 item) — no migration tool was specified.

### 6.2 24_05 — Tier 1.5 (M1) scope locked

`dev_reports/24_05/next_steps.md` introduced the four-pillar M1 plan:

1. **1.5a — Postgres + Drizzle migration.** The headline deliverable. Initial estimate: 3-5 days. Covers schema design, Drizzle table builders for all canonical tables, replacing ~30 `db.prepare(...)` call sites with Drizzle queries, a SQLite→PG data dump+restore step (~half day), and test parity.
2. **1.5b — Sentry init.** Half day to one day. Wire `Sentry.init()` + `setupFastifyErrorHandler(app)` into `server/src/index.ts`.
3. **1.5c — Request-ID / correlationId middleware.** Half day. Pipe Fastify's native `request.id` into every Pino log, every cron entrypoint (mint a `runId`), and every `createMessage` call so `cost_ledger.metadata` carries a traceable correlation key.
4. **1.5d — `as any` audit cleanup.** One day. Cut 78 instances to <30; remaining need an inline comment.

### 6.3 25_05 — two pivots

**Pivot 1 (data sacrifice).** [`../25_05/railway_data_at_risk.md`](../25_05/railway_data_at_risk.md). The old Railway volume held only test/mock data, so we are not paying to reactivate it. **M1's "data dump+restore" sub-step (~half day) is removed.** This nets out roughly even with the new `shopify_tokens` sub-step added below.

**Pivot 2 (shopify_tokens deferral).** [`../25_05/shopify_tokens_fork.md`](../25_05/shopify_tokens_fork.md). What was planned as a 30-min `ALTER TABLE` in the PR turned out to be a schema fork. The fix is folded into M1.5a: build canonical from scratch in Drizzle, patch the two `brand_id`-keyed readers to JOIN through `brands.user_id` (column name verified 2026-05-26). **Adds ~half day to M1.5a.**

Updated 1.5a sub-step table is in `../25_05/next_steps.md` §3.1. M1 close date held at **2026-05-28** because the half day saved from removing the data import roughly equals the half day added for the fork reconciliation.

### 6.4 26_05 — today

PR #1 (`Unblock backend build + close auth bug on /schedules`) merged to `main` on 2026-05-25. Today's Railway env now boots clean — `NODE_ENV=production` was unset on the service, which made the logger reach for `pino-pretty` (devDep-only) and crash-loop the container. Setting `NODE_ENV=production` triggered a clean redeploy. Container is serving (`/health` 200, all subsystems initialized).

No code change today. **The DB is the next surface to touch.**

---

## 7. Risks and blockers for M1

1. **Orphan tables (§3.3).** `audits`, `brand_context`, `brands` are read by `audit/index.ts` and `unified-agent-runner.ts` but have no creator in source. On the new Railway env (cold start, no legacy migrations applied), any code path that touches them will 500. **Action:** declare them in the canonical Drizzle schema during M1.5a, with column shapes recovered from local DB's `PRAGMA table_info`.
2. **`brands` table shape — resolved 2026-05-26.** PRAGMA shows 11 columns; FK to users is `user_id`, not `owner_user_id`. No JOIN-patch work needed beyond using the correct column name. All four existing usages (`audit/index.ts:297,338`, `routes/audits.ts:236`, `unified-agent-runner.ts:188`) already reference `user_id` correctly. `brands` is still orphan from `schema.ts` — see risk #1.
3. **Lazy table creation (§3.2).** Six tables only exist after their owning service is invoked. If any route, cron, or background job hits them before the init function runs, we get "no such table". **Action:** fold all lazy creators into the canonical schema and call them from the top of `getDb()`. Drizzle migration is the natural place to do this.
4. **Multiple `new Database()` connections (§4.2).** Will become connection-pool sprawl when we move to Postgres — each one needs to become a `pg` client that drains correctly on shutdown. **Action:** consolidate to a single `db` export from a unified `db/index.ts` during 1.5a; ban direct `new Database()` / `new pg.Client()` via CI grep in Tier 3.2.
5. **`recommendations.metadata` ad-hoc ALTER** (`agent-orchestrator.ts:525`). Move into canonical schema.
6. **Reviewer-account seeding on every boot.** `seedReviewerAccount()` ships a known credential. M1 is the right time to gate this behind an env flag (`SEED_META_REVIEWER=1` or similar) — silent default-shipped credentials are an avoidable Meta App Review liability.
7. **Encryption-key continuity is not transferable.** Old OAuth tokens cannot be migrated. (Moot, no real tokens existed.)
8. **No proper migration tool.** Drizzle's `drizzle-kit` is the answer; until it lands, every shape change keeps accreting `ensureColumn` calls or ad-hoc ALTERs.

---

## 8. Recommended next moves

1. **Today / tomorrow morning:** open `m1-infrastructure` branch off post-merge `main`. `brands` shape now verified (column is `user_id`); remaining 10-min work is grep-verifying the §3.4 "unconfirmed" tables and adding `CREATE TABLE` statements in `schema.ts` for the four orphan tables before any Drizzle codegen step.
2. **M1 day 1:** provision Postgres on the new Railway account (or Neon free tier). Add `drizzle-orm`, `drizzle-kit`, `pg` to `server/package.json`. Land empty Drizzle config + first migration that creates an empty PG.
3. **M1 day 2:** port every canonical table to Drizzle table builders. Fold in the orphan tables (§3.3) and the lazy tables (§3.2). Resolve `shopify_tokens` fork via canonical schema + JOIN patches for the two stragglers.
4. **M1 day 3:** flip `db/index.ts` to open Postgres when `DATABASE_URL` is set; collapse the four side-channel `new Database()` connections; rewrite ~30 `db.prepare(...)` call sites to Drizzle. Add Tier 1.5b (Sentry init) + Tier 1.5c (request-id middleware including `cost_ledger.correlation_id`).
5. **M1 day 4:** `as any` cleanup; test parity (in-memory PG via `pg-mem` or container PG for tests); smoke-test boot with empty PG.
6. **2026-05-28:** M1 close. Handoff doc → M2 (ingestion).

---

## 9. Quick-reference appendices

### A. Files that open a DB connection

| File | Purpose | Should consolidate? |
|---|---|---|
| `server/src/db/index.ts:59` | Canonical singleton (`getDb()`) | Already canonical |
| `server/src/audit/index.ts:289` | Audit module | Yes |
| `server/src/services/client-context.ts:92` | Client context | Yes |
| `server/src/services/audit-scheduler.ts:32` | Scheduler | Yes |
| `server/src/services/strategic-memory.ts:145` | Strategic memory | Yes |

### B. Pragmas active on the canonical connection

```ts
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
```

No `busy_timeout`, `synchronous`, `cache_size`, `page_size`, or `temp_store` are set. Postgres has different knobs — none of this code carries over.

### C. Related reports

- [`../23_05/`](../23_05/) — initial scoping
- [`../24_05/next_steps.md`](../24_05/next_steps.md) — original M1 plan
- [`../24_05/merge_readiness.md`](../24_05/merge_readiness.md) — pre-merge audit
- [`../25_05/next_steps.md`](../25_05/next_steps.md) — updated plan (supersedes 24_05)
- [`../25_05/shopify_tokens_fork.md`](../25_05/shopify_tokens_fork.md) — fork forensic
- [`../25_05/railway_data_at_risk.md`](../25_05/railway_data_at_risk.md) — data-sacrifice decision
- [`../25_05/pre_pr_review.md`](../25_05/pre_pr_review.md) — pre-PR review
- [`../25_05/session_log.md`](../25_05/session_log.md) — 25_05 work log
- [`../ON_HOLD.md`](../ON_HOLD.md) — deferred items ledger