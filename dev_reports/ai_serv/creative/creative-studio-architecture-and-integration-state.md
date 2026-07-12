# Creative Studio: Architecture, State in Main, and Integration Path

> Status: reference doc, written 2026-07-12. Explains how the creative studio works (`rnd/creative`), what already exists in the main app (`apps/`), and the concrete changes needed to make `rnd/creative` the studio the main app actually runs.
>
> Companion docs (same folder): `creative-studio-system-architecture.md` (deep dive), `creative-studio-integration-plan.md` (the M4 port plan), `creative-studio-db-design.md` (persistence), `creative-studio-object-storage-plan.md` (storage), `creative-ugc-orchestration-roadmap.md` (the T1-T11 build log).

---

## TL;DR (read this first)

There are **two copies** of the creative studio in this repo, and they have diverged badly:

1. **`rnd/creative/` (R&D, the good one).** A complete UGC video-ad generator: winning ad -> teardown -> script -> storyboard -> per-shot render with a repair ladder -> ffmpeg edit -> concat -> voiceover/SFX/captions -> temporal QA gate -> A/B variants. Plus a full cost system (estimate ledger + live fal billing reconciliation). 28 modules, ~400 tests. Last changed 2026-07-11.

2. **`apps/ai-layer/ai_layer/creative/` (deployed, the old one).** A fork taken around 2026-07-01, wired end-to-end into the product (Angular UI -> Fastify API -> Python FastAPI service -> asset byte-proxy). But it only carries the **static-ad half plus a single-clip video "smoke"**. It is missing 13 of the R&D modules, including the *entire* storyboard-driven UGC video pipeline, the cost system, and every fix made since July 1.

So the framing of "integrate rnd into main" is **not** "build new plumbing." The plumbing (UI, API routes, a deployed Python service, a stable HTTP job contract, DB tables, an asset proxy) already exists and works. The real work is: **bring the deployed Python service up to what `rnd/creative` now is**, then close a small set of genuinely-missing pieces (durable storage, durable job store, DB persistence of full runs, multi-tenant tokens, connector de-duplication, unified cost tracking).

One clarification that saves confusion: the `services/intelligence-integration.ts` "dormant brain" seam that CLAUDE.md talks about is a **separate subsystem** (strategic analysis of the Watchdog and reports). It has nothing to do with creative generation. Do not couple them.

---

# Part 1: How the Creative Studio Works (`rnd/creative`)

## 1.1 The one founding rule

The generative model **never renders text or a logo**. Copy, captions, and the logo are placed deterministically (Pillow for images, ffmpeg for video) and then verified. Diffusion models smear text, so the studio treats "no text in the prompt" as an invariant (it does not even name "text" or "logo" in the positive prompt, since naming primes the model to draw them; the suppression happens in a negative list). fal is the only image/video provider; the language brain and the vision critic run on OpenRouter.

## 1.2 Two tracks, one brain

The studio has two output tracks that share one identity brain, one provider layer, one cost ledger, and one fail-closed QA philosophy:

- **Static-ad track** (the original): campaigns -> BrandKit -> logo -> text-free background -> Pillow composite -> static QA gate -> multi-format outpaint. Entry: `pipeline.run` / `pipeline.resume`.
- **UGC-video track** (the newer, larger one): teardown -> script -> storyboard -> per-shot render+repair -> ffmpeg edit -> concat -> voiceover/SFX/captions -> temporal QA gate -> variants. Entry: `plan_story` -> `render_story` -> `qa_video` -> `make_variants`.

This doc focuses on the video track, since that is the capability the main app does not yet have.

## 1.3 End-to-end data flow (UGC video)

