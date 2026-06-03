> **Status: 📖 REFERENCE (2026-05-31)** — accurate reverse-engineered schema for the 10 hidden AI tables; fed DB-1.
> _Body unchanged; status added in the 31_05 dev_reports consolidation. Terms per `dev_reports/VOCABULARY.md`._

# Schema Reverse-Engineering Report — 10 Hidden AI Tables

**Branch:** `db-migration`
**Date:** 2026-05-29
**Scope:** SQLite → Postgres + Drizzle migration prep
**Source files analyzed:**
- `server/src/services/ad-watchdog.ts`
- `server/src/services/intelligence-infrastructure.ts`
- `server/src/services/learning-engine.ts`
- `server/src/services/pattern-transfer.ts`
- `server/src/services/unified-agent-runner.ts`

Citations are `file:line`. Evidence strength legend:
- **C** = explicit `CREATE TABLE` found
- **W** = INSERT/UPDATE writes
- **R** = SELECT reads only (orphaned)

---

## 1. `creative_analysis` — strength: **C + W**

`CREATE TABLE` at `services/ad-watchdog.ts:695`, INSERT at `:781`, DELETE-by-client at `:778`, index on `client_id` at `:714`.

| Column | SQLite type | Postgres / Drizzle | Notes |
|---|---|---|---|
| `id` | TEXT PRIMARY KEY | `text` PK | `crypto.randomUUID()` — switch to `uuid` PK with `defaultRandom()`. |
| `client_id` | TEXT | `text` FK → `users.id` | Indexed. Used in `DELETE … WHERE client_id = ?`. |
| `ad_id` | TEXT | `text` | Meta ad id. |
| `ad_name` | TEXT | `text` | |
| `creative_type` | TEXT | `text` | Output of `detectCreativeType()` — candidate for enum. |
| `hook_text` | TEXT | `text` | Truncated to 150 chars at `:800`. |
| `hook_pattern` | TEXT | `text` | Output of `categorizeHookPattern()` — candidate for enum. |
| `ctr` | REAL | `numeric` / `doublePrecision` | |
| `spend` | REAL | `numeric(12,2)` | |
| `impressions` | INTEGER | `integer` / `bigint` | |
| `image_url` | TEXT | `text` | Nullable. |
| `video_id` | TEXT | `text` | Nullable. |
| `analyzed_at` | TEXT DEFAULT `datetime('now')` | `timestamptz` DEFAULT `now()` | ISO string today; convert. |

**Keys:** PK `id`; logical FK `client_id`. **JSONB candidates:** none. **Indexes to recreate:** `(client_id)`.

---

## 2. `decision_traces` — strength: **W (no CREATE)**

INSERT at `services/intelligence-infrastructure.ts:211`, SELECT at `:245`, aggregate at `:449`. Row shape mirrored by the read path at `:250-268`.

| Column | Inferred type | Notes |
|---|---|---|
| `id` | TEXT PK | |
| `client_id` | TEXT | FK → users; indexed by query `WHERE client_id = ? AND date(created_at) = ?`. |
| `agent_type` | TEXT | |
| `decision_id` | TEXT NULL | Looked up at `:245` (`WHERE decision_id = ?`) → needs index. Likely FK → `agent_decisions.id`. |
| `steps_json` | TEXT (JSON) | **JSONB candidate** — `JSON.stringify(trace.steps)` at `:221`. |
| `evidence_json` | TEXT (JSON) | **JSONB candidate** — array of evidence objects. |
| `alternatives_json` | TEXT (JSON) | **JSONB candidate**. |
| `final_action` | TEXT NULL | |
| `final_target` | TEXT NULL | |
| `final_confidence` | REAL / INTEGER NULL | Numeric, used in display as `%` (`:293`). |
| `final_reasoning` | TEXT NULL | |
| `total_duration` | INTEGER | ms; averaged at `:448`. |
| `data_sources` | TEXT (JSON) | **JSONB candidate** — `JSON.stringify(dataSourcesUsed)`. |
| `synthesis_depth` | INTEGER | Averaged at `:447`. |
| `created_at` | TEXT DEFAULT `datetime('now')` | → `timestamptz`. Used with `date(created_at) = ?` — Postgres `created_at::date = $1`. |

**Keys:** PK `id`; FKs `client_id`, `decision_id`. **Indexes:** `(client_id, created_at)`, `(decision_id)`.

---

## 3. `evaluation_metrics` — strength: **W**

