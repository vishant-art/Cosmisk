# Database Structure — Engineer Reference (2026-04-26)

**Engine:** `better-sqlite3` (synchronous, single shared connection in-process).
**File:** `./data/cosmisk.db` (path from `config.databasePath`).
**Pragmas:** `journal_mode = WAL`, `foreign_keys = ON`. WAL allows concurrent readers; writes serialise on the SQLite mutex.
**Connection lifecycle:** `getDb()` lazy-init in `server/src/db/index.ts`; closed on `SIGINT`/`SIGTERM` via `closeDb()`.

> **Schema fragmentation flag.** Tables live in **three places**, not one. The PG migration plan must consolidate them:
> 1. `server/src/db/schema.ts` — `createTables()` runs at boot. Authoritative for 35 tables.
> 2. `server/scripts/add-audit-tables.ts` and `server/scripts/add-shopify-tables.ts` — **one-off scripts run by hand**. They create `brands`, `brand_context`, `audits`, `shopify_tokens` and seed three brand rows. Not run by `createTables()`. **Not idempotent in CI.**
> 3. Lazy creation at runtime: `scheduled_audits` (in `services/audit-scheduler.ts`), `waitlist_leads` (inside `POST /waitlist/join` in `index.ts`).
>
> Anyone bringing up a fresh DB has to know to run the scripts, otherwise routes that touch `audits`/`brands` will throw `no such table` errors.

> **Implicit indexes.** SQLite auto-creates indexes on `PRIMARY KEY` and `UNIQUE` columns. The "no index" call-outs below mean **no secondary index** beyond those.

---

## Index of all tables

| # | Table | Source | Domain |
|---|---|---|---|
| 1 | `users` | `schema.ts` | Identity |
| 2 | `meta_tokens` | `schema.ts` | Identity / Integrations |
| 3 | `google_tokens` | `schema.ts` | Identity / Integrations |
| 4 | `tiktok_tokens` | `schema.ts` | Identity / Integrations |
| 5 | `shopify_tokens` | `add-shopify-tables.ts` | Identity / Integrations |
| 6 | `password_reset_tokens` | `schema.ts` | Identity |
| 7 | `team_members` | `schema.ts` | Identity / Teams |
| 8 | `team_invitations` | `schema.ts` | Identity / Teams |
| 9 | `subscriptions` | `schema.ts` | Billing |
| 10 | `user_usage` | `schema.ts` | Billing / Quota |
| 11 | `cost_ledger` | `schema.ts` | Billing / Cost telemetry |
| 12 | `brands` | `add-audit-tables.ts` | Audit |
| 13 | `brand_context` | `add-audit-tables.ts` | Audit |
| 14 | `audits` | `add-audit-tables.ts` | Audit |
| 15 | `scheduled_audits` | `audit-scheduler.ts` | Audit |
| 16 | `campaigns` | `schema.ts` | Ad ops |
| 17 | `automations` | `schema.ts` | Ad ops |
| 18 | `autopilot_alerts` | `schema.ts` | Ad ops / Alerts |
| 19 | `dna_cache` | `schema.ts` | Ingestion cache |
| 20 | `url_analysis_cache` | `schema.ts` | Ingestion cache |
| 21 | `creative_sprints` | `schema.ts` | Creative pipeline |
| 22 | `creative_jobs` | `schema.ts` | Creative pipeline |
| 23 | `creative_assets` | `schema.ts` | Creative pipeline |
| 24 | `studio_generations` | `schema.ts` | Creative Studio |
| 25 | `studio_outputs` | `schema.ts` | Creative Studio |
| 26 | `score_predictions` | `schema.ts` | Creative Studio / Scoring |
| 27 | `ugc_projects` | `schema.ts` | UGC |
| 28 | `ugc_concepts` | `schema.ts` | UGC |
| 29 | `ugc_scripts` | `schema.ts` | UGC |
| 30 | `content_bank` | `schema.ts` | Content / Social |
| 31 | `agent_runs` | `schema.ts` | Agent system |
| 32 | `agent_decisions` | `schema.ts` | Agent system |
| 33 | `agent_core_memory` | `schema.ts` | Agent system |
| 34 | `agent_episodes` | `schema.ts` | Agent system |
| 35 | `agent_entities` | `schema.ts` | Agent system |
| 36 | `swipe_file` | `schema.ts` | Inspiration library |
| 37 | `reports` | `schema.ts` | Reports |
| 38 | `leads` | `schema.ts` | Growth |
| 39 | `waitlist_leads` | `index.ts` (lazy) | Growth |
| 40 | `activity_log` | `schema.ts` | Audit trail |

