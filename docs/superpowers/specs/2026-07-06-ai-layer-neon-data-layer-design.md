# AI-layer Neon Data Layer (#29, re-scoped) — Design

**Date:** 2026-07-06 · **Branch:** `feat/ai-layer-adapter` · **Status:** awaiting user review (adversarially verified — see "Verified pitfall fixes")

> **Supersedes** `docs/superpowers/specs/2026-07-03-ai-layer-storage-durability-design.md`
> (the SQLite-on-a-Railway-volume approach). The goal moved from "survive a redeploy" to
> **stateless, multi-tenant SaaS-ready**: no volume, horizontally scalable, per-tenant data.

## Goal

Move everything the Python ai-layer persists to local files — the Meta facts store
(`store.sqlite`) and the LLM cost ledger (`cost_ledger.jsonl`) — into the **already-existing
shared Neon Postgres**, behind a robust migration-managed ORM layer. Make the ai-layer
**stateless** (no local write state, no volume) and **fully multi-tenant** (`brand_id` keys
every row and request). Also create the durable **`creative_jobs`** and **`brand_config`**
tables so the creative pipeline is multi-tenant-ready. Creative asset *bytes* → Cloudflare R2
is a **sibling task**, not this one.

## Decisions (all user-approved 2026-07-05/06)

| # | Decision | Choice |
|---|---|---|
| A | Tenant key | **`brand_id`** — repository defaults `brand_id = account_id` until #34 threads real brand identity (no API break) |
| B | ORM / migrations / driver | **SQLAlchemy 2.0 + Alembic + psycopg3 (sync)** |
| C | Namespace | **Dedicated `ai_layer` Postgres schema** on the shared Neon instance (isolated from TS `public`) |
| D | Fallback | **DB required, no SQLite fallback** — `DATABASE_URL`/`MIGRATION_DATABASE_URL` are mandatory |
| E | Scope | **Fully multi-tenant** — brands/accounts/facts/cost_ledger/brand_config **and** `creative_jobs`; `brand_id` threaded through requests |
| F | Tests | **Dedicated Neon `test` branch** (copy-on-write) + per-test transactional rollback |
| G | `creative_jobs` ownership | **G1** — we own the table + repository (`save_job`/`load_job`); the AI engineer wires his `_JOBS`/`_run_job` to it |
| H | Credential multi-tenancy | **H1** — this task delivers full **data** multi-tenancy; per-brand server-side **credential** resolution stays task #34 |

## What the test run already proved (2026-07-06)

The design is validated against live Neon + real data, not assumptions:

- **Python → Neon works** on both endpoints (PG 17.10). Cold connect ≈ **4.5s** (scale-to-zero)
  → the engine needs a `preflight()`/warmup so the first request after idle doesn't eat it.
- **Facts shapes**: 1430 rows, **zero NULLs**, every metric `REAL`, `date` always ISO
  (`YYYY-MM-DD`) → `double precision NOT NULL DEFAULT 0` + `DATE` read back as ISO is safe.
- **cost_ledger keys** exactly `{model, op, account, prompt_tokens, completion_tokens,
  cost_usd, priced}`; `cache_discount_usd` genuinely optional.
- **BrandKit** is a nested object (`brand_name, tagline, palette[], typography{}, tone,
  voice_keywords[], dos[], donts[], visual_style, logo{}`) → `jsonb`.
- **Two distinct cost ledgers**: top-level `cost_ledger.py` (op=`chat`, per-account,
  OpenRouter) vs `creative/ledger.py` (per-run file, per-step fal/OpenRouter/TTS + a TOTAL).
- **SQLAlchemy 2.0 DDL on Neon**: schema isolation confirmed (`public` untouched), the
  **drift-guard matches (20/20 `CampaignDayFact` fields)**, DATE↔ISO round-trips, psycopg3 via
  `postgresql+psycopg://`, and the **pooled/PgBouncer engine with `prepare_threshold=None`**
  all work; clean `DROP SCHEMA … CASCADE` teardown.