INSERT with `ON CONFLICT(date, client_id) DO UPDATE` at `services/intelligence-infrastructure.ts:465-475`, SELECT trend at `:502`. The TS interface at `:329-358` is the authoritative column list.

| Column | Type | Notes |
|---|---|---|
| `date` | TEXT (ISO date) | → `date`. Part of composite unique key. |
| `client_id` | TEXT | FK → users. Part of composite unique key. |
| `decisions_generated` | INTEGER | |
| `decisions_passed` | INTEGER | |
| `decisions_filtered` | INTEGER | |
| `avg_confidence` | REAL | |
| `contradictions_detected` | INTEGER | |
| `human_reviews_created` | INTEGER | |
| `human_reviews_resolved` | INTEGER | |
| `human_reviews_pending` | INTEGER | |
| `predictions_generated` | INTEGER | |
| `predictions_verified` | INTEGER | |
| `predictions_correct` | INTEGER | |
| `prediction_accuracy_rate` | REAL | 0–1. |
| `filter_rate` | REAL | 0–1. |
| `evidence_quality_avg` | REAL | |
| `synthesis_depth_avg` | REAL | |
| `avg_decision_time` | REAL | ms. |

**Keys:** No explicit PK in code; **`UNIQUE(date, client_id)`** is mandatory (relied on by `ON CONFLICT`). Recommend composite PK `(client_id, date)`. **JSONB candidates:** none — fully columnar. **Indexes:** PK covers the `WHERE client_id = ? AND date >= …` trend query.

---

## 4. `global_patterns` — strength: **C + W**

`CREATE TABLE` at `services/pattern-transfer.ts:52`, INSERT at `:132`, SELECT at `:208`, indexes at `:66` and `:72`, DELETE at `:338`.

| Column | SQLite | Postgres / Drizzle | Notes |
|---|---|---|---|
| `id` | TEXT PK | `uuid` PK | `crypto.randomUUID()`. |
| `pattern` | TEXT NOT NULL | `text` not null | Lookup `WHERE pattern = ? AND category = ?` at `:108` — candidate for composite unique. |
| `category` | TEXT NOT NULL | `text` not null | Indexed. Enum-like (`GlobalPattern['category']`). |
| `confidence` | REAL NOT NULL | `numeric` | Indexed DESC. |
| `source_client_count` | INTEGER NOT NULL DEFAULT 1 | `integer` default 1 | |
| `source_clients` | TEXT NOT NULL | `text[]` recommended | **Stored as CSV today** (`candidates.map(c => c.clientId).join(',')` at `:128`). In Postgres: **prefer `text[]`** over jsonb; matches the access pattern (list of client ids). |
| `created_at` | TEXT NOT NULL | `timestamptz` | ISO string. |
| `updated_at` | TEXT DEFAULT CURRENT_TIMESTAMP | `timestamptz` default `now()` | Not written by any UPDATE in this file — defaults only. |

**Keys:** PK `id`. **Add** `UNIQUE(pattern, category)` — the dedupe lookup at `:108` assumes it. **Indexes:** `(category)`, `(confidence DESC)`. **JSONB candidates:** `source_clients` is the only structured field — recommend `text[]` rather than jsonb.

---

## 5. `human_reviews` — strength: **W**

INSERT at `services/learning-engine.ts:1132`, UPDATE at `:1187`, SELECT at `:1159`, aggregate at `services/intelligence-infrastructure.ts:415`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `review_${ts}_${rand}`. Switch to `uuid`. |
| `client_id` | TEXT | FK → users; primary filter. |
| `type` | TEXT | Enum-like. |
| `title` | TEXT | |
| `description` | TEXT | |
| `severity` | TEXT | Values seen: `critical`, `high`, `medium`, `low` (`:1167`). **Postgres enum candidate.** |
| `related_entity_id` | TEXT NULL | |
| `related_entity_type` | TEXT NULL | |
| `status` | TEXT DEFAULT `'pending'` | Values: `pending`, `reviewed`. **Enum candidate.** |
| `resolution` | TEXT NULL | Written by UPDATE at `:1188`. |
| `reviewed_by` | TEXT NULL | Defaults to `'system'`. |
| `reviewed_at` | TEXT NULL | → `timestamptz`. Used in `date(reviewed_at) = ?` (intelligence-infrastructure.ts:413). |
| `created_at` | TEXT DEFAULT `datetime('now')` | → `timestamptz`. |

