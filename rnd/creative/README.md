# rnd/creative/ — Creative Studio experiment

Standalone CLI that turns an ad account's winning campaigns into an **AI-decided
Brand Kit** (logo, palette, tone, do/don'ts) and then **finished, multi-format static
ad creatives**. The image model only ever generates a **text-free background**; the
headline, subhead, CTA and logo are **composited deterministically** (Pillow) and the
result is **QA-gated** before it ships. A throwaway R&D harness; nothing imports `apps/`.

Design + research: `dev_reports/ai_serv/creative/` (see `creative-pipeline-fal-rebuild-plan.md`
and `static-ad-generation-architecture-research.md`).

## Pipeline

```
campaigns (by metric)
   -> brand_brain (Gemini/OpenRouter)  -> BrandKit + concepts w/ structured COPY
   -> logo (fal)                       -> logo.png
   mode=review: stop, edit brand_kit.json, resume
   mode=auto, per concept:
     -> layout (template, per format)        -> LayoutSpec (boxes, safe zones)
     -> image bg (fal, TEXT-FREE)            -> concept_NN_bg.png
     -> compositor (Pillow)                  -> copy + logo + scrim + CTA
     -> verifier (contrast/safe-zone + VLM)  -> pass | retry (regen bg) | reject
     -> outpaint base bg to other ratios     -> ad_NN_{1x1,4x5,9x16,16x9}.png
```

**fal is the only image/video provider.** The text brain + the VLM critic run on
OpenRouter; everything generative (FLUX.2, Bria, Seedance) goes through fal.

## Layout

```
src/
  config.py          repo-root .env + fal/OpenRouter model IDs (constants)
  schemas.py         BrandKit / CopySet / AdConcept / LayoutSpec / CompositedAd /
                     QAReport / RunManifest (pydantic)
  campaign_select.py pick + summarize source campaigns (reuses rnd/src meta_transform)
  brand_brain.py     summary -> BrandKit + concepts (each with first-class CopySet)
  layout.py          CopySet + format -> LayoutSpec (template-bounded, safe zones)
  prompt_builder.py  concept + kit -> TEXT-FREE background prompt (+ negative prompt)
  image_providers.py fal-only: flux-2-flex / flux-2-pro / bria product-shot + outpaint
  saliency.py        region busyness -> scrim decision (Pillow edge density; cv2 optional)
  compositor.py      Pillow: wrap/auto-fit copy, scrim, CTA button, logo clear-space
  verifier.py        WCAG contrast + safe-zone + presence checks + Gemini-vision critic
  video_providers.py fal-only Seedance: i2v (seed=text-free bg) / ref2v / t2v  [gated]
  logo.py            generate the logo once; composited onto every ad
  ledger.py          per-call cost estimates (JSONL)
  pipeline.py        orchestration (run / resume / video_smoke)
  main.py            CLI entry
tests/               mock-tested (fal + LLM faked); no SDKs/keys/spend required
```

SDK imports (`fal-client`, optionally `cv2`) are **lazy** (inside the functions that
use them), so the module tree and the full test suite run without them installed.
The compositor needs only **Pillow** (+ a bundled DejaVu Sans from matplotlib, or a
brand font dropped in `assets/fonts/`).

## Setup

Uses the repo's `cos/` venv. From the repo root:

```powershell
cos\Scripts\python.exe -m pip install -r rnd\creative\requirements.txt
```

Keys are read from the repo-root `.env`. `OPENROUTER_API_KEY` already exists (the
brain + the VLM critic). For a **live** run add the fal key (billing enabled):

```
FAL_KEY=...          # https://fal.ai/dashboard/keys   (FLUX.2 + Bria + Seedance)
```

## Run (from inside `rnd/creative/`)

```powershell
# tests (offline, free)
python -m pytest tests

# auto: kit + logo + 4 multi-format ads from top-ROAS campaigns, with the VLM critic
python src\main.py --data ..\data\_real_sample.json --select top-roas --images 4 `
    --formats 1:1,4:5,9:16 --vlm

# review: kit + logo only -> edit output\<run>\brand_kit.json -> resume
python src\main.py --mode review --data ..\data\_real_sample.json
python src\main.py --resume <run_id> --data ..\data\_real_sample.json --images 4

# video smoke (EXPLICIT, costs dollars): Seedance i2v seeded from the text-free bg
python src\main.py --resume <run_id> --video --duration 5
```

Outputs (kit, logo, per-concept text-free backgrounds, composited ads per format,
`manifest.json`, `ledger.jsonl`) land in `output/<run_id>/` (gitignored).

## Notes / decisions

- **Brain + VLM critic via OpenRouter** (already paid); **all** image/video via **fal**.
- **The image model never renders text.** Copy/logo are composited deterministically so
  spelling, brand fonts and exact hex are correct by construction (see the research doc).
- **QA gate is fail-closed** ("reject, don't log"): a creative that fails contrast /
  safe-zone / presence / VLM checks is retried (background regenerated) up to `--qa-retries`,
  then dropped from the run and recorded in `manifest.rejected`.
- **Multi-format** extends one accepted background to other ratios via fal outpaint, then
  re-composites per format (so copy re-fits each safe zone).
- **Video** reuses the **text-free background** (not the finished ad) as the i2v seed, so
  overlaid text is never warped by the video model; copy is added on the clip afterwards.
- **Image is cents; video is dollars**, so video is off by default behind `--video`.
- Costs are **estimates** from published rates, not billed amounts.
```