```
  Meta account (winners + losers)          Shopify store (bestseller product)
            |                                          |
            v  _meta_cohort                            v  _shopify_products
   winners/ (stills feed FLUX,          products/ (featured image -> BiRefNet
   MP4s feed teardown), losers/         cutout -> i2v product seed)
            |                                          |
            +---------------- pickings.json -----------+
            |
            v
   [2] TEARDOWN a top winner MP4  ->  template.json   (CreativeTemplate: shots,
        (frame-diff cuts, ASR hook, VLM classify)      hook, pacing, format)
            |
            v
   [1] BrandKit (identity)  ->  brand_kit.json     [3] logo.png
            |
            v
   [4] SCRIPT (ordered spoken beats)  ->  script.json      (opens on a hook)
            |
            v
   [5] STORYBOARD (shots, durations refitted)  ->  storyboard.json
            |                                        (every beat covered)
            v
   [6/7] PER-SHOT RENDER + REPAIR + EDIT  (the money stage)
        for each shot:
          build prompt -> snap to allowed Seedance duration
          -> CACHE CHECK (renders/gen_<key>.mp4)
          -> Seedance i2v/ref2v/t2v (fal)  [balance-guarded before spend]
          -> trim to plan duration -> ffmpeg edit plan
          -> PER-SHOT QA (verify_shot)  --fail-->  REPAIR LADDER
                                                    (retry -> reprompt ->
                                                     replan -> drop)
            |
            v
   [8] CONCAT (stream-copy, audio dropped)  ->  timeline.mp4
            |
            v
   [9] FINISH: voiceover (TTS) -> SFX -> captions (drift-gated)
            ->  video_captioned.mp4   (the ad that ships)
            |
            v
   [10] TEMPORAL QA GATE (verify)  ->  qa_report.json
        cut/continuity checked on pre-caption timeline.mp4;
        product/caption/vlm checked on the shipped clip
            |
            v
   [11] VARIANTS (single-axis A/B/n)  ->  variants/
            |
            v
   COST RECONCILE: ledger.jsonl (estimate) vs fal invoice -> fal_actuals.json
```

Every stage writes typed artifacts into `output/<run_id>/`. The run is resumable: each entry point reads the prior stage's JSON, so you can plan a storyboard, inspect it, then render.

## 1.4 Stage-by-stage logic

**[2] Teardown (`teardown.py`).** Turns a real winner's MP4 into a typed `CreativeTemplate`. The provenance rule: every field is exactly one of (a) measured from frames, (b) measured from ASR, or (c) classified from a closed set, and nothing else ships (`extra="forbid"`). Shot boundaries come from mean absolute inter-frame difference on a downsampled RGB frame (RGB, not luma, because a red-to-green cut is a large color change but a tiny luma change). The spoken hook is the words before the first cut; the CTA start is the first match against a closed CTA lexicon. Format/hook/camera/lighting are one VLM call over a 3x3 keyframe contact sheet, classified against closed taxonomies (an off-set label raises rather than being invented). It degrades honestly: a silent clip yields `spoken_hook=None`, and a teardown failure never blocks the run.

**[4] Script (`story_brain.generate_script`).** Ordered `ScriptBeat`s from OpenRouter, grounded in the template's brief when present. Word budget is roughly `seconds * 2.4`. Hard invariant: a script must open on a `hook` beat.

**[5] Storyboard (`story_brain.generate_storyboard` + `storyboard.build`).** The model proposes shots, but its durations are **not trusted**: `fit_durations` rescales them in integer tenths so they sum to the target exactly, each shot within min/max bounds. `validate` enforces coverage (every script beat maps to a shot), opens-on-hook, closes-on-CTA, and sum-equals-target. A coverage violation is a failed plan, retried once with the violation as a hint, never patched by inventing a shot. Each `Shot.purpose` is a **foreign key to a ScriptBeat**, which is what makes isolated shot repair possible later.

**[6/7] Per-shot render + edit (`sequencer.py`).** For each shot: build a text-free prompt, snap the duration up to the nearest allowed Seedance value, check the content-addressed cache, call the video provider, trim back to the planned duration, apply the ffmpeg edit plan, then run the per-shot QA. Two seed modes:
- A **hero-product shot** with a product cutout gets an image-to-video "product seed": FLUX regenerates the item on its own (flat-lay or ghost mannequin, person hard-excluded), and that still seeds Seedance i2v. This is what puts the real product on screen without feeding a person into a reference (Seedance rejects references containing people).
- A **sequential-mode shot** gets its predecessor's last frame as a reference-to-video reference for continuity.