**Keys:** PK `id`; FK `client_id`. **JSONB candidates:** none. **Indexes:** `(client_id, status, severity, created_at)` covers the prioritized pending query at `:1165-1168`.

---

## 6. `pattern_store` — strength: **W**

INSERT with `ON CONFLICT(id) DO UPDATE` at `services/intelligence-infrastructure.ts:681`, plus `LIKE`-based similarity search at `:763`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Caller-supplied. |
| `client_id` | TEXT | FK → users; indexed (`findByClient`, `findSimilar`). |
| `type` | TEXT | From `EmbeddablePattern['type']` enum. |
| `content` | TEXT | Free text; searched with `LIKE`. In Postgres: consider `text` + `pg_trgm` GIN index; or `tsvector` for FTS. Comment at `:673` notes future SQLite-vec/Turso vector — long-term this becomes `vector(N)` with pgvector. |
| `metadata` | TEXT (JSON) | **JSONB candidate** — `JSON.stringify(pattern.metadata)` at `:691`, parsed back at `:710`. |
| `created_at` | TEXT DEFAULT `datetime('now')` | → `timestamptz`. |

**Keys:** PK `id` (with explicit `ON CONFLICT(id)` — already declared as PK). **Indexes:** `(client_id, type, created_at DESC)`. **JSONB candidates:** `metadata`.

---

## 7. `predictions` — strength: **W**

INSERT at `services/learning-engine.ts:894`, UPDATE for verification at `:967` and `:982`, SELECTs at `:950`, `:1055`, aggregate at `services/intelligence-infrastructure.ts:431`.

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | `pred_${ts}_${rand}`. |
| `client_id` | TEXT | FK → users; primary filter. |
| `type` | TEXT | Values: `fatigue`, `roas_decline`, `cpa_spike`, `opportunity` (`:1052`). **Enum candidate.** |
| `prediction_text` | TEXT | |
| `confidence` | REAL / INTEGER | Used in `AVG(confidence)` (`:1061`). |
| `timeframe` | TEXT | Free-form string parsed by `parseTimeframeToDays` (`:913`). |
| `expected_metric` | TEXT | |
| `expected_direction` | TEXT | Values: `increase`, `decrease`, `stable` (`:973-975`). **Enum candidate.** |
| `expected_min_change` | REAL NULL | Magnitude threshold. |
| `expires_at` | TEXT | → `timestamptz`. Compared via `expires_at < datetime('now')`. |
| `status` | TEXT DEFAULT `'pending'` | Values: `pending`, `expired`, `verified_correct`, `verified_incorrect` (`:951`, `:967`, `:988`, `:429`). **Enum candidate.** |
| `verified_at` | TEXT NULL | → `timestamptz`. Set by UPDATE at `:984`. |
| `actual_value` | REAL NULL | Set by UPDATE at `:985`. |
| `actual_change` | REAL NULL | Percent. Set by UPDATE at `:985`. |
| `created_at` | TEXT DEFAULT `datetime('now')` | → `timestamptz`. |

**Keys:** PK `id`; FK `client_id`. **Indexes:** `(client_id, status, expires_at)` covers the expiry sweep; `(client_id, type)` covers accuracy stats. **JSONB candidates:** none.

---

## 8. `creative_returns` — strength: **R (orphaned)**

Only a SELECT at `services/learning-engine.ts:249` and an agent runner reference at `services/unified-agent-runner.ts:570-592` that calls `analyzeCreativeReturns()` (defined elsewhere — not in scope).

| Column read | Inferred type | Notes |
|---|---|---|
| `client_id` | TEXT | FK → users (`WHERE client_id = ?`). |
| `creative_id` | TEXT | Aliased to `creativeId`. |
| `creative_name` | TEXT | |
| `return_rate` | REAL | Ordered DESC. |
| `refund_amount` | REAL | Money. |
| `order_count` | INTEGER | |

**Missing context:** **No INSERT, no CREATE, no PK, no `created_at` evidence in these 5 files.** The writer lives outside this file set (likely the Shopify ingestion path / `analyzeCreativeReturns` implementation). Cannot infer:

- Primary key (probably `(client_id, creative_id)` or surrogate `id`)
- Time dimension (is this a snapshot, a rolling 30-day aggregate, or per-day?)
- Whether `creative_id` is a Meta ad id or an internal id
- Any returns-detail fields (`refunded_orders`, `refund_currency`, `period_start`, `period_end`)