Two robustness findings folded into this spec:
1. **`_record_cost` is unguarded** (`chat.py:305`): a ledger-write failure (observed:
   `PermissionError` on a root-owned `cost_ledger.jsonl`) crashes the whole `/chat` request
   with HTTP 500. → `repository.record_cost` MUST be **log-and-continue**; cost accounting can
   never fail insights/chat/creative. (task #47)
2. **`FAL_KEY` is empty** in `.env` → live creative image/video generation is blocked until
   set (task #46, user action). Does not block the data-layer design.

## Tenant model

`brand_id` is the tenant key: a brand fans out to a Meta act + Google customer + Shopify
domain (`apps/connectors/connectors/contract.py:35` `BrandRef`). `account_id` alone is the
current shortcut (`connector_source.py:124-127` sets `brand_id = account_id`, flagged at
`:78-80`). New tables are `brand_id`-keyed; the repository accepts an optional `brand_id` and
defaults it to `account_id` until #34's per-brand `CredentialProvider` threads real identity.

**Request threading (H1):** routes accept an optional `X-Brand-Id` header; the API resolves
`brand_id = header or account_id` and passes it to the repository. When absent, behavior is
identical to today (no API break). A minimal `brands` row is upserted on first
ingest/connector fetch (`brand_id`, `meta_account_id`, `currency`).

## Alignment with the TS Neon setup (reuse, don't fight)

- Reuse env names **`DATABASE_URL`** (pooled PgBouncer, runtime) + **`MIGRATION_DATABASE_URL`**
  (direct/unpooled, DDL only) — identical split to `apps/api/drizzle.config.ts` /
  `apps/api/src/db/pg.ts`.
- Match conventions: **snake_case** columns, **`text`** app-generated ids, **`timestamptz`**
  `created_at`/`updated_at`, `jsonb` on our own tables.
- Our Alembic version table lives in `ai_layer` (`version_table_schema="ai_layer"`), fully
  independent of Drizzle's `__drizzle_migrations` in `public`. Migrations applied **manually**
  (like TS `npm run db:migrate`) — **never on container boot**.
- Runtime engine URL is rewritten to `postgresql+psycopg://` and set
  `connect_args={"prepare_threshold": None}` (PgBouncer transaction pooling rejects prepared
  statements). **The Neon pooled endpoint also rejects an `options=search_path` startup param
  ("unsupported startup parameter"), so search_path is NOT set — every table is schema-qualified
  via `MetaData(schema="ai_layer")`.** Alembic uses the **direct** URL.

## Files

New subpackage `apps/ai-layer/ai_layer/db/`:
- `db/engine.py` — psycopg3 engine + `Session` factory. Rewrites the URL to
  `postgresql+psycopg://`, sets `search_path=ai_layer` via `connect_args` options,
  `prepare_threshold=None` on the pooled engine. **`QueuePool` with `pool_pre_ping=True`,
  `pool_recycle=300`, modest `pool_size=5`/`max_overflow=5`** — pre-ping is REQUIRED because
  Neon scale-to-zero silently kills idle pooled connections (the ~4.5s cold connect proves
  it's active); small pool respects Railway 0.5GB RAM + Neon free connection limits. Engine is
  created **lazily** (not at import). `preflight()` does `SELECT 1` with transient-retry
  (mitigates the cold start + drops). (pitfall #10)
- `db/models.py` — `Base(DeclarativeBase)` with `metadata = MetaData(schema="ai_layer")`;
  models `Brand`, `Account`, `Fact`, `CostLedgerEntry`, `BrandConfig`, `CreativeJob`.
- `db/repository.py` — the data functions `store.py`/`cost_ledger.py` delegate to, plus the
  creative-job seam (G1).
Migrations: `apps/ai-layer/alembic.ini`, `apps/ai-layer/alembic/env.py`
(`target_metadata=Base.metadata`, `version_table_schema="ai_layer"`, `include_schemas=True`;
rewrites the URL to `postgresql+psycopg://`; loads the repo-root `.env`). **CRITICAL (pitfall
#1): `env.py` MUST define an `include_name`/`include_object` hook that restricts autogenerate
comparison to `schema == "ai_layer"` (+ the version table) — otherwise `include_schemas=True`
reflects `public`/`drizzle` and emits `DROP TABLE` for all 80 TS tables.** The hand-reviewed
`apps/ai-layer/alembic/versions/0001_*.py` runs `op.execute("CREATE SCHEMA IF NOT EXISTS
ai_layer")` **first** (Alembic won't create it, and the version table needs it to exist), then
all tables + indexes.
Rewired to thin shims (signatures unchanged): `ai_layer/store.py`, `ai_layer/cost_ledger.py`.
Deps added to `apps/ai-layer/pyproject.toml`: `sqlalchemy>=2.0`, `psycopg[binary]>=3.2`,
`alembic>=1.13`.
Docs/config: `apps/ai-layer/Dockerfile` env comment + root `.env.example` gain
`DATABASE_URL`/`MIGRATION_DATABASE_URL` as **required**;
`temp_docs/ai-eng-adapter-notes.md` updated (facts/ledger now Neon; `brand_config` +
`creative_jobs` tables + the `save_job`/`load_job` seam he wires).

## Schema (`ai_layer` schema, all `brand_id`-keyed)

- **brands** — `brand_id text PK`, `brand_name`, `meta_account_id`, `google_customer_id`,
  `shopify_domain`, `currency`, `created_at`, `updated_at`. (Mirrors `BrandRef`; reconciling
  with TS `public.brands`/`service_clients` is a documented follow-up, not this task.)
- **accounts** — `brand_id text`, `platform text`, `account_id text`, `account_name`,
  `currency`, `updated_at`; PK `(brand_id, platform, account_id)`. (Generalizes today's
  meta-only `accounts`.)
- **facts** — `brand_id`, `platform`, `account_id`, `campaign_id`, `campaign_name`,
  `date date`, the **20 CampaignDayFact metric/dim columns** as `double precision NOT NULL
  DEFAULT 0`, `updated_at timestamptz`; PK `(brand_id, platform, account_id, campaign_id,
  date)`; index `(brand_id, date)`. A unit test asserts ORM metric/dim columns ==
  `fields(CampaignDayFact)` (drift guard — proven to match). `date` stored as DATE, read back
  as ISO string.
- **cost_ledger** — `id bigint generated-identity PK`, `brand_id text NULL`,
  `account_id text NULL`, `model text`, `op text`, `prompt_tokens int`,
  `completion_tokens int`, `cost_usd double precision`, `priced text`,
  `cache_discount_usd double precision NULL`, `created_at timestamptz`; index
  `(brand_id, created_at)`. `total_usd` becomes an indexed `SUM`. **Scope (from TS-conflict
  analysis):** this table owns **AI-layer-originated cost** (chat + insights + creative). It is
  NOT total tenant LLM spend — TS `createMessage` cost stays in TS `public.cost_ledger` (it
  feeds the daily-cap query and must remain). Unified TS+Python cost is a coordinate-later
  item, not this task. Creative cost lands here as **one roll-up row per job** (`op="creative"`,
  = job total; AI-eng writes it via the seam), with the per-step breakdown in
  `creative_jobs.ledger_json` (OQ4).
- **brand_config** — `brand_id text PK` (FK brands), `brand_kit_json jsonb NULL`,
  `updated_at`. Durable, reusable per-brand brand kit (identity). Repository read/write
  shipped; wiring into the creative pipeline is the AI engineer's.
- **creative_jobs** (G1) — `job_id text PK`, **`brand_id text NULL`** (FK brands),
  `account_id text NULL`, `status text`, `stage text`, `request_json jsonb`,
  `brand_kit_json jsonb NULL` (the kit used for *this* job), `assets_json jsonb`,
  `video_json jsonb NULL`, `winners_json jsonb`, `rejected_json jsonb`, `progress_json jsonb`,
  `ledger_json jsonb NULL` (per-op creative cost breakdown), `cost_usd double precision`,
  `error text NULL`, `created_at`, `updated_at`; index `(brand_id, created_at)`. Columns mirror
  the in-memory `_JOBS` record (service.py:136). **`brand_id` is NULLABLE (OQ1):** account-mode
  jobs get `brand_id = account_id`; **brief-mode jobs have no tenant id** (only free-text
  `brand_name`) and are brand-unattached until #34 — documented in
  `docs/superpowers/future_feats.md`; tightened to `NOT NULL` in #34. This is the Python-side
  durable job record (replacing the ephemeral `_JOBS`); it **complements** TS
  `studio_generations` (the UI's projection + byte-proxy, which stays) — reconciliation is a
  coordinate-with-AI-eng follow-up. **We create the table + repository; the AI engineer wires
  `_JOBS`/`_run_job` to it** (out of scope here).

## Repository functions

- `upsert_dataset(ds, brand_id=None)` → **batched** multi-row `INSERT…ON CONFLICT DO UPDATE`
  for facts (+ account upsert refreshing `account_name`/`currency`/`updated_at`). **Pitfall #9:
  the current SQLite path is per-row (`store.py:63`); over Neon ~1400 round-trips would risk the
  120s ingest deadline — MUST batch into one statement.** ON CONFLICT updates **all** columns
  (SQLite `INSERT OR REPLACE` semantics). Returns the row count (= `len(ds.facts)`), same as
  `store.upsert_dataset`. Also upserts a minimal `brands` row.
- `load_dataset(account_id, since=None, until=None, brand_id=None)` → SELECT facts + account,
  rebuild `mt.Dataset`. **Contract-fidelity (agent-verified, must reproduce exactly):**
  `source="store"` + `level="campaign"` literals; `date` returned as an **ISO string** (cast
  `.isoformat()`); `since`/`until` **derived from `min`/`max` of the returned facts** (not the
  args, not stored), empty→`None`; `account_name` fallback = `account_id`, `currency` fallback
  = `"INR"`; `ORDER BY campaign_name, date`; empty account → valid `Dataset(facts=())`, never
  raises (api.py:100 relies on `len(ds)`). Filters on **both** `brand_id` and `account_id`
  (pitfall #6).
- `record_cost(...)` — **wrapped in try/except: log-and-continue, never raises** (finding #1);
  **returns the call's own cost** so callers use it directly instead of a global-SUM delta
  (pitfall #5 — the `total_usd(after)-total_usd(before)` pattern in `api.py` corrupts under
  concurrency on a shared DB and must be replaced by the returned value).
- `total_usd(brand_id=None, account=None)` — indexed `SUM`. **The `/cost` endpoint requires a
  resolved scope (OQ3, pitfall #3): no unscoped global default in the HTTP path** (would sum
  every tenant); an unscoped total stays available only to internal/REPL callers.
- `get_brand_config(brand_id)` / `upsert_brand_config(brand_id, brand_kit)`.
- `save_job(job: dict, brand_id=None)` / `load_job(job_id, brand_id=None) -> dict | None` /
  `list_jobs(brand_id, limit=50)` — the G1 seam for the AI engineer. `load_job` filters by
  `brand_id` when supplied (pitfall #7); runs in a **fresh `Session`** (called from a
  BackgroundTask thread).
- `store.py`/`cost_ledger.py` keep their **exact public signatures** and delegate here, so
  `api.py:99,223,228` and `chat.py:305` are untouched (a new optional `brand_id` is threaded
  through where the header is available).

## Migration mechanism

Author models → `alembic revision --autogenerate` → review SQL → `alembic upgrade head`
against `MIGRATION_DATABASE_URL` (direct). Provide `python -m ai_layer.db.migrate` wrapping
`alembic upgrade head` for deploy/demo. Documented in the ai-layer README; **not** run on boot.

## Testing (dedicated Neon `test` branch)

- `tests/conftest.py`: session fixture points the two URLs at the **Neon `test` branch**
  (copy-on-write, prod-isolated) — **the maintainer creates the branch and supplies its
  `DATABASE_URL`/`MIGRATION_DATABASE_URL`** (OQ2). Runs `alembic upgrade head` once, guarded by
  `preflight()` (`SELECT 1` + transient-retry). Per-test fixture opens a connection +
  transaction, binds the `Session`, **rolls back at teardown** (SQLAlchemy
  join-external-transaction) — isolation without re-migrating. *Documented CI fallback (no
  branch/MCP automation): a throwaway `ai_layer_test` schema created + dropped in the session,
  already spike-proven safe (public untouched).*
- Migrate the ~19 file-path-monkeypatching tests (`test_store.py`, `test_cost_ledger.py`,
  `test_api.py`, `test_connector_source.py`) to the DB-session fixture.
- New `tests/test_db_models.py` (drift guard + schema is `ai_layer`), `tests/test_repository.py`
  (dataset round-trip, cost record/total, brand_config r/w, save_job/load_job round-trip),
  `tests/test_db_engine.py` (search_path set, preflight retry, `record_cost` swallows a write
  failure without raising).
- Targets: connectors **47** unchanged; ai-layer suite green on the test branch (previous
  180/7 rebalanced as file-store tests become DB tests + new db tests added).

## Verification (end-to-end)

1. `alembic upgrade head` on the Neon test branch → `\dt ai_layer.*` shows brands/accounts/
   facts/cost_ledger/brand_config/creative_jobs + `ai_layer.alembic_version`; `public` untouched.
2. Full pytest green against the test branch.
3. Docker (bundled #30 image) run with `-e DATABASE_URL -e MIGRATION_DATABASE_URL`:
   `POST /ingest/{account}` → row in `ai_layer.facts`; `GET /insights?source=store` returns it;
   `GET /cost` sums from `ai_layer.cost_ledger`; **restart container → data persists** (no
   volume); no `store.sqlite`/`cost_ledger.jsonl` written to disk.
4. Isolation grep: only `ai_layer/db/*` imports sqlalchemy/psycopg/alembic; connectors clean.

## Verified pitfall fixes (adversarial review 2026-07-06)

Two Opus/general-purpose audits + a live spike verified the design against the real code.
Non-negotiable fixes now baked into the sections above:

1. **Alembic `include_name`/`include_object` filter** → autogenerate never touches
   `public`/`drizzle` (else it drops all 80 TS tables). *(Migration mechanism)*
2. **`0001` runs `CREATE SCHEMA IF NOT EXISTS ai_layer` first.** *(Migrations)*
3. **`/cost` requires a resolved scope** — no unscoped global default in the HTTP path. *(Repo / OQ3)*
4. **Per-call cost from `record_cost`'s return value**, not a global-SUM delta (concurrency-safe). *(Repo)*
5. **Facts queries filter `brand_id` + `account_id`**; PK includes `brand_id`. *(Schema / Repo)*
6. **Batched multi-row upsert** (not per-row) to stay under the 120s ingest deadline. *(Repo)*
7. **`pool_pre_ping=True` + `pool_recycle` + small pool** for Neon scale-to-zero. *(engine.py)*
8. **`record_cost` log-and-continue** (never fails the primary op). *(Repo, task #47)*
9. **Contract-fidelity checklist** for `load_dataset` (derived since/until, `"INR"`/account_id
   fallbacks, `date` as string, all-columns ON CONFLICT, `ORDER BY campaign_name,date`). *(Repo)*
10. **Connector snapshot cache key gains `brand_id`** now (OQ5) — structurally consistent with
    the rest of the provisioning; the *credential-identity* half of that key remains #34.

## TS-layer boundary & disposal backlog

Verified by a code-review-graph + grep audit (graph confirmed fresh, tip `9a1f6a2`). Our
`ai_layer` schema has **no DDL collision** with TS `public`; all overlaps are conceptual
source-of-truth. **This task changes no TS code.** The audit produced a disposal/coordination
backlog for later (tracked as task #48, not #29):

- **Dispose later (duplicate the Python pipeline, but each has live readers — retire as a
  unit):** the legacy TS generator `processGeneration` in `creative-studio.ts:302-507` (dead
  whenever `AI_LAYER_URL` is set); `job-queue.ts` + `creative_sprints`/`creative_jobs`/
  `creative_assets` + creative rows in TS `cost_ledger`; the read-only orphan facts tables
  `daily_metrics`/`creative_returns`/`ltv_by_creative`.
- **Must stay (legit TS-only):** `llm-gateway.ts` `createMessage` + its LLM `cost_ledger` rows
  (daily-cap enforcement); `creative-gen-client.ts` + the `/creative-studio/asset/*` byte proxy;
  `studio_generations`/`studio_outputs` + `processGenerationViaAiLayer`; `campaigns` drafts +
  operator-feedback/reality-testing tables.
- **Coordinate with AI-eng:** unified TS+Python cost aggregation; facts/creative-DNA
  (`dna_cache`/`creative_analysis`) writer ownership; insight generation
  (`ad-watchdog`/`report-agent`) → Python while delivery/execution stays TS.
- **Leave alone:** the `intelligence-integration.ts` no-op seam (keep the stub; do NOT revive
  the dormant TS brain — it would duplicate Python `/insights`).
- **Caveat:** no live 6h Watchdog cron exists on this branch (manual triggers only); the
  CLAUDE.md "6h cron" describes `main`/prod — verify against the deploy target before acting.

## Out of scope (explicit)

Creative asset bytes → Cloudflare R2 (sibling task) · wiring `_JOBS`/`_run_job` to
`save_job`/`load_job` and `brand_config` into the creative pipeline (AI engineer) · full
`brand_id` request-threading beyond the header default + **per-brand credential resolution
(#34)** · reconciling `ai_layer.brands` with TS `public.brands`/`service_clients` · **disposing
the duplicate TS modules (task #48)** · Railway service/volume creation (#32) · other TS-side
changes · multi-worker uvicorn.
