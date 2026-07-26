# Creative Studio — Final Architecture (built)

> The canonical architecture of the `rnd/creative/` pipeline as built. Supersedes
> `creative-pipeline-fal-rebuild-plan.md` (the plan) — that's now implemented.
> Status: **BUILT, fully mock-tested ($0). Live vendor I/O needs one smoke run.**
> Last updated 2026-06-25.

---

## What it is

Turns an ad account's **winning campaigns** into finished, multi-format static ad
creatives (and optional video), where the image model only ever generates a **text-free
background** and all copy/logo are **composited deterministically** then **QA-gated**.
For an existing advertiser it can **condition generation on the real winning creatives
and the real product** pulled from the Meta API — so it extends what already converts
instead of inventing blind.

**Generation provider: fal only.** Reasoning (brand brain) + the QA vision critic run on
OpenRouter (`google/gemini-2.5-flash`). The Meta API supplies real conditioning assets.

---

## End-to-end flow

```
            ┌─ Meta API (optional conditioning) ──────────────────────────────┐
            │ meta_creatives: insights(level=ad) → rank by ROAS → creative{}   │
            │   → resolve image hashes / video ids → DOWNLOAD now (URLs expire)│
            │   → winning image refs  (+ a --product image)                    │
            └──────────────┬───────────────────────────────────────────────────┘
                           │ refs / ground_images / product
campaigns (by metric) → brand_brain (OpenRouter, opt. vision-grounded) → BrandKit + COPY
   → logo (fal)                                                         → logo.png
   mode=review: stop, edit brand_kit.json, resume
   mode=auto, PER CONCEPT:
     → layout (template, per format)        → LayoutSpec (boxes, safe zones)
     → background (fal, TEXT-FREE)           concept_NN_bg.png
          · product?  → Bria product-shot (real product, BiRefNet cutout)
          · refs?     → FLUX.2 flex w/ reference images (winning creatives)
          · else      → FLUX.2 flex/pro, blind
     → compositor (Pillow)                   copy + logo + scrim + CTA
     → verifier (contrast/safe-zone/presence + opt. Gemini VLM critic)
          · pass → ship | fail → regen bg (≤ qa_retries) | give up → reject
     → outpaint base bg to other ratios (mask-based fill) → recomposite
                                          → ad_NN_{1x1,4x5,9x16,16x9}.png
   → ledger.jsonl  (every step priced) + TOTAL ; manifest.json
   optional --video: Seedance i2v seeded from the TEXT-FREE bg, 10s, native audio on
        → copy/CTA lower-third burned on (Pillow + bundled ffmpeg)
        → optional voiceover: brain writes script → fal TTS → fal muxer lays it on
```

---

## Module map

**Meta data layer — `rnd/src/`** (shared with the analytics pipeline):
| File | Role |
|---|---|
| `meta_live.py` | Graph API session, token, version, paginated insights |
| `meta_transform.py` | L1 typed contract (`CampaignDayFact`/`Dataset`) |
| `meta_creatives.py` | **NEW** — winning-ad creative retrieval → `CreativeAsset[]` |

**Creative pipeline — `rnd/creative/src/`**:
| File | Role |
|---|---|
| `config.py` | repo-root `.env` + fal/OpenRouter model IDs (fal-only) |
| `schemas.py` | `BrandKit`/`CopySet`/`AdConcept`/`LayoutSpec`/`CompositedAd`/`QAReport`/`RunManifest` |
| `campaign_select.py` | pick + summarize source campaigns (reuses `meta_transform`) |
| `brand_brain.py` | summary (+opt. winner images) → BrandKit + concepts w/ first-class copy |
| `layout.py` | CopySet + format → LayoutSpec (template-bounded, safe zones) |
| `prompt_builder.py` | concept + kit → TEXT-FREE background prompt (+ negative) |
| `image_providers.py` | fal-only: flux-2-flex/pro, bria product-shot, birefnet cutout, flux-fill outpaint |
| `saliency.py` | region busyness → scrim decision (Pillow; cv2 optional) |
| `compositor.py` | Pillow: wrap/auto-fit copy, scrim, CTA button, logo clear-space |
| `verifier.py` | WCAG contrast + safe-zone + presence + Gemini-vision critic (logo-aware) |
| `compositor.py` (`render_overlay`) | transparent copy/CTA lower-third for video overlay |
| `video_providers.py` | fal-only Seedance i2v/ref2v/t2v + native audio + fal TTS + fal muxer |
| `video_post.py` | **NEW** — burn the copy overlay onto a clip (bundled ffmpeg) |
| `logo.py` | generate logo once; composited onto every ad (skippable via `--no-logo`) |
| `ledger.py` | per-step pricing (fal computed incl. ref-MP / OpenRouter actual incl. BYOK) + TOTAL |
| `pipeline.py` | orchestration (`run` / `resume` / `video_smoke` / `_meta_winner_refs`) |
| `main.py` | CLI |

SDK imports (`fal-client`, `cv2`, `requests`) are **lazy**, so the module tree and the
full test suite run with none of them installed. The compositor needs only Pillow
(+ a bundled DejaVu Sans, or a brand font in `assets/fonts/`).

---

## Conditioning modes (the key capability)

The background generator picks its mode once per run; the `refs` seam is wired through
`generate_image`/`generate_with_fallback`:

| Mode | Trigger | Path |
|---|---|---|
| Blind | default | FLUX.2 flex/pro, text prompt only |
| Reference | `--ref <img>` or Meta winners | FLUX.2 flex with reference images (match the winning aesthetic) |
| Product | `--product <img>` | BiRefNet cutout → Bria product-shot (real product into the scene) |
| Meta winners | `--meta-account act_<id>` | `meta_creatives` pulls winning images → used as refs |
| Brand grounding | `--ground` (with `--meta-account`) | vision pass in `brand_brain` over the real winners |