**[8] Concat (`editor.concat`).** Stream-copy join (all inputs are already the same codec/geometry), and audio is dropped on purpose: one voiceover runs across the whole timeline and is muxed once, so per-shot audio never gets spliced at the cuts it was meant to hide.

**[9] Finish (`pipeline.finish_timeline`).** Order is enforced: voiceover first (so SFX have something to mix against), then SFX (a punch on the hook, a whoosh on every cut), then captions last (so they are checked against the audio that actually ships). Every step is best-effort except the caption drift gate, which fails closed.

**[10] Temporal QA gate (`verifier_video.py`).** Covered in 1.6.

**[11] Variants (`variants.py`).** Single-axis A/B/n discipline: a `hook_type` axis regenerates matched scripts and re-renders; `caption_style` / `aesthetic` axes recut the finished clip at zero model cost. Two axes at once are rejected (the result would be attributable to neither).

## 1.5 The provider layer and the render cache

**Images (`image_providers.py`, fal-only, all text-free).** `flux` (FLUX.2 flex, up to 10 reference images), `flux_pro`, `product` (Bria product-shot, drops a real product into a generated scene), `cutout` (BiRefNet background removal), `outpaint` (deterministic blur by default, generative fill opt-in). `generate_with_fallback` tries the primary provider and falls through on any error.

**Video (`video_providers.py`, Seedance 2.0 via fal).** The endpoint is picked by inputs: references -> ref2v, a seed image -> i2v, neither -> t2v. `generate_with_fallback` progressively drops **native audio first, then the seed**, because Seedance rejects clips whose auto-generated audio trips its content filter, so audio-off matters more than keeping the seed. Voiceover is fal-hosted MiniMax Speech-02 HD; word-level ASR is fal Whisper (word spans drive both captions and teardown); the audio mux is fal ffmpeg.

**Content-addressed render cache (`sequencer._gen_key`).** A 12-char SHA1 of (prompt, reference basenames, seed basename, duration, resolution, aspect, attempt). The `attempt` is deliberately in the key so a repair re-rolls a fresh render, while a plain re-run of a clean board hits the cache at $0. Cached clips live at `renders/gen_<key>.mp4` (the paid artifact that survives scratch cleanup); trim/edit intermediates live in `.work/` and are deleted on success.

## 1.6 The repair ladder and the QA gate (why this is the hard part)

The core insight: a video model **almost never raises an error**. Seedance confidently returns a wrong-but-plausible clip. So failure is **detected by QA**, not caught as an exception, and recovery hangs off the per-shot gate.

**Repair ladder (`recovery.py`).** On a per-shot QA failure the ladder escalates: `retry` (same prompt, exploit stochasticity) -> `reprompt` (prompt seeded with the QA hint) -> `replan` (a different shot serving the same beat purpose) -> `drop` (redistribute the seconds). A non-repairable blocking check (for example a missing product cutout) stops the board immediately instead of paying to prove the point four times. A global render cap (`RECOVERY_MAX_TOTAL_RENDERS`) bounds the cost of a systematically broken renderer. Independent mode keeps a repair local; sequential mode re-renders the tail because each shot was conditioned on the previous one's last frame.

**Temporal QA gate (`verifier_video.py`).** The studio can verify its own temporal output because it *placed* the cuts and captions and knows the durations, so most checks are arithmetic, not detection. The checks:
- **cut alignment**: detected cuts vs planned cut times (tolerance 0.30s); a count mismatch fails.
- **continuity**: zero-mean normalized correlation across each planned cut; too-high (nothing changed, a stall/duplicate) fails in either mode, too-low (lost the thread) fails only in sequential mode.
- **product presence**: masked correlation of gradient magnitude under the cutout's alpha, for hero-product shots (threshold 0.35); no cutout -> inconclusive and non-repairable.
- **caption/audio drift**: ASR the final mux and compare to the script text (drift <= 0.35).
- **shot motion**: every frame's correlation to the first frame; a frozen shot (the renderer held its seed) is caught.
- **VLM critique**: one vision call returning issues from a closed set only.