→ **Flag for follow-up:** grep the wider codebase for `INSERT INTO creative_returns` / Shopify return-attribution writers before locking the schema.

---

## 9. `daily_metrics` — strength: **R (orphaned)**

Only a SELECT at `services/learning-engine.ts:1023`.

| Column read | Inferred type | Notes |
|---|---|---|
| `client_id` | TEXT | FK → users. |
| `metric_name` | TEXT | Free-form (`pred.expected_metric`). |
| `value` | REAL | |
| `date` | TEXT (ISO date) | → `date`. Ordered DESC. |

**Missing context:** No INSERT, no CREATE in scope. Cannot infer:

- Primary key (almost certainly `UNIQUE(client_id, metric_name, date)`, but not provable here)
- Source-of-truth field (Meta? Shopify? GA?) — there's no `source` column referenced
- Whether values are absolute or normalized
- Currency / unit metadata

→ **Flag for follow-up:** the writer is the analytics ingestion job — find it before migrating, since this table is the entire substrate for `verifyPredictions` accuracy scoring.

---

## 10. `ltv_by_creative` — strength: **R (orphaned)**

Only a SELECT at `services/learning-engine.ts:214` and agent runner references at `services/unified-agent-runner.ts:597-633` calling `analyzeLTVByCreative()` (defined elsewhere).

| Column read | Inferred type | Notes |
|---|---|---|
| `client_id` | TEXT | FK → users. |
| `creative_id` | TEXT | |
| `creative_name` | TEXT | |
| `hook_type` | TEXT | Enum-like. |
| `avg_ltv` | REAL | Money; ordered DESC. |
| `repeat_rate` | REAL | 0–1 probably. |
| `customer_count` | INTEGER | |

**Missing context:** No INSERT, no CREATE. The runner code at `:600-630` reads richer fields from the returned object — `acquisitionSource`, `acquisitionCampaign`, `ltvVsAverage`, `worstCohorts`, `bestCohorts` — but those are computed in the agent, **not** read from this table. So the table itself is narrower than the agent's output. Cannot infer:

- PK (likely `(client_id, creative_id)` or surrogate)
- Cohort time window (90-day LTV? lifetime?)
- Whether `creative_id` matches Meta's ad id or an internal join key
- Refresh cadence / `computed_at`

→ **Flag for follow-up:** locate the Shopify-LTV writer before finalizing.

---

# Cross-cutting recommendations for the Drizzle migration

1. **Foreign keys.** Every table here uses `client_id` as a free `TEXT`. In Postgres, declare `client_id text references users(id) on delete cascade` — the SQLite code has no referential integrity, so verify with a one-time orphan-row check before adding the constraint.
2. **`datetime('now')` defaults.** Replace all `TEXT DEFAULT (datetime('now'))` with `timestamptz default now()`. Application code reads these back as ISO strings — Drizzle's `timestamp({ mode: 'string' })` keeps the wire format identical and avoids touching consumer code.
3. **JSONB conversions (in priority order):**
   - `decision_traces.steps_json` / `evidence_json` / `alternatives_json` / `data_sources` → `jsonb` (rename to drop `_json` suffix while migrating).
   - `pattern_store.metadata` → `jsonb`.
   - `global_patterns.source_clients` → `text[]` (not jsonb — it's a list, not a document).
4. **Enums worth materializing as Postgres enums:** `human_reviews.severity`, `human_reviews.status`, `predictions.type`, `predictions.status`, `predictions.expected_direction`. Optional but tightens contracts.
5. **`ON CONFLICT` clauses already in code** require these unique constraints to exist at create time:
   - `evaluation_metrics`: `UNIQUE(date, client_id)` (or composite PK).
   - `pattern_store`: PK on `id` (already implied).
6. **Date-string predicates** (`date(created_at) = ?`, `date('now', '-X days')`) must be rewritten as `created_at::date = $1` and `now() - interval '1 day' * $1` in the queries — Drizzle won't translate them for you.
7. **Orphaned trio** (`creative_returns`, `daily_metrics`, `ltv_by_creative`) — do **not** finalize their Drizzle schema from this report alone. Each is read by `learning-engine.ts` but the writer is outside the analyzed file set, and the schemas inferred here cover the read columns only. Recommend a follow-up grep over `INSERT INTO {table}` / `CREATE TABLE.*{table}` across the full server tree before declaring them in the migration.