40 tables, 18 secondary indexes, ~13 ALTER-TABLE column migrations applied at boot via `ensureColumn()`.

---

## Reference per table

Format below: **purpose · primary readers · primary writers · columns (key only) · indexes · improvement notes for PG migration.**

### Identity domain

#### 1. `users`
- **Purpose:** Account record. Owns every other user-scoped row.
- **Readers:** auth, billing, every protected route, JWT signing payload, audit access checks.
- **Writers:** `auth.ts /signup`, `db/index.ts seedReviewerAccount()`, `index.ts /profile updates`.
- **Columns (key):** `id TEXT PK`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT NOT NULL`, `role TEXT 'user'`, `plan TEXT 'free'`, `onboarding_complete INT`, `brand_name`, `website_url`, `goals` (JSON), `competitors` (JSON), `active_brand`, `phone`, `notification_preferences` (JSON), `timezone 'IST'`, `language 'en'`, `currency 'INR'`, `date_format 'DD/MM/YYYY'`.
- **Indexes:** PK on `id`, UNIQUE index on `email` (auto). **No** secondary index.
- **Improvements for PG:**
  - Promote `role` and `plan` to PG `enum` types (`user_role`, `plan_tier`).
  - Replace JSON-as-TEXT (`goals`, `competitors`, `notification_preferences`) with `jsonb`.
  - Add `tokenVersion INT NOT NULL DEFAULT 0` to support revocation when JWT migrates to cookies (Added Risk A).
  - Add `created_at` already exists; add `updated_at` and a `BEFORE UPDATE` trigger.

#### 2. `meta_tokens`
- **Purpose:** Encrypted Meta Graph access token per user.
- **Readers:** every Meta-backed route (`ad-accounts`, `dashboard`, `analytics`, `assets`, `brain`, `brands`, `campaigns`, `competitor-spy`, `content`, `creative-engine`, `director`, `ai`, `ugc-workflows`, `automations`, `audit/index.ts`).
- **Writers:** `auth.ts /meta-oauth/exchange`, `auth.ts /meta-disconnect`, `db/index.ts seedReviewerAccount()`.
- **Columns:** `user_id TEXT PK FK→users`, `encrypted_access_token TEXT`, `meta_user_id`, `meta_user_name`, `expires_at`.
- **Indexes:** PK on `user_id` (sufficient — only ever accessed by user_id).
- **Improvements:** wrap encryption in app code (already done via `services/token-crypto.ts`); in PG add `bytea` for ciphertext instead of TEXT-base64; add scheduled job to refresh tokens before `expires_at`.

#### 3. `google_tokens`
- **Purpose:** Google Ads OAuth tokens (access + refresh).
- **Readers:** `routes/google-ads.ts`, `audit/google-ads-ingestion.ts`.
- **Writers:** `routes/google-ads.ts /oauth/exchange`, `/disconnect`.
- **Columns:** `user_id TEXT PK FK→users`, `encrypted_access_token`, `encrypted_refresh_token`, `customer_ids TEXT` (CSV string).
- **Indexes:** PK only.
- **Improvements:** `customer_ids` should be `text[]` in PG, not CSV.

#### 4. `tiktok_tokens`
- **Purpose:** TikTok Ads OAuth tokens.
- **Readers:** `routes/tiktok-ads.ts`.
- **Writers:** `routes/tiktok-ads.ts /oauth/exchange`, `/disconnect`.
- **Columns:** `user_id TEXT PK FK→users`, `encrypted_access_token`, `advertiser_id`.
- **Indexes:** PK only.

#### 5. `shopify_tokens` (out-of-schema)
- **Purpose:** Shopify storefront/admin token, scoped per **brand**, not per user.
- **Readers:** `audit/shopify-ingestion.ts`.
- **Writers:** none in current code (assume created via the seed script). **No OAuth route exists** to populate this table — gap.
- **Columns:** `brand_id TEXT PK FK→brands`, `shop_domain`, `encrypted_access_token`, `scope`.
- **Indexes:** PK only.
- **Improvements:** add a `routes/shopify.ts` OAuth flow before brand-onboarding lands; move definition into `schema.ts`.

#### 6. `password_reset_tokens`
- **Purpose:** Single-use reset tokens (hashed).
- **Readers:** `auth.ts /reset-password`.
- **Writers:** `auth.ts /forgot-password`.
- **Columns:** `id TEXT PK`, `user_id FK→users`, `token_hash TEXT`, `expires_at`, `used INT 0`.
- **Indexes:** `idx_reset_tokens_hash(token_hash)`.
- **Improvements:** sweep job to delete expired tokens (none exists today); make `used` a partial-index filter.

#### 7. `team_members`
- **Purpose:** Workspace membership — invited collaborators on an owner's account.
- **Readers/Writers:** `routes/team.ts`.
- **Columns:** `id`, `owner_user_id FK→users`, `member_user_id FK→users (NULL until accepted)`, `email`, `role`, `status`.
- **Indexes:** UNIQUE `(owner_user_id, email)`, `(member_user_id)`.
- **Improvements:** add `(member_user_id, status)` if member-side listings get slow.

#### 8. `team_invitations`
- **Purpose:** One-shot invite tokens.
- **Readers/Writers:** `routes/team.ts`.
- **Indexes:** `idx_team_invitations_token(token_hash)`.
- **Improvements:** sweep job for expired invites.

---

### Billing domain

#### 9. `subscriptions`
- **Purpose:** Stripe + Razorpay subscription state.
- **Readers:** `routes/billing.ts`, `plugins/usage-limiter.ts`.
- **Writers:** `routes/billing.ts /create-checkout`, `/verify-payment`, `/cancel`, `/razorpay-webhook`, `/webhook` (Stripe).
- **Columns:** `id PK`, `user_id FK→users`, `stripe_customer_id`, `stripe_subscription_id`, `plan`, `status`, `current_period_*`, `cancel_at_period_end`, plus migrated columns: `gateway 'stripe'`, `razorpay_subscription_id`, `razorpay_customer_id`, `trial_ends_at`.
- **Indexes:** PK only. **No index on `user_id`, `stripe_customer_id`, or `razorpay_subscription_id`** despite all three being lookup keys. **High-priority fix.**
- **Improvements (PG):** add `idx_subscriptions_user_id`, `idx_subscriptions_stripe_customer_id`, `idx_subscriptions_razorpay_subscription_id`. Convert `plan`, `status`, `gateway` to enum types. Add a partial index `WHERE status = 'active'` for usage-limiter hot path.

#### 10. `user_usage`
- **Purpose:** Per-period quota counters (chat / image / video / creative).
- **Readers:** `plugins/usage-limiter.ts`, `routes/billing.ts checkLimit()`.
- **Writers:** `incrementUsage()` in `routes/billing.ts`.
- **Columns:** `id INT PK`, `user_id FK→users`, `period TEXT` (e.g., `2026-04`), counters, `UNIQUE(user_id, period)`.
- **Indexes:** UNIQUE `(user_id, period)` (auto).
- **Improvements:** drop the `id INT PK` — `(user_id, period)` is the natural PK. Counters can stay INT; switch to `bigint` if you ever expect >2B/month.

#### 11. `cost_ledger`
- **Purpose:** Append-only spend log per API call.
- **Readers:** `services/job-queue.ts checkDailyCostLimit()`, `routes/creative-engine.ts /costs`.
- **Writers:** `services/job-queue.ts` after each provider call.
- **Columns:** `id INT PK`, `user_id`, `sprint_id`, `job_id`, `api_provider`, `operation`, `cost_cents`, `metadata` (JSON), `created_at`.
- **Indexes:** PK only. **No index on `user_id`, `sprint_id`, or `(user_id, created_at)`** — this is the table the daily cost-limit guard scans on every job dispatch. **High-priority fix.**
- **Improvements (PG):** add `idx_cost_ledger_user_day(user_id, date_trunc('day', created_at))` — make it the canonical aggregation path. Add hash partition by month on `created_at` once row count > 10M. This table is also the natural home for the **per-user LLM cost ceiling** (Added Risk E).

---

### Audit domain *(out-of-schema)*

#### 12. `brands`
- **Purpose:** Multi-brand support — distinct from `users`. A user can own multiple brands; one brand is `users.active_brand`.
- **Readers:** `audit/index.ts`, `services/audit-scheduler.ts`.
- **Writers:** seeded by `add-audit-tables.ts` (hardcoded — three demo brands).
- **Columns:** `id PK`, `name`, `domain`, `category 'other'`, `stage 'scaling'`, `meta_ad_account_id`, `pixel_id`, `user_id FK→users ON DELETE SET NULL`, `shopify_domain` (added by `add-shopify-tables.ts`).
- **Indexes:** PK only.
- **Improvements (PG):**
  - Move definition into authoritative migrations.
  - Replace hardcoded brand seed with a real onboarding route (`POST /brands/create`).
  - Add `idx_brands_user_id`, `idx_brands_meta_ad_account_id` (used as foreign key in audit lookups).
  - Convert `category`/`stage` to enum.

#### 13. `brand_context`
- **Purpose:** Persisted "what works / what doesn't" for a brand — fed into audit-agent prompts.
- **Readers:** `audit/audit-agent.ts`.
- **Writers:** `audit/index.ts` after each audit run.
- **Columns:** `brand_id PK FK→brands`, `price_point`, `target_audience`, `winning_patterns TEXT '[]'` (JSON array), `failed_approaches TEXT '[]'` (JSON array).
- **Indexes:** PK only.
- **Improvements:** `winning_patterns`/`failed_approaches` → `jsonb`; add length cap or trim policy to keep prompts bounded.

#### 14. `audits`
- **Purpose:** Audit history per brand — last N audit results, used for diffing.
- **Readers:** `routes/audits.ts`.
- **Writers:** `audit/index.ts` after each run.
- **Columns:** `id PK`, `brand_id`, `brand_name` (denormalised), `date_range_*`, `health_score`, `wasted_spend`, `best_cpa`, `worst_cpa`, `top_findings`, `top_priority`, `confidence_level`, `full_output TEXT` (entire audit JSON inlined).
- **Indexes:** PK only. **No FK constraint on `brand_id`** even though it logically references `brands(id)`.
- **Improvements (PG):**
  - Add real FK `brand_id REFERENCES brands(id) ON DELETE CASCADE`.
  - Add `idx_audits_brand_created (brand_id, created_at DESC)` — the dominant access pattern is "latest 10 audits for brand X".
  - `full_output` → `jsonb` (currently a stringified JSON blob — searches force JSON parse).
  - Drop `brand_name` denorm or keep with a `BEFORE INSERT/UPDATE` trigger — current code can drift.

#### 15. `scheduled_audits` *(lazy-created in `audit-scheduler.ts:137`)*
- **Purpose:** Cron schedule + last/next run for each automated audit.
- **Readers/Writers:** `services/audit-scheduler.ts`.
- **Columns:** `id PK`, `brand_id`, `frequency`, `cron_expression`, `date_preset`, `enabled INT`, `last_run_at`, `next_run_at`.
- **Indexes:** PK only.
- **Improvements:** when Phase 3 (BullMQ/pg-boss) lands, this table goes away — its semantics move into the queue's repeatable-job registry.

---

### Ad ops domain

#### 16. `campaigns`
- **Purpose:** Campaign drafts assembled in the UI; later launched to Meta.
- **Readers/Writers:** `routes/campaigns.ts`.
- **Columns:** `id PK`, `user_id FK→users`, `account_id`, `name`, `objective`, `budget`, `schedule_*`, `audience`, `placements`, `creative_ids` (CSV), `status 'draft'`.
- **Indexes:** PK only. **No index on `user_id` or `account_id`.**
- **Improvements:** add `idx_campaigns_user_status (user_id, status)`; promote `objective`, `status` to enum; convert `creative_ids` CSV to FK join table or `text[]`.

#### 17. `automations`
- **Purpose:** User-defined trigger→action rules ("when ROAS<1.5, pause campaign").
- **Readers:** `services/automation-engine.ts`, `routes/automations.ts`.
- **Writers:** `routes/automations.ts`.
- **Columns:** `id PK`, `user_id FK→users`, `account_id`, `name`, `trigger_type`, `trigger_value`, `action_type`, `action_value`, `is_active INT 1`, `last_triggered`.
- **Indexes:** PK only. **No index on `user_id` or `is_active`.**
- **Improvements:** add `idx_automations_user_active (user_id, is_active)`; enums for `trigger_type`, `action_type`.

#### 18. `autopilot_alerts`
- **Purpose:** Anomaly + insight notifications surfaced in the UI.
- **Readers/Writers:** `routes/autopilot.ts`, `services/autopilot-engine.ts`.
- **Columns:** `id PK`, `user_id FK→users`, `account_id`, `type`, `title`, `content`, `severity`, `read INT 0`.
- **Indexes:** PK only. **No index on `(user_id, read)` despite that being the unread-count query.**
- **Improvements:** add `idx_autopilot_alerts_user_read (user_id, read)`. Add a partial index `WHERE read = 0` for the unread-badge hot path.

---

### Ingestion cache domain

#### 19. `dna_cache`
- **Purpose:** Per-ad analysed creative-DNA (hooks/visual/audio breakdown). Avoids re-analysing the same ad.
- **Readers:** `routes/creative-engine.ts`, `services/visual-analyzer.ts`.
- **Writers:** `services/visual-analyzer.ts` after analysis.
- **Columns:** `ad_id TEXT PK`, `account_id`, `ad_name`, `hook TEXT '[]'`, `visual TEXT '[]'`, `audio TEXT '[]'`, `reasoning`, `analyzed_at`, plus migrated `visual_analysis TEXT '{}'`.
- **Indexes:** `idx_dna_cache_account(account_id)`.
- **Improvements:** add TTL on `analyzed_at` (creative-DNA changes when ad copy is edited); JSON columns → `jsonb`.

#### 20. `url_analysis_cache`
- **Purpose:** Memoised landing-page analysis (Creative Studio).
- **Readers/Writers:** `routes/creative-studio.ts`.
- **Columns:** `url TEXT PK`, `result_json TEXT`, `analyzed_at`.
- **Indexes:** PK only.
- **Improvements:** TTL/sweep policy; `result_json` → `jsonb`.

---

### Creative pipeline domain

#### 21. `creative_sprints`
- **Purpose:** Top-level "creative sprint" — a planned batch of creative jobs for a brand.
- **Readers:** `routes/creative-engine.ts`, `services/job-queue.ts`, `services/sprint-planner.ts`.
- **Writers:** `routes/creative-engine.ts /plan`, `/sprint/:id/approve`.
- **Columns:** `id PK`, `user_id FK→users`, `account_id`, `name`, `status 'analyzing'`, `plan TEXT` (JSON), `learn_snapshot TEXT` (JSON), `total_creatives`, `completed_creatives`, `failed_creatives`, `estimated_cost_cents`, `actual_cost_cents`, `currency 'USD'`.
- **Indexes:** PK only. **No index on `user_id` or `(user_id, status)`** despite the dashboard listing being "active sprints for current user".
- **Improvements:** `idx_creative_sprints_user_status (user_id, status)`; promote `status` to enum; `plan` and `learn_snapshot` → `jsonb`.

#### 22. `creative_jobs`
- **Purpose:** Per-asset generation job (video, image, carousel slide). One sprint contains N jobs.
- **Readers/Writers:** `services/job-queue.ts`.
- **Columns:** `id PK`, `sprint_id FK→creative_sprints`, `user_id`, `format`, `status 'pending'`, `priority`, `script`, `api_provider`, `api_job_id`, `output_url`, `output_thumbnail`, `predicted_score REAL`, `dna_tags`, `cost_cents`, `error_message`, `retry_count`, `started_at`, `completed_at`.
- **Indexes:** `idx_jobs_sprint(sprint_id)`, `idx_jobs_status(status, priority DESC)`.
- **Improvements:** PG enum for `status` and `format`; add `(user_id, status)` index for per-user dashboards. Once Phase 3 queue lands, consider whether this table becomes the source-of-truth or whether the queue owns lifecycle and this becomes audit/history only.

#### 23. `creative_assets`
- **Purpose:** Final published creative assets (after a `creative_jobs` row succeeds and is approved).
- **Readers:** `routes/assets.ts`, `routes/creative-engine.ts /sprint/:id/review`.
- **Writers:** `services/job-queue.ts` on completion, `routes/creative-engine.ts /asset/:id/edit`.
- **Columns:** `id PK`, `job_id FK→creative_jobs (no CASCADE)`, `sprint_id`, `user_id`, `account_id`, `format`, `name`, `asset_url`, `thumbnail_url`, `meta_ad_id`, `meta_campaign_id`, `dna_tags`, `predicted_score`, `actual_metrics TEXT`, `metrics_fetched_at`, `status 'draft'`, `published_at`.
- **Indexes:** PK only. **No index on `user_id`, `sprint_id`, `meta_ad_id`** — all three are common lookups.
- **Improvements:** add `idx_creative_assets_user_status (user_id, status)`, `idx_creative_assets_sprint (sprint_id)`, `idx_creative_assets_meta_ad (meta_ad_id)` for the auto-track flow that joins on Meta ad IDs.

---

### Creative Studio domain (separate from creative pipeline above)

#### 24. `studio_generations`
- **Purpose:** "Generate ad from URL" parent job (one URL → many output formats).
- **Readers/Writers:** `routes/creative-studio.ts`.
- **Columns:** `id PK`, `user_id`, `brief_json` (JSON), `formats` (JSON), `meta_account_id`, `status 'generating'`.
- **Indexes:** PK only.
- **Improvements:** add `idx_studio_generations_user (user_id, created_at DESC)`; JSON cols → `jsonb`.

#### 25. `studio_outputs`
- **Purpose:** Per-format output of a `studio_generations`.
- **Readers/Writers:** `routes/creative-studio.ts`.
- **Columns:** `id PK`, `generation_id FK→studio_generations`, `format`, `status 'pending'`, `output_json`, `cost_cents`, `error_message`, plus migrated `score_json`.
- **Indexes:** `idx_studio_outputs_gen(generation_id)`.
- **Improvements:** enum for `status`; `output_json` and `score_json` → `jsonb`.

#### 26. `score_predictions`
- **Purpose:** Predicted-score record per generated asset (vs. eventual actual).
- **Readers:** `routes/score.ts`, `services/creative-scorer.ts`.
- **Writers:** `services/creative-scorer.ts`.
- **Columns:** `id PK`, `user_id`, `studio_output_id`, `format`, `dna_tags`, `predicted_score REAL`, `predicted_roas_mid`, `score_breakdown TEXT`, `confidence`, `actual_roas`, `actual_ctr`, `accuracy_error`, `resolved_at`.
- **Indexes:** `idx_score_predictions_user(user_id)`, partial `idx_score_predictions_unresolved(resolved_at) WHERE resolved_at IS NULL` (good — scoring loop scans only open predictions).
- **Improvements:** keep the partial index; in PG `score_breakdown` → `jsonb`.

---

### UGC domain

#### 27. `ugc_projects`
- **Purpose:** UGC ad-creation project.
- **Readers:** `routes/ugc.ts`, `routes/ugc-workflows.ts`, `routes/dashboard.ts`.
- **Columns:** `id PK`, `user_id FK→users`, `name`, `brand_name`, `status 'draft'`, `brief TEXT`.
- **Indexes:** PK only. **No index on `user_id`.**
- **Improvements:** `idx_ugc_projects_user_status (user_id, status)`; enum `status`.

#### 28. `ugc_concepts`
- **Purpose:** Concept proposals for a UGC project.
- **Indexes:** PK only. **No index on `project_id`.**
- **Improvements:** `idx_ugc_concepts_project (project_id)`.

#### 29. `ugc_scripts`
- **Purpose:** Approved scripts for a concept.
- **Indexes:** PK only. **No index on `project_id` or `concept_id`.**
- **Improvements:** `idx_ugc_scripts_concept (concept_id)`, `idx_ugc_scripts_project (project_id)`.

---

### Content / Social domain

#### 30. `content_bank`
- **Purpose:** AI-generated social posts ready to schedule.
- **Readers/Writers:** `routes/content.ts`.
- **Indexes:** `idx_content_bank_user(user_id, status)`, `idx_content_bank_platform(user_id, platform)` — already well-indexed.
- **Improvements:** enum `status`, `platform`, `content_type`; `hashtags` → `text[]`.

---

### Agent system domain

#### 31. `agent_runs`
- **Purpose:** Each invocation of an agent (`watchdog`, `report`, `content`, `sales`, `meta-warmup`, `creative-strategist`).
- **Indexes:** `idx_agent_runs_user (user_id, agent_type)`.
- **Improvements:** add `(agent_type, status, started_at)` for cross-user analytics; enum `agent_type`, `status`.

#### 32. `agent_decisions`
- **Purpose:** Each AI-suggested action coming out of an agent run; user can approve/reject.
- **Indexes:** `idx_agent_decisions_run(run_id)`, `idx_agent_decisions_user(user_id, status)` — well-indexed.
- **Improvements:** enum `status`, `urgency`, `confidence`; `estimated_impact` → `jsonb`.

#### 33. `agent_core_memory`
- **Purpose:** Long-lived KV memory for an agent (e.g., user preferences).
- **Indexes:** UNIQUE `(user_id, agent_type, key)` (auto).
- **Improvements:** none structural; `value` could be `jsonb`.

#### 34. `agent_episodes`
- **Purpose:** Time-stamped episodic memory ("on Mar 4 we paused ad X and ROAS rose").
- **Indexes:** `idx_agent_episodes_user(user_id, agent_type)`.
- **Improvements:** add `(user_id, created_at DESC)` for "recent episodes" reads; `context`/`outcome`/`entities` → `jsonb`.

#### 35. `agent_entities`
- **Purpose:** Entity tracker (which campaigns/audiences/creatives the agent has seen).
- **Indexes:** UNIQUE `(user_id, entity_type, entity_name)` (auto), `idx_agent_entities_user(user_id, entity_type)`.

---

### Inspiration library

#### 36. `swipe_file`
- **Purpose:** Saved inspiration ads with DNA tags.
- **Readers/Writers:** `routes/swipe-file.ts`.
- **Indexes:** `idx_swipe_file_user(user_id)`.
- **Improvements:** JSON DNA cols → `jsonb`.

---

### Reports

#### 37. `reports`
- **Purpose:** Persisted weekly/perf reports.
- **Readers/Writers:** `routes/reports.ts`.
- **Columns:** `id PK`, `user_id FK→users`, `title`, `type 'performance'`, `account_id`, `date_preset`, `status 'pending'`, `data TEXT` (full report JSON).
- **Indexes:** PK only. **No index on `(user_id, generated_at)`** despite "recent reports" being the dominant query.
- **Improvements:** `idx_reports_user_generated (user_id, generated_at DESC)`; `data` → `jsonb`; enum `type`, `status`.

---

### Growth domain

#### 38. `leads`
- **Purpose:** Anonymous landing-page lead capture (email + UA + referrer).
- **Indexes:** `idx_leads_email(email)`.
- **Improvements:** none structural; consider TTL/anonymisation policy for GDPR.

#### 39. `waitlist_leads` *(lazy-created in `index.ts:162`)*
- **Purpose:** Detailed waitlist intake (email + role + ad_spend + pain_points + source).
- **Columns:** `id INT PK`, `email UNIQUE`, `name`, `company`, `role`, `ad_spend`, `team_size`, `pain_points TEXT` (JSON), `interested_features TEXT` (JSON), `source 'waitlist'`, `referrer`, `signed_up_at`.
- **Indexes:** UNIQUE on `email` (auto).
- **Improvements:** move definition into `schema.ts` (currently defined inside a request handler — first request after each cold start runs `CREATE TABLE IF NOT EXISTS`). JSON cols → `jsonb`.

---

### Audit trail

#### 40. `activity_log`
- **Purpose:** User-action audit trail.
- **Readers:** none in current code.
- **Writers:** `routes/auth.ts`, `routes/team.ts`.
- **Indexes:** `idx_activity_log_user(user_id, created_at DESC)`.
- **Improvements:** no current reader — either add an admin view or drop it. If kept, add partition by month once row count > 10M.

---

## Cross-cutting findings

### F1. Missing-index summary (high-priority for P1.1)
| Table | Missing index | Hot query |
|---|---|---|
| `subscriptions` | `(user_id)`, `(stripe_customer_id)` | usage-limiter on every request |
| `cost_ledger` | `(user_id, created_at)` | daily cost-limit guard before every job |
| `campaigns` | `(user_id, status)` | dashboard list |
| `automations` | `(user_id, is_active)` | automation-engine tick |
| `autopilot_alerts` | `(user_id, read)` partial `WHERE read = 0` | unread-count badge |
| `creative_sprints` | `(user_id, status)` | sprint dashboard |
| `creative_assets` | `(user_id, status)`, `(sprint_id)`, `(meta_ad_id)` | review/publish/auto-track |
| `studio_generations` | `(user_id, created_at DESC)` | studio history |
| `ugc_projects` | `(user_id, status)` | UGC dashboard |
| `ugc_concepts` | `(project_id)` | concept list |
| `ugc_scripts` | `(concept_id)`, `(project_id)` | script list |
| `reports` | `(user_id, generated_at DESC)` | reports list |
| `agent_episodes` | `(user_id, created_at DESC)` | recent episodes |

That's 13 tables with missing indexes that affect dominant queries. P1.1 should ship them as one migration.

### F2. JSON-as-TEXT
21 columns store JSON as `TEXT`. PG-side they should be `jsonb` to enable indexing/inspection: `users.goals`, `users.competitors`, `users.notification_preferences`, `campaigns.creative_ids`, `creative_sprints.plan`, `creative_sprints.learn_snapshot`, `creative_jobs.script`, `creative_jobs.dna_tags`, `creative_assets.dna_tags`, `creative_assets.actual_metrics`, `dna_cache.hook`, `dna_cache.visual`, `dna_cache.audio`, `dna_cache.visual_analysis`, `studio_generations.brief_json`, `studio_generations.formats`, `studio_outputs.output_json`, `studio_outputs.score_json`, `score_predictions.dna_tags`, `score_predictions.score_breakdown`, `swipe_file.hook_dna`, `swipe_file.visual_dna`, `swipe_file.audio_dna`, `agent_episodes.context`, `agent_episodes.outcome`, `agent_episodes.entities`, `agent_entities.attributes`, `brand_context.winning_patterns`, `brand_context.failed_approaches`, `audits.full_output`, `reports.data`, `url_analysis_cache.result_json`.

### F3. Missing FK constraints
- `creative_assets.job_id` references `creative_jobs(id)` but **no CASCADE** — orphan assets possible.
- `audits.brand_id` references `brands(id)` **with no FK declared at all**.
- `studio_outputs.generation_id` has the FK but **no ON DELETE CASCADE**.
- `score_predictions.studio_output_id` is a logical FK with **no constraint declared**.
- `cost_ledger.user_id`, `sprint_id`, `job_id` — all logical FKs with **no constraints declared**.

PG migration is the right time to add them with explicit cascade/restrict policies.

### F4. Enum candidates
At least 25 columns hold a small fixed set of strings (`status`, `role`, `plan`, `severity`, `format`, `confidence`, `urgency`, `category`, `stage`, `gateway`, `objective`, `type`, `source`, `content_type`, `agent_type`, `entity_type`, `frequency`, `date_preset`). PG enum types tighten the contract and shrink the row.

### F5. Boolean-as-INT
`onboarding_complete`, `cancel_at_period_end`, `read`, `is_active`, `used`, `enabled`. PG migration → real `boolean`.

### F6. Date/time consistency
All timestamps are `TEXT` with `datetime('now')` defaults. PG migration → `timestamptz NOT NULL DEFAULT now()`. The current code stores ISO-8601 strings, so the cast is straightforward.

### F7. Stale rows / TTL gaps
No background sweep for: expired `password_reset_tokens`, expired `team_invitations`, old `dna_cache` entries, old `url_analysis_cache` entries, completed `creative_jobs`, resolved `score_predictions`. Phase 3 queue should own these.

### F8. Schema fragmentation
40 tables split across 4 source files (`schema.ts`, two scripts, two lazy-create call sites). Phase 2 must consolidate everything into `drizzle-kit` migrations as a single source of truth, and the seed-brand script must become a one-time migration with a real onboarding API behind it.