**Fail-closed verdict.** `failed = any(hard failure) or (strict and any(inconclusive))`. Inconclusive is not a pass: in strict mode "we could not prove this is good" fails the gate. `strict=False` is the explicit, logged decision to ship unverified. Two recent fixes live here: cut/continuity now run on the **pre-caption `timeline.mp4`** (burned-in per-word captions change every ~0.5s and a frame-diff detector reads each change as a cut), and the product seed now isolates the product so an apparel model is not carried into the ad.

## 1.7 The cost system (two sources of truth)

- **`ledger.py` (a-priori estimates).** fal returns no cost inline, so cost is computed from published rates and written one JSONL row per step to `ledger.jsonl`, with a `TOTAL` row on finalize. OpenRouter costs are the exception: they come back exact and are read, not estimated.
- **`fal_billing.py` (ex-post truth).** Reads fal's actual charges through the Platform API using a separate **`FAL_ADMIN_KEY`** (the render path only ever carries `FAL_KEY`; the admin scope is isolated). It provides: `balance()`, a pre-spend `affordable(n_clips)` guard that `render_story` calls before rendering (this is the guard that prevents the overdraw that once locked the account), and `reconcile()` / `write_run_actuals()` which compare a run's estimate to the invoice over the run's time window and write `fal_actuals.json`. Everything no-ops gracefully when the admin key is absent. Observed reality: the estimate lands about 1% low per Seedance clip, and the whole two-run reconciliation matched the invoice to within a cent once a fal API quirk was handled (the `billing-events` endpoint filters on `start`/`end`, and silently ignores `start_time`/`end_time`).

## 1.8 Schemas and config

All state is typed pydantic contracts (`schemas.py`), flowing identity -> argument -> render -> verify: `BrandKit`, `Script`/`ScriptBeat`, `Shot`/`Storyboard`, `CreativeTemplate`, `RepairLog`, `CaptionCue`/`CaptionStyle`, `EditPlan`/`SfxCue`, `QACheck`/`QAReport`, `Variant`/`VariantSet`, `RunManifest`. Closed vocabularies live in `taxonomy.py` and `coerce` raises on off-set labels. `config.py` holds model IDs as constants (a vendor rename is a one-line edit) plus every tuned threshold, and loads the repo-root `.env` by walking up the tree.

## 1.9 The shared support layer (`rnd/src`) and packaging reality

The creative pipeline imports two modules from `rnd/src/` for data sourcing: `meta_creatives.py` (pulls both ROAS tails of an account, downloads winner stills to condition FLUX and winner MP4s to feed teardown) and `shopify_products.py` (ranks bestsellers by order revenue, downloads the featured image). Both follow the same posture: loud graceful degradation, never block a run.

**Packaging is the friction.** `rnd/` is not an installable package: no `pyproject.toml`, no `__init__.py`, flat module names (`import config`, `import shopify_products`) made resolvable only by runtime `sys.path.insert` calls in `pipeline.py`, `campaign_select.py`, `main.py`, and every test. This works for a CLI but is exactly what integration has to undo.

---

# Part 2: State of the Creative Studio in the Main App (`apps/`)

The main app is a TypeScript/Node monorepo plus two Python services. `server/` is dead (only `node_modules`, no tracked source); the live backend is `apps/api`.

| App | Role | Stack |
|---|---|---|
| `apps/api` | Primary backend: auth, DB, all product routes, serves the SPA | Node + TypeScript, Fastify 5, Drizzle ORM, `pg` (Neon Postgres), JWT |
| `apps/ai-layer` | Python sidecar: RAG chat, brain insights, **and the deployed creative pipeline** | Python, FastAPI + uvicorn, SQLAlchemy + Alembic |
| `apps/connectors` | Python library: one facade `get_snapshot()` / `get_assets()` over Meta + Shopify + Google | Python package `connectors` |
| `apps/web` | Frontend SPA (Creative Studio, cockpit, UGC studio, etc.) | Angular, RxJS |

