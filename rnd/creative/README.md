# rnd/creative/ — Creative Studio experiment

Standalone CLI that turns an ad account's winning campaigns into an **AI-decided
Brand Kit** (logo, palette, tone, do/don'ts) and then **on-brand image ads** from
text prompts. A throwaway R&D harness to de-risk the vendors before integrating
into `apps/ai-layer`. Nothing here imports from `apps/`.

Design + vendor research: `dev_reports/ai_serv/creative/`.

## Pipeline

```
campaigns (by metric) -> brand_brain (Gemini/OpenRouter) -> BrandKit JSON
                                  -> logo (image model)        -> logo.png
   mode=review: stop, edit brand_kit.json, resume
   mode=auto:   -> N concepts -> prompts -> images (Nano Banana 2 -> FLUX fallback)
```

## Layout

```
src/
  config.py          repo-root .env + model IDs (constants, not env)
  schemas.py         BrandKit / AdConcept / RunManifest (pydantic)
  campaign_select.py pick + summarize source campaigns (reuses rnd/src meta_transform)
  brand_brain.py     summary -> BrandKit + ad concepts (OpenRouter JSON)
  prompt_builder.py  concept + kit -> on-brand image prompt (consistency glue)
  image_providers.py Nano Banana 2 (google-genai) -> FLUX.2 (fal) fallback
                     + cloudflare (free FLUX.1 schnell, no card)
  video_providers.py Veo 3.1 (google-genai) -> Seedance 2.0 (fal) fallback  [gated]
  logo.py            generate the logo once, re-reference it on every ad
  ledger.py          per-call cost estimates (JSONL)
  pipeline.py        orchestration (run / resume / video_smoke)
  main.py            CLI entry
tests/               mock-tested; no SDKs or spend required
```

SDK imports (`google-genai`, `fal-client`, `PIL`) are **lazy** (inside the provider
functions), so the module tree imports and the full test suite runs without them.

## Setup

Uses the repo's `cos/` venv. From the repo root:

```powershell
cos\Scripts\python.exe -m pip install -r rnd\creative\requirements.txt
```

Keys are read from the repo-root `.env`. `OPENROUTER_API_KEY` already exists (the
brain). For a **live** run add the two new keys (both need billing enabled — no free
tier; see the vendor doc / the free-tier doc for alternatives):

```
GEMINI_API_KEY=...   # https://aistudio.google.com/apikey   (Nano Banana 2 + Veo)
FAL_KEY=...          # https://fal.ai/dashboard/keys         (FLUX + Seedance)
```

**Free image path (no card):** Cloudflare Workers AI runs the whole pipeline at $0
(draft-quality FLUX.1 schnell). Add these instead and use `--image-provider cloudflare`:

```
CLOUDFLARE_ACCOUNT_ID=...   # dashboard URL
CLOUDFLARE_API_TOKEN=...    # Workers AI token
```

## Run (from inside `rnd/creative/`)

```powershell
# tests (offline, free)
python -m pytest tests

# auto: kit + logo + 4 on-brand images from top-ROAS campaigns
python src\main.py --data ..\data\_real_sample.json --select top-roas --images 4

# same run for FREE (Cloudflare, no card; draft quality)
python src\main.py --data ..\data\_real_sample.json --image-provider cloudflare --images 4

# review: kit + logo only -> edit output\<run>\brand_kit.json -> resume
python src\main.py --mode review --data ..\data\_real_sample.json
python src\main.py --resume <run_id> --data ..\data\_real_sample.json --images 4

# video smoke (EXPLICIT, costs dollars): Veo -> Seedance fallback
python src\main.py --resume <run_id> --video --video-provider veo --duration 8
```

Outputs (kit, logo, ads, `manifest.json`, `ledger.jsonl`) land in `output/<run_id>/`
(gitignored).

## Notes / decisions

- **Brain via OpenRouter** (already paid/working); only image+video need the new SDKs.
- **Image is near-sync; video is dollars** (Veo 8s/720p ≈ $3.20, Seedance 5s ≈ $1.21–1.51),
  so video is off by default behind `--video`.
- **Consistency** = every prompt carries the same palette/style + the logo as a
  reference image. Logo drift is the known risk to measure (try `--pro` if it wobbles).
- **Temporary output URLs** (Veo 2-day, fal `*.fal.media`) are downloaded immediately.
- Costs are **estimates** from published rates, not billed amounts.
```