Meta fetch failures (no token, API hiccup) are caught and logged — they **never block a
run**; the pipeline falls back to blind generation.

---

## Video & audio (optional, gated)

`--video` generates one clip and assembles it:
1. **Seedance i2v** seeded from the concept's TEXT-FREE background — default **10s**, 720p,
   with **native audio on** (`generate_audio=true`, free synced ambient/SFX); `--no-audio` to
   silence. i2v → t2v fallback on error.
2. **Copy overlay** (`video_post.add_copy_overlay`): the headline/subhead/CTA (+ optional logo)
   are rendered as a transparent lower-third (`compositor.render_overlay`) and burned on with the
   **ffmpeg bundled by `imageio-ffmpeg`** (no system ffmpeg). Text is never fed to the video
   model — it's composited after, so it stays crisp.
3. **Optional voiceover** (`--voiceover`): `brand_brain.generate_vo_script` writes a time-fit
   script → `fal-ai/minimax/speech-02-hd` TTS (fal-hosted, not ElevenLabs) →
   `fal-ai/ffmpeg-api/merge-audio-video` muxes it on (~free). Music bed is intentionally out of
   scope; lip-sync too. Full options + licensing in `video-audio-research.md`.

---

## Cost ledger

- **OpenRouter steps** (brand kit, concepts, VLM critic, VO script) record the **authoritative**
  cost: `usage.cost`, plus `cost_details.upstream_inference_cost` for BYOK keys (where
  `usage.cost` is 0). The `usage.include` flag is sent so the fields return.
- **fal steps** are **computed** from published rates (fal returns no cost): flux-2-flex
  $0.05/MP **including input reference-image MPs**, flux-2-pro $0.03 first MP + $0.015/extra,
  bria $0.04 flat, flux-fill $0.05/MP, Seedance `(w·h·sec·24)/1024` tokens × $0.014/1k, MiniMax
  TTS $0.10/1K chars, fal muxer ~$0.0002/s (fal "MP" = 1024², rounded up).
- Every step writes a priced JSONL row; `finalize()` appends a `TOTAL` with a per-op breakdown.
  Cost is dominated by reference-conditioned backgrounds (each Meta winner ref adds ~$0.05) and
  video (a 10s 720p clip ≈ $3). Full pricing + the "does the API return cost" research is in
  `creative-vendor-research.md`.

---

## How to run

```powershell
cd "rnd\creative"
..\..\cos\Scripts\python.exe -m pytest tests                       # offline, free

# blind multi-format auto run + VLM critic
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --select top-roas --images 3 --formats 1:1,4:5,9:16 --vlm

# condition on the account's REAL winning creatives (+ ground the brand in them)
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --meta-account act_1738503939658460 --ground --images 3 --formats 1:1,9:16

# drop the real product into generated scenes
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --product .\product.jpg --images 4

# no logo on the ads (logo not generated or composited)
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json --no-logo --images 2

# video (gated, $$): 10s Seedance i2v + native audio + copy overlay + AI voiceover
..\..\cos\Scripts\python.exe src\main.py --resume <run_id> --video --voiceover
```

Outputs land in `output/<run_id>/`: `brand_kit.json`, `logo.png`, `winners/` (pulled
Meta creatives), `concept_NN_bg*.png`, `ad_NN_<fmt>.png`, `manifest.json`, `ledger.jsonl`,
and (with `--video`) `video.mp4` → `video_captioned.mp4` → `video_voiceover.mp4`.

---

## Test inventory

`rnd/creative/tests` — **91 passing**: copy, layout, image_providers (fal + cutout + ref-MP +
mask outpaint), saliency, compositor (+overlay), verifier (logo-aware), ledger (+BYOK +ref-MP),
brand_brain (+grounding +VO script), pipeline (refs / product / Meta-winner / QA reject /
multi-format / no-logo / voiceover), video_providers (+native audio +TTS +mux), video_post.
`rnd/tests` — **36 passing** (incl. `test_meta_creatives` 9), 5 skipped (opt-in live LLM).
Mock-tested at $0; key vendor paths additionally smoke-tested live (see below).

---

## Status & honest caveats

- **Built, green offline, and key paths live-verified.** Live-confirmed: fal flux-2-flex image
  gen + ref-MP cost; Meta winner image fetch (resilient per-asset); Seedance i2v video + native
  audio; the copy overlay (real clip); MiniMax TTS + fal muxer voiceover; BYOK LLM cost capture.
- **Still coded-from-docs (verify on first use):** `bria/product-shot`, `birefnet/v2` cutout, and
  the exact MiniMax `voice_id`. All degrade gracefully on mismatch.
- **Outpaint:** now mask-based (real aspect-ratio extension via `flux-pro/v1/fill`), replacing the
  earlier resize fallback.
- **Meta video `source`** needs Page-admin (the token HAS it for 31 pages incl. clients), so owned
  ad MP4s are downloadable; competitor creatives remain out of scope (Ad Library = text + snapshot).
- **Meta API version:** code is on **v23.0** (supported); bump to **v25.0** when convenient.
- **Not committed yet:** all of the above lives in the working tree on `feat/ai_analy`.

Related docs: `creative-pipeline-fal-rebuild-plan.md` (the plan, now built),
`static-ad-generation-architecture-research.md` (why this shape),
`creative-vendor-research.md` (vendors + pricing + cost-API research),
`meta-api-creative-asset-retrieval.md` (the Meta creative-fetch map).
```