## 2.1 The main app already ships a Creative Studio

This is the surprise: creative generation is not greenfield. The full path exists and works today:

```
apps/web (Angular)                    apps/api (Fastify/TS)                 apps/ai-layer (Python/FastAPI)
  creative-studio.service.ts  --->  /creative-studio routes           --->  /creative/generate  -> {job_id}
  creative-cockpit / ugc-studio      creative-gen-client.ts (HTTP)          /creative/jobs/{id} (poll)
  <video>/<img> tags          <---  /creative-studio/asset/:job/*   <---   /creative/assets/... (static mount)
                                     (byte-proxy, no JWT on media)
```

- **Frontend** (`apps/web`): features `creative-cockpit`, `creative-engine`, `ugc-studio`, `ai-studio`, `graphic-studio`, `director-lab`; `creative-studio.service.ts` already models `StudioGeneration` with `stage`, `progress[]`, `brand_kit`, `winners[]`, `outputs[]`. This is exactly where generated video would surface.
- **API** (`apps/api`): `routes/creative-studio.ts` exposes generate/status/asset endpoints; `services/creative-gen-client.ts` is a thin, flag-gated HTTP client (`creativeGenEnabled()` = `Boolean(config.aiLayerUrl)`); assets stream back through `GET /creative-studio/asset/:jobId/*` so `<video>`/`<img>` tags load without a JWT header.
- **DB** (Neon, Drizzle, `apps/api/src/db/pg-schema.ts`): `studioGenerations` (with M4 columns `aiJobId`, `stage`, `progressJson`, `brandKitJson`, `winnersJson`, `costCents`), `studioOutputs` (`outputJson`, `assetUrl`, `scoreJson`), `scorePredictions`. Plus a broader creative surface (`creativeSprints`/`creativeJobs`/`creativeAssets`, `ugc_projects`/`ugc_concepts`/`ugc_scripts`, and a set of creative-intelligence tables).
- **Deploy**: three units on the existing infra: `apps/api` (Railway, Node), `apps/web` (Vercel, Angular), `apps/ai-layer` (Railway, Python 3.12, `uvicorn`, its own Dockerfile that already bundles `apps/connectors` and already declares creative deps `pillow`, `fal-client`, `imageio-ffmpeg`).

## 2.2 What the deployed Python pipeline actually does (and does not)

The deployed copy at `apps/ai-layer/ai_layer/creative/` is a **fork frozen around 2026-07-01**. Its public entry points are only `run` (static multi-format ads), `resume`, and `video_smoke` (a single seeded clip). Its FastAPI `service.py` drives those via `/generate` + `/jobs/{id}`.

It is **missing 13 modules** that `rnd/creative` has, which is the entire difference:

| Missing in deployed | What it is |
|---|---|
| `story_brain.py`, `storyboard.py` | script + storyboard planning (the multi-shot plan) |
| `sequencer.py`, `recovery.py` | per-shot render orchestration + the repair ladder |
| `editor.py`, `captions.py`, `sfx.py` | the deterministic ffmpeg editor, per-word captions, SFX |
| `teardown.py` | winner MP4 -> CreativeTemplate |
| `verifier_video.py` | the temporal QA gate |
| `variants.py` | single-axis A/B/n variant sets |
| `taxonomy.py`, `brain.py` | closed vocabularies, shared LLM transport |
| `fal_billing.py` | the live cost/balance/reconciliation system |

Net: **the deployed studio produces static ads and a single smoke clip; it cannot produce the storyboard-driven, QA-gated, multi-shot UGC video ad at all.** That capability, plus the cost system and all fixes since July 1 (QA cut-alignment, product isolation), exist only in `rnd/creative` and are not deployed.

## 2.3 Honest gaps in main (independent of the fork)

