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
     → outpaint base bg to other ratios → recomposite → ad_NN_{1x1,4x5,9x16,16x9}.png
   → ledger.jsonl  (every step priced) + TOTAL ; manifest.json
   optional --video: Seedance i2v seeded from the TEXT-FREE bg (copy overlaid after)
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
| `verifier.py` | WCAG contrast + safe-zone + presence + Gemini-vision critic |
| `video_providers.py` | fal-only Seedance i2v/ref2v/t2v (seeded from text-free bg) |
| `logo.py` | generate logo once; composited onto every ad |
| `ledger.py` | per-step pricing (fal computed / OpenRouter actual) + TOTAL |
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

## Cost ledger

- **OpenRouter steps** (brand kit, concepts, VLM critic) record the **authoritative**
  `response.usage.cost`.
- **fal steps** are **computed** from published rates (fal returns no cost): flux-2-flex
  $0.05/MP, flux-2-pro $0.03 first MP + $0.015/extra, bria $0.04 flat, flux-fill $0.05/MP,
  Seedance `(w·h·sec·24)/1024` tokens × $0.014/1k (fal "MP" = 1024², rounded up).
- Every step writes a priced JSONL row; `finalize()` appends a `TOTAL` with a per-op
  breakdown. A typical 3-concept × 3-format run ≈ **$0.6–0.8**. Full pricing detail +
  the "does the API return cost" research is in `creative-vendor-research.md`.

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

# video smoke (gated, $$): Seedance i2v seeded from the text-free background
..\..\cos\Scripts\python.exe src\main.py --resume <run_id> --video --duration 5
```

Outputs land in `output/<run_id>/`: `brand_kit.json`, `logo.png`, `winners/` (pulled
Meta creatives), `concept_NN_bg*.png`, `ad_NN_<fmt>.png`, `manifest.json`, `ledger.jsonl`.

---

## Test inventory

`rnd/creative/tests` — **76 passing**: copy, layout, image_providers (fal + cutout),
saliency, compositor, verifier, ledger, brand_brain (+grounding), pipeline (incl. refs /
product / Meta-winner conditioning, QA reject, multi-format), video_providers.
`rnd/tests` — **35 passing** (incl. `test_meta_creatives` 8), 5 skipped (opt-in live LLM).
Everything is mock-tested at $0.

---

## Status & honest caveats

- **Built and green offline.** No live fal/Meta call has been exercised in tests.
- **Vendor-schema smoke pending:** the exact fal request/response shapes for
  `bria/product-shot`, `birefnet/v2`, `flux-pro/v1/fill` (outpaint), and Seedance are
  coded from vendor research; the first live run validates them (failures degrade
  gracefully — bg→flux_pro, outpaint→resize, video→t2v).
- **Video copy-overlay not implemented:** the video stage produces the clip correctly
  seeded from the text-free background; the ffmpeg lower-third/end-card overlay is a
  documented next step.
- **Meta video `source`** needs a Page-admin / System-User token; with our current token
  we get winning **images** + video **thumbnails** but not owned MP4s (see the access
  probe + `meta-api-creative-asset-retrieval.md`). Competitor creatives are out of scope
  (Ad Library returns text + snapshot only).
- **Meta API version:** code is on **v23.0** (supported); bump to **v25.0** when convenient.

Related docs: `creative-pipeline-fal-rebuild-plan.md` (the plan, now built),
`static-ad-generation-architecture-research.md` (why this shape),
`creative-vendor-research.md` (vendors + pricing + cost-API research),
`meta-api-creative-asset-retrieval.md` (the Meta creative-fetch map).
```
