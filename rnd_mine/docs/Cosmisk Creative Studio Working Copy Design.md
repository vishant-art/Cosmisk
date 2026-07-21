# Cosmisk Creative Studio Working Copy - Design

**Status:** Approved (lemon, 2026-07-21)
**Scope:** A self-contained, runnable implementation of Creative Studio v2 living entirely in `rnd_mine/`, wired to the keys in the repo root `.env`.
**Companions:** `Cosmisk Creative Studio Architecture v2.md`, `Cosmisk Creative Studio Schema Specification v2.md`, `Prompt Architecture & Planning Layer.md` (all in this folder). This document records only what the working copy does differently or pins down concretely; everything not mentioned here follows those three docs.

---

## 1. Locked decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Orchestration | Asyncio in-process engine, not Temporal | No Temporal infra exists. Engine keeps the spec's semantics (durable step state in Postgres, retries, resume, selective regeneration) behind a Temporal-shaped interface so real Temporal can be swapped in later. |
| Database | `creative_studio` schema inside the existing Neon Postgres | Zero new infra. Fully isolated tables; the live product's tables are never touched. DDL via `MIGRATION_DATABASE_URL` (direct), runtime via `DATABASE_URL` (pooler). |
| Media providers | Fal only | FLUX.2 (portraits + keyframes), Seedance (video), Fal TTS (voice), BiRefNet (cutouts), BRIA Product Shot (placement). No Cloudflare Workers AI path, no Gemini. |
| Ingestion | Live Shopify; Meta + Google Ads from recorded fixtures | Shopify keys work today. Google has no credentials. Meta client is live-capable and flips on automatically once `META_AD_ACCOUNT` is set and the token is valid. |

## 2. Deviations from the v2 docs

1. **Video product replacement happens on keyframes, not video frames.** Per shot: generate keyframe (FLUX.2) -> BiRefNet mask + BRIA replacement on the keyframe -> feed the product-true keyframe to Seedance as the image-to-video first frame. Product truth holds in every clip, replacement runs exactly once per shot, and the static ad deliverable reuses the replaced keyframe. Frame-wise CV replacement in video is impractical and expensive.
2. **Embeddings deferred.** A Fal-only stack has no sensible embedding endpoint. pgvector extension and nullable `embedding` columns ship now; retrieval v1 uses plain filtering. The spec marks embeddings optional.
3. **Temporal replaced** as per the locked decision above.
4. **Google Ads is fixture-only** (no credentials exist). The normalizer is real; only the transport is canned.
5. **No branding/logo stage exists at all.** `showBrandLogo` is forced false, logo/watermark/text stay in the global negative prompt, and composition has no overlay step. This is a standing user directive, not a temporary omission.

## 3. Stack

Python 3.11+. Pydantic v2 + pydantic-settings, httpx, `fal-client`, asyncpg directly (no ORM; repositories are simple id + JSONB doc access), boto3 (R2 via S3 API), FastAPI + uvicorn, pytest. `ffmpeg` binary required on PATH; checked at startup with a clear error. Config loads the repo root `.env` by absolute path resolution and strips whitespace from values (one key has a stray leading space). Planning model is a config value (`CREATIVE_STUDIO_PLANNER_MODEL`), defaulting to the GPT-5.4 mini OpenRouter id verified at implementation time.

