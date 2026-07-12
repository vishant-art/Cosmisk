# Creative Studio: UGC-Video Integration Plan (Python-only re-sync)

> How the UGC **video** pipeline + fal cost system in `rnd/creative/src/` get promoted into
> the deployed Python service `apps/ai-layer/ai_layer/creative/`. **Python only.** No
> TypeScript (`apps/api`), no DB, no Watchdog wiring, no object storage in this plan.
>
> Supersedes the status claims in `creative-studio-integration-plan.md` (2026-06-30), whose
> "Phase A + C done" applies only to the **static-ad** pipeline. Companion:
> `creative-studio-architecture-and-integration-state.md`,
> `creative-studio-gap-analysis-vs-competitors.md`.

---

## 1. The real gap (verified 2026-07-12)

The 2026-06-30 port copied the **static-ad** studio into `apps/ai-layer` and stopped there.
Everything the UGC video pipeline needs was built in `rnd/creative` **afterward** and never
re-synced. Concretely:

**Deployed fork `apps/ai-layer/ai_layer/creative/` (18 files) has:** the static-ad pipeline
(brand kit -> text-free backgrounds -> deterministic composite -> QA -> multi-format), plus a
small gated single-clip `video_smoke` bolt-on (`pipeline.video_smoke` + `video_post.py`). It
already uses package imports (`from ai_layer.creative import ...`), a FastAPI router
(`creative/service.py`), an in-process async job store, and a `/creative/assets` static mount.

**Missing (the entire UGC video pipeline + cost, 13 modules):** `brain.py`, `story_brain.py`,
`storyboard.py`, `sequencer.py`, `recovery.py`, `editor.py`, `captions.py`, `sfx.py`,
`taxonomy.py`, `teardown.py`, `variants.py`, `verifier_video.py`, `fal_billing.py`.

**Stale-in-the-fork (shared files that are older static-only versions):** `pipeline.py`,
`schemas.py`, `config.py`, `video_providers.py`, `ledger.py`. `rnd`'s versions are supersets
in the video/cost area, so these get **additive** merges, not replacement.