- **No durable object storage** anywhere in the repo. Generated assets sit on the ai-layer's local disk and are served by a byte-proxy; they vanish on redeploy. This is the one genuinely new architectural dependency and blocks any outbound client delivery (WhatsApp card, weekly HTML report).
- **In-process job store**: the Python service tracks jobs in a `_JOBS` dict (single uvicorn worker, lost on restart), and `apps/api` polls with an 8-minute deadline. A full UGC render can exceed both.
- **Creative run persistence to the TS schema is partial**: the additive `studioGenerations`/`studioOutputs` columns exist and a run was persisted to Neon on 2026-07-01, but the full-run mapping is not complete.
- **Single global Meta token**: the pipeline reads one `META_ACCESS_TOKEN`; per-user `X-Meta-Token` plumbing is designed but not wired through.
- **Connector duplication**: the creative pipeline fetches Meta creatives and Shopify products with its own code (`meta_creatives.py`, `shopify_products.py`) instead of the canonical `apps/connectors` facade (`get_assets()` / `connectors.shopify`).
- **Split cost tracking**: creative spend records only to the Python ledger, not the TS `cost_ledger`, and is not yet behind a plan-tier daily cap.

---

# Part 3: What It Takes to Integrate `rnd/creative` Into Main

The boundary is already decided and already built: a **separate Python service the Node API calls over HTTP** (the same pattern the analytics/chat layer uses). Porting to TypeScript was considered and rejected (the pipeline is Pillow + fal + ffmpeg + OpenRouter). So integration is not re-architecture; it is **bringing `apps/ai-layer/ai_layer/creative/` up to `rnd/creative`, then closing the gaps in 2.3.**

Ordered by dependency:

### Step 0: Decide the source of truth (the key decision)
Two diverged copies is the root problem. Pick one direction and make it a rule:
- **Recommended**: `rnd/creative` is the source of truth; `apps/ai-layer/ai_layer/creative` becomes a thin deployment wrapper (the FastAPI `service.py` + config) around the ported package. Future studio work happens in one place.
- The alternative (keep editing the deployed copy directly and let `rnd` rot) throws away the entire UGC pipeline and the cost system. Not recommended.

### Step 1: Package `rnd/creative` (unblocks everything)
Convert the loose sys.path script collection into an importable package: add `__init__.py`, a `pyproject.toml`, and rewrite the ~7 `sys.path.insert` sites and flat imports (`import config`) into package-relative imports (`from ai_layer.creative import config`). Replace the walk-up `.env` discovery with the host service's `os.getenv` (config from Railway service variables, not a repo-root `.env`).

### Step 2: Port the 13 missing modules + the recent fixes
Bring `story_brain`, `storyboard`, `sequencer`, `recovery`, `editor`, `captions`, `sfx`, `teardown`, `verifier_video`, `variants`, `taxonomy`, `brain`, and `fal_billing` into the deployed package, along with the July fixes (QA on the pre-caption clip, product isolation) and the balance guard / reconciliation wiring in `render_story`. Bring the tests with them.

### Step 3: Expose the full pipeline through the service
The deployed `service.py` only drives `run` / `video_smoke`. Extend it so a job can run the full video path: `plan_story` -> `render_story` (-> `finish_timeline`) -> `qa_video` -> optional `make_variants`, streaming `stage`/`progress` back through the existing `/creative/jobs/{id}` contract. Keep the HTTP contract stable so `apps/api` and the Angular UI do not change: `POST /creative/generate -> {job_id}`, `GET /creative/jobs/{id}` (status/stage/progress/assets/brand_kit/winners/cost), `GET /creative/assets/{job}/{path}`.

### Step 4: Durable object storage (the one new dependency)
Add an object store (R2 or S3, per `creative-studio-object-storage-plan.md`), upload finished assets, and return durable URLs instead of ephemeral local-disk paths. This is a prerequisite for both surviving a redeploy and any outbound client delivery.

