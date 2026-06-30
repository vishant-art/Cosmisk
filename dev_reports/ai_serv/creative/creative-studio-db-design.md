# Creative Studio — Data & Storage Design (what's stored, how, where)

> The persistence design for promoting the creative pipeline into the main repo. Covers:
> (1) where the actual media bytes live, (2) what DB rows are written and to which tables,
> (3) exact column conventions, (4) cost tracking, (5) migrations.
> **STATUS: BUILDING the DB layer (greenlit 2026-07-01).** Decisions locked:
> - **Reuse `studio_generations`/`studio_outputs`** + additive nullable columns (no new table).
> - **Cost: `cost_cents` only** on the generation row (display) + the Python ledger for detail.
>   NO `cost_ledger` rows and NO daily-cap gating for creative (per the earlier "Python ledger" call).
> - **Persist the brand kit + Meta winners** (`brand_kit_json`/`winners_json`); the ai-layer
>   `/jobs` response gains `brand_kit` + `winners` for this.
> - **Object storage is still SEPARATE / NOT in this layer** — bytes stay on the ephemeral ai-layer
>   and are proxied, so stored asset URLs are not durable across an ai-layer redeploy yet.
>
> Concrete column additions + wiring are in §2/§5 below.
> Companion: `creative-studio-integration-plan.md`. Drafted 2026-06-30, building 2026-07-01.

---

## 0. Two kinds of "storage" — keep them separate

| Layer | Holds | Today in apps/api |
|---|---|---|
| **Object storage** (blobs) | the actual PNG / MP4 / logo / brand-kit-thumbnail bytes | **does not exist** — only third-party provider URLs are kept (they expire); audio is written to ephemeral local disk and served at `/audio/` |
| **Relational DB** (Neon Postgres) | metadata: the run, per-format outputs, the asset URL string, copy, QA verdict, scores, cost | `studio_generations`, `studio_outputs`, `creative_jobs`, `creative_assets`, `cost_ledger` |

The pipeline produces real bytes that must outlive fal's expiring URLs (it already downloads
them immediately for that reason). So the **media bytes need a real home** (object storage), and
the **DB stores the durable URL** + metadata. The DB never stores image/video bytes (no base64).

---

## 1. Where the media bytes live (object storage)

**Decision required (Decision 1 in the plan).** apps/api has no bucket today. Recommended:

- A **Cloudflare R2 (or S3) bucket**, e.g. `cosmisk-creative/<user_id>/<generation_id>/<asset>.png`.
- The Python `ai_layer/storage.py` uploads each finished asset right after the pipeline writes
  it locally, and returns a **durable URL** (public CDN URL, or a presigned/proxied URL).
