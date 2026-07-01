> **Status: ♻️ SUPERSEDED (2026-05-31)** — Apr-26 SQLite schema snapshot. Superseded by `26_05/database_state.md`.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._
> _Body compressed 2026-06-17 (volume reduction): redundant restatement removed; unique essence retained below. Full original in git history; live restatement in the successor doc(s) above._

# Database Structure — Engineer Reference (2026-04-26)

## Unique essence preserved

**SQLite engine (pre-PG snapshot):**
- `better-sqlite3` — synchronous, single shared in-process connection. File `./data/cosmisk.db` (path from `config.databasePath`).
- Pragmas: `journal_mode = WAL`, `foreign_keys = ON`. `getDb()` lazy-init in `server/src/db/index.ts`; `closeDb()` on `SIGINT`/`SIGTERM`.
- **40 tables, 18 secondary indexes, ~13 ALTER-TABLE column migrations applied at boot via `ensureColumn()`.**

**Schema fragmentation — 4 source files:**
1. `server/src/db/schema.ts` — `createTables()` at boot, authoritative for 35 tables.
2. `server/scripts/add-audit-tables.ts` (creates `brands`, `brand_context`, `audits`; seeds 3 hardcoded demo brand rows) + `add-shopify-tables.ts` (`shopify_tokens`, adds `brands.shopify_domain`). **One-off hand-run, NOT run by `createTables()`, NOT idempotent in CI.** Fresh DB without these → `no such table` on `audits`/`brands` routes.
3. Lazy runtime creation: `scheduled_audits` (`audit-scheduler.ts:137`), `waitlist_leads` (inside `POST /waitlist/join`, `index.ts:162` — first request after each cold start runs `CREATE TABLE IF NOT EXISTS`).

**High-priority lookup-key gaps (PK-only but lookup-heavy):**
- `subscriptions` — no index on `user_id` / `stripe_customer_id` / `razorpay_subscription_id` (usage-limiter on every request). HIGH-PRIORITY.
- `cost_ledger` — no index on `user_id` / `sprint_id` / `(user_id, created_at)`; scanned by daily cost-limit guard on **every job dispatch**. HIGH-PRIORITY. Natural home for the per-user LLM cost ceiling (Added Risk E). PG: `idx_cost_ledger_user_day(user_id, date_trunc('day', created_at))`; hash-partition by month once >10M rows.

**Out-of-schema / gaps:**
- `shopify_tokens` scoped **per-brand not per-user** (`brand_id PK FK→brands`). **No OAuth route exists to populate it** — needs `routes/shopify.ts` before brand-onboarding; move definition into `schema.ts`.
- `audits` — `full_output` is entire audit JSON inlined; `brand_name` denormalised (can drift, needs trigger or drop).
- `activity_log` — **no reader in current code** (writers: `auth.ts`, `team.ts`); add admin view or drop.

**Per-table PG hints (unique):**
- `users`: add `tokenVersion INT DEFAULT 0` for JWT-revocation when JWT→cookies (Added Risk A); promote `role`/`plan` to **named enum types `user_role` and `plan_tier`**; add `updated_at` + a `BEFORE UPDATE` trigger (`created_at` already exists).
- `subscriptions`: in addition to the lookup-key indexes above, add a **partial index `WHERE status = 'active'`** for the usage-limiter hot path.
- `brands`: add `idx_brands_user_id` and `idx_brands_meta_ad_account_id` (`meta_ad_account_id` used as FK in audit lookups); convert `category`/`stage` to enum; **replace the hardcoded 3-brand seed with a real onboarding route `POST /brands/create`.**
- `meta_tokens`: ciphertext → `bytea` not TEXT-base64; add token-refresh job before `expires_at`. Encryption via `services/token-crypto.ts`.
- `google_tokens.customer_ids` CSV → `text[]`.
- `user_usage`: drop `id INT PK` — `(user_id, period)` is natural PK.
- `scheduled_audits`: disappears when Phase 3 (BullMQ/pg-boss) lands — semantics move to queue repeatable-job registry.
- `campaigns.creative_ids` CSV → FK join table or `text[]`.
- `creative_jobs`: Phase-3 decision note — once the queue lands, decide whether `creative_jobs` stays source-of-truth or the queue owns lifecycle and this table becomes audit/history only.
- `dna_cache`: add TTL on `analyzed_at` **because creative-DNA changes when ad copy is edited** (stale cache otherwise serves outdated DNA).
- `team_invitations`: add a sweep job for expired invites (also covered by F7).
- `leads`: consider a TTL/anonymisation policy for GDPR.
- `score_predictions`: keep partial `idx_score_predictions_unresolved(resolved_at) WHERE resolved_at IS NULL`.

**Cross-cutting findings (SQLite-era):**
- **F1 missing-index table (13 tables → one P1.1 migration):** `subscriptions`→(user_id),(stripe_customer_id); `cost_ledger`→(user_id,created_at); `campaigns`→(user_id,status); `automations`→(user_id,is_active); `autopilot_alerts`→(user_id,read) partial WHERE read=0; `creative_sprints`→(user_id,status); `creative_assets`→(user_id,status),(sprint_id),(meta_ad_id); `studio_generations`→(user_id,created_at DESC); `ugc_projects`→(user_id,status); `ugc_concepts`→(project_id); `ugc_scripts`→(concept_id),(project_id); `reports`→(user_id,generated_at DESC); `agent_episodes`→(user_id,created_at DESC).
- **F2 JSON-as-TEXT → jsonb (21+ cols):** users.goals/competitors/notification_preferences, campaigns.creative_ids, creative_sprints.plan/learn_snapshot, creative_jobs.script/dna_tags, creative_assets.dna_tags/actual_metrics, dna_cache.hook/visual/audio/visual_analysis, studio_generations.brief_json/formats, studio_outputs.output_json/score_json, score_predictions.dna_tags/score_breakdown, swipe_file.hook_dna/visual_dna/audio_dna, agent_episodes.context/outcome/entities, agent_entities.attributes, brand_context.winning_patterns/failed_approaches, audits.full_output, reports.data, url_analysis_cache.result_json.
- **F3 missing FK constraints:** `creative_assets.job_id`→creative_jobs(id) no CASCADE (orphan assets); `audits.brand_id`→brands(id) **no FK declared at all**; `studio_outputs.generation_id` FK but no ON DELETE CASCADE; `score_predictions.studio_output_id` logical FK no constraint; `cost_ledger.user_id/sprint_id/job_id` all logical FKs no constraints.
- **F4:** ~25 enum-candidate columns (status, role, plan, severity, format, confidence, urgency, category, stage, gateway, objective, type, source, content_type, agent_type, entity_type, frequency, date_preset).
- **F5 boolean-as-INT:** onboarding_complete, cancel_at_period_end, read, is_active, used, enabled → PG `boolean`.
- **F6:** all timestamps `TEXT` with `datetime('now')` → `timestamptz NOT NULL DEFAULT now()` (ISO-8601 stored, cast straightforward).
- **F7 no TTL/sweep for:** expired password_reset_tokens, expired team_invitations, old dna_cache, old url_analysis_cache, completed creative_jobs, resolved score_predictions — Phase 3 queue owns these.
- **F8:** Phase 2 consolidate all 40 tables into `drizzle-kit` migrations as single source of truth; seed-brand script → one-time migration + real onboarding API.

## Pointer
- SUPERSEDED → see: `26_05/database_state.md` (full PG schema restatement).