Env keys consumed (names only): `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `FAL_KEY`, `FAL_ADMIN_KEY` (balance reads only, never on the render path), `SHOPIFY_STORE`, `SHOPIFY_TOKEN`, `SHOPIFY_API_VERSION`, `META_APP_ID`, `META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_AD_ACCOUNT` (optional), `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`, `STORAGE_BUCKET`, `STORAGE_REGION`.

## 4. Layout

```
rnd_mine/
  pyproject.toml
  docs/                      (specs, this design, the implementation plan)
  src/creative_studio/
    config.py                settings, .env resolution, ffmpeg check
    contracts/               base.py + one module per schema (9 total)
    storage/
      db.py                  async engine, session, schema bootstrap
      migrations/            numbered .sql files + runner (runs on MIGRATION_DATABASE_URL)
      repositories.py        insert/get per contract; planning objects are insert-only
      r2.py                  put/get/list, key layout, immutable URIs
    ingestion/
      shopify.py             live GraphQL Admin API client + normalizer
      meta.py                normalizer + fixture transport + live-capable client
      google_ads.py          normalizer + fixture transport
      fixtures/              recorded provider payloads
      brand_profile.py       editable seed for non-derivable brand identity fields
    planning/
      llm.py                 OpenRouter client: schema-enforced output, validate, retry x2
      context_builder.py     token-budgeted planning context assembly
      creative_intelligence.py -> CreativeSpec
      character_generator.py   -> CharacterSheet (+ portrait via image adapter)
      story_planner.py         -> ShotSpec
    prompts/
      registry.py            versioned PromptDefinition loader
      definitions/           YAML per prompt (id, version, system, template, schema ref, changelog)
    generation/
      builders/              deterministic compilers: image, portrait, video, voice
      adapters/              fal_image.py, fal_video.py, fal_tts.py, fal_birefnet.py, fal_bria.py, fal_balance.py
      workers.py             image/video/voice workers consuming GenerationTask views
    orchestration/
      orchestrator.py        compile GenerationTask, fan out, retries, checkpoints
      run_state.py           generation_runs persistence, resume, selective regen
    replacement/pipeline.py  keyframe mask + BRIA placement
    qa/
      checks.py              deterministic technical + structural checks
      vlm_critic.py          optional advisory critic via OpenRouter
      report.py              -> QAReport
    composition/ffmpeg.py    concat, voice mux, SRT subtitles, 9:16 export, thumbnail
    export/exporter.py       R2 upload + AssetManifest
    interfaces/
      cli.py                 python -m creative_studio <command>
      api.py                 FastAPI facade
  tests/