- New env: `CREATIVE_BUCKET`, `S3_ENDPOINT`/`R2_ACCOUNT_ID`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY` (names TBD by the chosen provider).
- Fallback option (b): write to a **Railway volume** mounted on the ai-layer and serve via the
  Python service (mirrors the existing `/audio/` `@fastify/static` pattern). Simpler, but the
  asset URL then points at the Python service and the volume must be mounted (today's audio dir
  is ephemeral).

Whatever is chosen, the **DB only ever stores the resulting URL string**, exactly like
`creative_assets.asset_url` / `creative_jobs.output_url` do today.

---

## 2. DB tables — reuse the existing Studio tables (+ small additions)

The existing `/creative-studio` flow already has the right envelope. We reuse it and add a few
nullable columns (additive migration, no breaking change). All column names below are the
Postgres snake_case (Drizzle keys are camelCase).

### `studio_generations` — one pipeline RUN (the brief/envelope)
Existing columns: `id text PK`, `user_id text NOT NULL`, `brief_json text NOT NULL`,
`formats text NOT NULL`, `meta_account_id text`, `status text default 'generating'`,
`created_at`, `updated_at`.
**Add (nullable, additive):**
| column | type | holds |
|---|---|---|
| `brand_kit_json` | `text` | the AI-decided BrandKit (palette/tone/logo brief + logo asset URL) as JSON |
| `winners_json` | `text` | the Meta winning-creative refs pulled for conditioning (ad_id, roas, asset URL) |
| `concept_count` | `integer` | how many concepts requested |
| `with_video` | `integer` (0/1) | whether a video was requested |
| `cost_cents` | `integer default 0` | rolled-up run cost |
| `error_message` | `text` | populated on a failed run |

### `studio_outputs` — one finished AD (per concept × format, and the video)
Existing columns: `id text PK`, `generation_id text` (→ `studio_generations.id`),
`format text NOT NULL`, `status text default 'pending'`, `output_json text`,
`cost_cents integer`, `error_message text`, `score_json text`.
`output_json` (text JSON) is the natural home for the per-ad payload — it matches what the
Angular `StudioOutput` already consumes. Proposed shape:
```json
{
  "kind": "image" | "video",
  "concept_title": "The Weaver's Legacy",
  "asset_url": "https://cdn/.../ad_01_9x16.png",   // durable, in object storage
  "thumbnail_url": "https://cdn/.../ad_01_9x16_thumb.png",
  "width": 1080, "height": 1920,
  "copy": { "headline": "...", "subhead": "...", "cta_label": "...", "angle": "..." },
  "qa": { "verdict": "pass", "checks": [...] },     // the verifier report (reject = not shipped)
  "background_url": "https://cdn/.../concept_01_bg.png",
  "video": { "duration_s": 10, "audio": true, "voiceover": true }  // for kind=video
}
```
**Add (nullable, additive):** `asset_url text` (promote the URL out of JSON to a first-class
column so the publish-to-Meta path can use it like `creative_assets.asset_url`).

### When a creative is approved/published → `creative_assets` (existing)
On approve/publish (existing route behavior), promote a `studio_output` to a `creative_assets`
row (`asset_url NOT NULL`, `format`, `name`, `predicted_score`, `status`) so it joins the
existing publish-to-Meta path. No change to that table.

### `cost_ledger` (existing) — one row per provider step
```
INSERT INTO cost_ledger (user_id, sprint_id, job_id, api_provider, operation, cost_cents, metadata)
```
For creative we don't use sprints, so `sprint_id`/`job_id` are null (or we set `job_id =
generation_id`). One row per step: `api_provider` ∈ `flux | bria | seedance | minimax | gemini |
fal-ffmpeg`, `operation` ∈ `brandkit | concepts | background | outpaint | qa_vlm | video |
voiceover | audio_merge`, `cost_cents` from the pipeline's ledger math, `metadata` JSON with
`{ generation_id, concept, fmt }`. This is the same shape `services/job-queue.ts`
`writeCostLedger()` uses, so the daily-cap aggregation (`SUM(cost_cents)`) just works.

> **No brand-new tables are strictly required.** The studio envelope + per-output JSON + the
> existing assets/cost tables cover it. If we later want first-class brand-kit reuse across runs
> or a winner-creative cache, those become their own small tables — out of scope for the first cut.

---

## 3. Column conventions (must follow exactly — from `pg-schema.ts`)

- **JSON** → `text()` and the app does `JSON.parse`. Defaults `'[]'`/`'{}'`. **Do not use `jsonb`**
  (reserved for the "locked AI" tables; the studio tables are text-JSON).
- **Booleans/flags** → `integer()` storing `0/1`, checked `=== 1` (e.g. `with_video`). Never a
  real boolean type.
- **IDs** → `text('id').primaryKey()`, app-generated (UUID/nanoid passed in). `serial` PK only for
  append-only logs (`cost_ledger` already is serial).
- **Timestamps** → `timestamp(col, { mode: 'string', withTimezone: true })`, `.defaultNow()` for
  `created_at`/`updated_at`.
- **Scoping** → `user_id text NOT NULL` (FK `→ users.id` cascade for top-level rows; plain text
  soft-link for child rows reached via a parent). `meta_account_id text` for ad-account scope.
- **Indexes** → table-prefixed names for Postgres-wide uniqueness (e.g. `studio_outputs_generation_idx`).
- **Numbers** → `real()` for scores/ROAS, `integer()` for cents/counts.

---

## 4. What is stored where — summary table

| Artifact | Where | Form |
|---|---|---|
| Final ad PNG, video MP4, logo, brand-kit thumbnail | **Object storage** (R2/S3) | binary bytes; URL returned |
| The run / brief / chosen formats / Meta account | `studio_generations` | row + `brief_json` text |
| BrandKit (palette/tone/logo brief) | `studio_generations.brand_kit_json` | text JSON |
| Pulled Meta winning-creative refs | `studio_generations.winners_json` | text JSON (ids, roas, URLs) |
| Per-ad result (copy, QA verdict, asset URL, dims) | `studio_outputs.output_json` + `asset_url` | text JSON + url column |
| Predicted score / breakdown | `studio_outputs.score_json` (+ `score_predictions` if scored) | text JSON |
| Per-step spend (fal + LLM) | `cost_ledger` | one row per step |
| Approved/published asset | `creative_assets` | row with `asset_url` |
| Raw fal/Meta provider URLs (ephemeral) | **not persisted** | downloaded immediately, re-hosted to object storage |

---

## 5. Migrations (the process)

1. Add the new nullable columns to `studio_generations` / `studio_outputs` (and any index) in
   `apps/api/src/db/pg-schema.ts`, following §3 conventions.
2. `npm run db:generate` (drizzle-kit diffs the schema → new `drizzle/NNNN_*.sql`).
3. Review the generated SQL (all additions nullable → safe, no backfill).
4. `npm run db:migrate` (applies via the direct/unpooled `MIGRATION_DATABASE_URL`).
5. Keep the **Test Invariant** green (pg suite 388/10, `tsc --noEmit` baseline, `madge` 0 cycles).
   Schema changes are maintainer-only per the CODE FREEZE.

---

## 6. Open storage decision (mirrors plan Decision 1)

The single new architectural choice is **object storage**. Everything else reuses existing
tables and conventions. Recommended: a Cloudflare R2 bucket with the Python service uploading
and the DB storing durable URLs. Need your confirmation on the provider (R2 vs S3 vs Railway
volume) and whether assets are **public CDN URLs** or **presigned/proxied** (affects how
WhatsApp/HTML reference them).