### Good news that shrinks the job
- Deps already present: `fal-client`, `pillow`, `imageio-ffmpeg`. Only `numpy` needs to be
  made explicit (verifier_video/teardown/tests use it; it's already transitive via pandas).
- Dockerfile needs **no** change: the video path shells out to the `imageio-ffmpeg` bundled
  binary, and that wheel is already installed. No system ffmpeg.
- The async job store + `GET /creative/jobs/{id}` + `/creative/assets` mount already exist and
  are reused as-is.
- `fal_billing.py` **no-ops gracefully** without `FAL_ADMIN_KEY`, so it is safe to port even
  before the admin key is set in the service env.

---

## 2. The one hard porting chore: imports

`rnd/creative/src/` uses flat, `sys.path`-injected imports (`sys.path.insert(...)` in ~23 of
28 files; `import config`, `from schemas import ...`, `import fal_billing`, etc. -- 61+
occurrences). The fork's convention is absolute package imports. So **every module that moves**
must have its `sys.path.insert` lines deleted and each flat `import X` rewritten to
`from ai_layer.creative import X`. The two cross-package imports in `pipeline.py`
(`meta_creatives`, `shopify_products`, reached via a second `sys.path.insert` into `rnd/src`)
become `from ai_layer import ...` (the fork already did this for `meta_creatives`).

This is mechanical but touches ~13 new files + the merged shared files. It is the main source
of risk and the main reason to port in reviewable batches, not one dump.

---

## 3. Plan (phased, additive, Python-only)

### Phase 0 - Branch + baseline
- Work on a dedicated branch (continue `improve/creative` or a fresh `feat/ugc-video-integration`).
- Confirm the current ai-layer creative suite is green as the baseline (97 tests: 93 creative
  + 4 service).

### Phase 1 - Schema + config + cost groundwork (additive, no behavior change)
- **schemas.py:** add the video contracts absent from the fork -- `ScriptBeat`, `Script`,
  `Shot`, `Storyboard`, `UGCStyle`, `CaptionWord`/`CaptionCue`/`CaptionStyle`, `SfxCue`,
  `EditPlan`, `ShotBoundary`, `CreativeTemplate`, `RepairStep`/`RepairLog`, `Variant`/`VariantSet`,
  and the `QACheck`/`QAReport` fields (`inconclusive`, `repairable`, `shot_index`,
  `inconclusive()`, `failed_shots()`). All additive; the static `verifier.py` keeps working
  because the new `QACheck` fields have defaults.
- **taxonomy.py:** port as-is (standalone, no intra-package imports beyond stdlib/typing).
- **config.py:** add the video/teardown/caption/temporal-QA/recovery constants and the
  `UGC_STYLE_DEFAULT`/`STUDIO_STYLE` presets. Model IDs already match (Seedance, Whisper,
  MiniMax TTS, fal ffmpeg-merge).
- **ledger.py:** re-sync the cost functions (`video_cost`, `tts_cost`, `asr_cost`, flat
  `merge_cost`, Seedance calibration note).
- **fal_billing.py:** port (new). Reads `FAL_ADMIN_KEY` directly from env; no config wiring
  needed. No-ops when unset.
- **pyproject.toml:** add explicit `numpy`.
- Port the matching tests (`test_schemas`, `test_ledger` additions, `test_fal_billing`,
  taxonomy). Suite green.

### Phase 2 - Port the video-pipeline modules
- Port, with import rewrites: `brain.py`, `story_brain.py`, `storyboard.py`, `sequencer.py`,
  `recovery.py`, `editor.py`, `captions.py`, `sfx.py`, `teardown.py`, `variants.py`,
  `verifier_video.py`.
- **video_providers.py:** re-sync (add TTS voiceover + fal audio-merge muxer if the fork's copy
  lacks them).
- **pipeline.py:** add the video orchestrators (additive) -- `plan_story`, `render_story`,
  `finish_timeline`, `make_variants`, `qa_video`. `render_story` already calls
  `fal_billing.affordable()` (pre-spend guard) and `fal_billing.write_run_actuals()` (post-run
  invoice). Leave the existing `run`/`resume`/`video_smoke` untouched.
- **shopify_products:** `pipeline.run` references it behind `use_shopify`. Port
  `rnd/src/shopify_products.py` into `ai_layer/` (import rewrite to `from ai_layer import
  shopify_products`) and keep `use_shopify` fully wired. Skip nothing (decision, 2026-07-12).
- Port the video/cost test suite from `rnd/creative/tests/` into
  `apps/ai-layer/tests/creative/`, merging the needed conftest fixtures (`_no_live_billing`
  autouse, `synth_video`/`other_video`/`noisy_video`, `fake_words`). Target: the ai-layer
  creative suite reaches parity with rnd's 399 (mock-based, $0).

### Phase 3 - FastAPI surface for UGC video
- Extend `creative/service.py` (reusing `_JOBS` + `GET /creative/jobs/{id}`):
  - `POST /creative/video/plan` -> runs `plan_story` only (LLM-only, **free**): returns the
    Script + Storyboard for review **before** any paid render. This bakes the frugality rule
    into the API: nobody pays Seedance without first seeing the shot list.
  - `POST /creative/video/generate` -> background job: `render_story` -> `finish_timeline`
    (-> optional `make_variants`). Balance-guarded; surface an exhausted balance as a clean
    `402`/`409` with the `affordable()` shortfall, not a 500.
- Reuse the existing `X-API-Key` auth and `X-Meta-Token` header. Assets served from the existing
  `/creative/assets` static mount (ephemeral until the deferred storage phase).
- Add service tests (plan preview, generate-then-poll, balance-guard-refuses).

### Phase 4 - Ops
- Dockerfile: no change needed (confirm imageio-ffmpeg binary resolves at runtime).
- `FAL_ADMIN_KEY`: add to the ai-layer service env (Railway variables) so the balance guard +
  actual-cost reconciliation are live. Optional; the pipeline runs without it (guard disabled).
- Leave `rnd/creative/` in place as the source of truth until the ported video suite is green
  and one live smoke passes (matches decision D7). Do not retire it in this plan.

---

## 4. Constraints honored
- **Python only** -- nothing here touches `apps/api`, Drizzle, `cost_ledger`, or `apps/web`.
- **No Watchdog wiring** -- the performance-loop idea (gap-analysis Gap 8) is explicitly out.
- **Frugal / capped video** -- the free `plan` step + the pre-spend `affordable()` balance guard
  mean no paid render starts blind. `--no-logo` default preserved through `run`/render paths.
- **Reject, don't log** -- `verifier_video` stays fail-closed (strict: inconclusive fails the
  gate); the repair ladder caps then drops.
- **No direct LLM calls** -- all model traffic goes through `brain.py`'s OpenRouter transport.

---

## 5. Decisions (LOCKED 2026-07-12)
1. **Merge strategy for the 5 shared files** -- **additive merge** (add video surface, leave the
   static path byte-for-byte). Not a wholesale `rnd` replacement.
2. **Endpoint shape** -- the dedicated **`/creative/video/plan` + `/creative/video/generate`**
   split (free preview, then paid render).
3. **Shopify** -- **ported and fully wired** (`use_shopify` supported). Skip nothing.
4. **Live verification -- BLOCKED both ways.** The fal balance is exhausted **and** the Meta API
   is temporarily suspended, so neither the paid render path nor Meta-winner grounding can be
   live-checked right now. First cut is verified entirely by the mock suite ($0, no network);
   a live UGC smoke + live Meta grounding wait on a fal top-up and Meta reinstatement.

---

## 6. What I will NOT do until you say "build it"
This is a plan. No code, no file moves, no import rewrites yet. On your go I execute Phase 0->1->2->3,
additively, on a dedicated branch, checking in at each phase boundary with the ported tests green.