```

## 5. Contracts

All nine schemas from the Schema Specification as Pydantic v2 models sharing a metadata base (`schemaVersion` "2.0", `objectType`, `id`, `createdAt`, `updatedAt`, `status`, `source`). The spec's validation rules are enforced in-model, notably:

- ShotSpec: exactly 3 shots, fixed Hook -> Product -> CTA order, total duration 10s (±0.5), every shot carries camera/narrative/dialogue/character/product/composition, all shots share one character and one product.
- CreativeSpec: exactly one product, one primary objective, one CTA; creative preference and language always present. Immutable.
- CharacterSheet: exactly one primary portrait, wardrobe must not describe the advertised product, `creativeSpecId` required. Immutable.
- GenerationTask: ephemeral, in-memory only, exactly 3 shot tasks, never contains provider payloads.
- AssetManifest: exactly 3 shot clips, 3 keyframes, 1 final video; append-only.
- QAReport: `approvedForExport` cannot be true while any critical issue exists.
- Lineage: `creativeSpecId` present on CharacterSheet, ShotSpec, GenerationTask, AssetManifest, QAReport.

Immutability is enforced at the repository layer: planning and output repos expose insert and get only.

## 6. Data layer

Postgres schema `creative_studio`, one table per persistent contract: `brand_contexts`, `products`, `campaigns`, `creative_specs`, `character_sheets`, `shot_specs`, `asset_manifests`, `qa_reports`. Shape: `id text primary key, doc jsonb not null, embedding vector null, created_at/updated_at timestamptz`. Plus `generation_runs` (orchestrator state: id, creative_spec_id, status, steps jsonb, timestamps) and `schema_migrations`. Bootstrap: `CREATE SCHEMA IF NOT EXISTS creative_studio;` and `CREATE EXTENSION IF NOT EXISTS vector;`.

R2 key layout under the existing `cosmisk-mvp-v1` bucket, all URIs immutable:

```
creative-studio/brands/{brandId}/products/{productId}/original|cutouts|masks/...
creative-studio/runs/{generationId}/portraits/...
creative-studio/runs/{generationId}/keyframes/shot{n}/raw.png + replaced.png
creative-studio/runs/{generationId}/clips/shot{n}.mp4
creative-studio/runs/{generationId}/voice/narration.wav + subtitles.srt
creative-studio/runs/{generationId}/final/ad.mp4 + static.png + thumb.jpg
```

## 7. Ingestion

Shopify live: products, variants, media, pricing, collections, shop metadata via the GraphQL Admin API, normalized per the spec's Shopify mapping table into `Product` and the commerce parts of `BrandContext`. Non-derivable brand identity (tone, positioning, audience, guidelines) comes from an editable `brand_profile` seed file merged during ingestion. Meta and Google fixtures are shaped like the real Graph API / Google Ads API responses and flow through the same normalizers that a live transport would use, producing `Campaign` objects. Creative Preference is a per-request CLI/API input propagated verbatim into `CreativeSpec.generationContext`.

## 8. Planning

One OpenRouter client used by all three planners: sends the target JSON schema, validates the reply against the Pydantic contract, retries at most twice with the validation error appended, then fails the run. Prompts are versioned YAML `PromptDefinition` assets loaded through a registry; every generated object records the producing prompt id + version. Context builder merges BrandContext + selected Product + Campaigns + preference under a token budget. Flow per the docs: CreativeSpec -> CharacterSheet (+ portrait) -> ShotSpec.

## 9. Generation and orchestration

Prompt builders are deterministic compilers per the Prompt Architecture doc (scene/character/camera/environment/lighting/style/composition/quality blocks, standardized global negative prompt). Per-shot execution order: keyframe (FLUX.2) -> replacement (BiRefNet + BRIA) -> video (Seedance, image-to-video from the replaced keyframe). Voice runs in parallel from ShotSpec dialogue. The orchestrator compiles `GenerationTask`, fans shots out concurrently, persists every step transition to `generation_runs`, honors `executionRules.retryLimit`, and supports `resume` and single-shot `regen` without re-running completed steps.

## 10. Cost and safety gates

- Default mode is **dry-run**: full planning plus compiled provider requests written to disk. Zero Fal spend.
- `--live-images` unlocks portrait, keyframes, BiRefNet, BRIA.
- `--live-video` unlocks Seedance, prints an itemized estimate first (3 clips at roughly $1.21 each; full ad roughly $4 to $5 all-in), and requires explicit confirmation before the first paid call.
- Fal balance is read via `FAL_ADMIN_KEY` before and after live runs and the delta reported.
- No logo path exists (section 2, item 5).

## 11. QA and composition

Deterministic-first QA: ffprobe checks (resolution 1080x1920, fps, durations, aspect), structural checks (3 clips, shot order, subtitle timing inside shot bounds), R2 asset existence, and product-presence sanity on replaced keyframes. Optional advisory VLM critic via OpenRouter. Output is a spec-compliant `QAReport`; critical issues block export and produce a regeneration recommendation the CLI can act on. Composition: FFmpeg concat, voiceover mux, SRT subtitles with safe margins, 9:16 export, thumbnail extraction. Export uploads deliverables to R2 and writes `AssetManifest`.

## 12. Interfaces

CLI: `sync-shopify`, `seed-fixtures`, `plan` (dry-run planning), `generate` (with live flags), `regen --shot N`, `status <runId>`. FastAPI facade: `POST /generate`, `GET /runs/{id}`, `GET /runs/{id}/manifest`.

## 13. Testing

Contract validation round-trips (including every "exactly N" rule), normalizer fixture tests, golden-output tests for the deterministic prompt builders, orchestrator tests with fake adapters (retry, resume, selective regen), migration runner test, and one env-guarded live smoke.

## 14. Success criteria

1. Dry-run: from live Shopify data, one command produces a valid CreativeSpec, CharacterSheet, ShotSpec, and compiled provider requests with zero Fal spend.
2. Live run: with confirmation, produces an R2-hosted final 9:16 ~10s MP4, a static ad image, an AssetManifest, and a QAReport, with the real Shopify product visible in every shot.
3. `regen --shot 2` regenerates only shot 2 and recomposes.
4. Test suite green.