### Step 5: Durable job store + longer renders
Replace the in-process `_JOBS` dict with a durable job table (the ai-layer's own DB), and lift or restructure the 8-minute poll deadline in `apps/api` so a full multi-shot render (minutes per Seedance clip) can complete without the API giving up.

### Step 6: Persist full runs to the TS schema
Map a completed run into `studioGenerations` / `studioOutputs` (columns already designed): brand kit, winners, per-format outputs, `assetUrl`, cost. This is what makes runs show up in the cockpit history and feed the score-prediction join.

### Step 7: Multi-tenant Meta token
Thread the per-request `X-Meta-Token` through the pipeline instead of the global `META_ACCESS_TOKEN`, so a run is scoped to the signed-in client's ad account.

### Step 8: De-duplicate connectors
Point winner-conditioning and product sourcing at the canonical `apps/connectors` facade (`get_assets()` for Meta creatives, `connectors.shopify` for products) instead of `rnd/src/meta_creatives.py` and `shopify_products.py`, so token handling, FX blending, and asset-URL expiry logic live in one place.

### Step 9: Unify cost tracking + secrets
Record creative spend to the TS `cost_ledger` (not only the Python ledger) and put it behind the plan-tier daily cap; keep `fal_billing`'s balance guard as the pre-spend gate. Add the genuinely-new creative secrets to the ai-layer's Railway variables: `FAL_KEY`, `FAL_ADMIN_KEY` (optional, billing reads), and if used `GEMINI_API_KEY`, `CLOUDFLARE_*`, plus the storage bucket creds. The LLM, Meta, and Shopify secrets already exist in the main app's env.

## What is already done (do not redo)
- The deploy shape (a Python FastAPI service on Railway the Node API calls). 
- The HTTP job contract and the asset byte-proxy.
- The Angular Creative Studio UI and its service contract.
- The `studioGenerations` / `studioOutputs` tables and additive M4 columns.
- The creative deps in the ai-layer image (`fal-client`, `pillow`, `imageio-ffmpeg`; bundled ffmpeg, no system ffmpeg needed).

---

## Appendix A: Run artifacts (`output/<run_id>/`)

`manifest.json`, `brand_kit.json`, `template.json`, `pickings.json` (winners+losers+products), `logo.png`, `script.json`, `storyboard.json`, `storyboard_rendered.json`, `repair_log.json`, `renders/gen_*.mp4` (paid raws), `product_seeds/`, `timeline.mp4` (silent), `voiceover.mp3`, `video_captioned.mp4` (the ad), `qa_report.json`, `variants/`, `ledger.jsonl` (estimates), `fal_actuals.json` (invoice reconciliation), plus subdirs `winners/`, `products/`, `teardown/`, `.work/` (scratch, cleaned on success).

## Appendix B: Environment variables

| Var | Used by | Already in main? |
|---|---|---|
| `OPENROUTER_API_KEY` (+ base URL) | language brain + VLM critic | Yes |
| `META_ACCESS_TOKEN`, `META_AD_ACCOUNT` | winner grounding | Yes |
| `SHOPIFY_STORE`, `SHOPIFY_TOKEN`, `SHOPIFY_API_VERSION` | product sourcing | Yes |
| `AI_LAYER_URL`, `AI_LAYER_API_KEY` | Node -> Python bridge + auth | Yes |
| `FAL_KEY` | all fal generation | Creative-only (new) |
| `FAL_ADMIN_KEY` | fal billing reads (optional) | Creative-only (new) |
| `GEMINI_API_KEY`, `CLOUDFLARE_*` | optional image/video paths | Creative-only (new) |
| storage bucket creds (R2/S3) | durable assets (Step 4) | Not yet |

## Appendix C: Module count

`rnd/creative/src/` = 28 modules (full studio, both tracks, cost system). `apps/ai-layer/ai_layer/creative/` = 18 files (17 modules + `__init__.py`: static track + basic video providers + FastAPI `service.py` + `video_post.py`), missing the 13 UGC/cost modules listed in 2.2 while adding `service.py` and `video_post.py` for deployment.
