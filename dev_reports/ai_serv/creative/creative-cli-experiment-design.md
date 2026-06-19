# Creative Studio — Standalone CLI Experiment (design)

> Design doc for `rnd/creative/` (the throwaway R&D harness). Status: **experiment (rnd)**.
> Future home once validated: `apps/ai-layer` studio submodule (Architecture A, Python-centric).
> Kept in sync with the code. Last updated: 2026-06-19.

## Purpose

Validate, end to end and from the command line, the **AI-decided Brand Kit → on-brand
image ads** pipeline (and prove the video path works) before any integration into
`apps/ai-layer` or the Angular app. Like the rest of `rnd/`, this is a disposable harness:
once it works and the vendors are proven, the logic graduates into `apps/ai-layer`.

Vendor access details (keys, SDKs, model IDs, code, pricing) live in
[`creative-vendor-research.md`](./creative-vendor-research.md).

## Locked decisions (from the brainstorm)

1. **Fresh standalone studio**, brain routed through Python (no dependence on the frozen TS creative-engine).
2. **v1 = image ads**, text-to-image (no user-uploaded product photo).
3. **Consistency via an AI-decided Brand Kit** — logo, palette, typography, tone, do/don'ts — nothing user-supplied, grounded in the brand's campaign data, locked and reused for images now and video later.
4. **Two run modes:** `review` (gate to inspect/edit the kit before generating) and `auto` (one-shot).
5. **Vendors:** image = Nano Banana 2 primary, FLUX.2 fallback · video = Veo 3.1 primary, Seedance 2.0 fallback.

## Scope

**In scope (experiment):** brand-kit generation, logo generation, prompt assembly, image
generation with primary+fallback, the two modes, a thin cost ledger, a video smoke path
(gated behind a flag), pytest with mocked providers.

**Out of scope (defer to integration):** Angular UI, apps/api proxy routes, Postgres
persistence, object-storage hosting, async job queue, per-asset regenerate UX, multi-account.
The experiment uses local files and synchronous calls throughout.

## Architecture / data flow

```
campaign data (rnd/data/_real_sample.json, or ai-layer store export)
        │  select by metric: last-N | top-roas | top-revenue | all
        ▼
brand_brain.py ── Gemini (google-genai or OpenRouter) ──▶ BrandKit JSON
        │                                                     │
        │                                            logo.py ── image provider ──▶ logo.png (ref asset)
        ▼
  mode=review ─▶ write kit+logo to output/, pause, let user edit kit.json, resume
  mode=auto ───────────────────────────────────────────────────────────────────┐
                                                                                 ▼
  for each of N concepts:
     prompt_builder.py ──▶ scene prompt + brand-kit text + hex palette
                                  │
     image_providers.py ──▶ Nano Banana 2 (+ logo ref)  ──[on error]──▶ FLUX.2   ──▶ ad_NN.png
                                  │
     ledger.py records cost; manifest.json written to output/<run>/
```

## Module layout (matches `rnd/` conventions)

```
rnd/creative/
  src/
    config.py            # loads repo-root .env; exports keys + model-ID constants
    schemas.py           # BrandKit, AdConcept, RunManifest (dataclasses/pydantic)
    campaign_select.py   # load dataset + pick source campaigns by metric
    brand_brain.py       # dataset + campaigns -> Gemini JSON -> BrandKit
    logo.py              # BrandKit.logo.brief -> image provider -> logo.png
    prompt_builder.py    # AdConcept + BrandKit -> final image prompt (the consistency glue)
    image_providers.py   # generate_image(prompt, refs) : Nano Banana 2 -> FLUX.2 fallback
    video_providers.py   # generate_video(prompt, image?) : Veo 3.1 -> Seedance fallback (gated)
    ledger.py            # append-only JSONL cost log (op, model, cost_usd)
    pipeline.py          # orchestrates: select -> kit -> logo -> N images; mode handling
    main.py              # argparse CLI entry point
  tests/
    conftest.py          # fixtures + mocked providers (no real spend)
    test_schemas.py      # BrandKit validation
    test_prompt_builder.py  # prompt carries hex palette + logo ref
    test_pipeline.py     # mode branching, fallback-on-error, ledger writes
  data/                  # sample campaign inputs (gitignored real data)
  output/                # generated kits/logos/images + manifest.json (gitignored)
  requirements.txt       # google-genai, fal-client, pydantic, python-dotenv, pillow, requests
  README.md
```

Follows the existing `rnd/` pattern: `src/` modules import each other by bare name (each
adds its own dir to `sys.path`); tests add `src/`; uses the repo's `cos/` venv; reads the
repo-root `.env`; **model IDs are constants at the top of `config.py`, not in env** (so a
vendor rename is a one-line edit).

## BrandKit schema (v1)

```python
class PaletteColor(BaseModel): role: Literal["primary","secondary","accent","bg"]; hex: str
class Logo(BaseModel):         brief: str; asset_path: str | None = None
class BrandKit(BaseModel):
    brand_name: str
    tagline: str
    palette: list[PaletteColor]          # 3-5 colors with hex
    typography: dict                     # {"heading_style": str, "body_style": str}  (descriptors, not font files in v1)
    tone: str
    voice_keywords: list[str]
    dos: list[str]
    donts: list[str]
    visual_style: str                    # e.g. "clean studio, warm light, minimal props"
    logo: Logo
```

`brand_brain.py` asks Gemini for this as **strict JSON** (response schema / JSON mode), so
the kit is validated, not free text. It is grounded in the selected campaigns' aggregates
(what's winning) but the visual identity is the model's invention, per the locked decision.

## The two modes (CLI behavior)

- **`--mode review`**: generate kit + logo → write `output/<run>/brand_kit.json` + `logo.png`
  → print a summary and **stop**. User edits `brand_kit.json` (palette, tone, etc.) and reruns
  with `--resume <run>` to generate images from the edited kit.
- **`--mode auto`**: kit + logo + N images in one shot, no pause.

## CLI surface

```
python src/main.py \
  --data data/_real_sample.json \   # or --account act_123 to pull from the ai-layer store
  --select top-roas \               # last-N | top-roas | top-revenue | all
  --n-campaigns 5 \
  --mode auto \                     # auto | review
  --images 4 \                      # how many ad images to generate
  --image-provider nanobanana \     # nanobanana | flux  (default nanobanana, auto-fallback on error)
  --aspect 4:5 \
  --out output/

# resume a reviewed kit
python src/main.py --resume output/2026-06-19_run1 --images 4

# video smoke (EXPLICIT, costs dollars) — defaults OFF
python src/main.py --resume output/2026-06-19_run1 --video --video-provider veo --duration 8
```

## Vendor abstraction + fallback

`image_providers.py` exposes one `generate_image(prompt, *, refs=None, aspect, out_path)`;
internally a registry maps `nanobanana`→google-genai, `flux`→fal. On a provider exception
(or content block) it logs and falls through to the fallback, recording which provider
actually produced each asset in the manifest. `video_providers.py` mirrors this
(`veo`→google-genai with the poll loop, `seedance`→fal). Same shape as the existing TS
`api-providers.ts`, so the graduation path into `apps/ai-layer` is mechanical.

## Cost, safety, hosting

- **Cost:** `ledger.py` appends one JSONL row per call (`op`, `model`, `cost_usd`, `run_id`).
  Image gen is cents; **video is dollars** (Veo 8s/720p ≈ $3.20, Seedance 5s ≈ $1.21–1.51),
  so video is **off by default** and requires the explicit `--video` flag.
- **Hosting:** local `output/` only (gitignored). Temporary vendor URLs (Veo 2-day, fal
  `*.fal.media`) are downloaded immediately to disk.
- **Keys:** add `GEMINI_API_KEY` and `FAL_KEY` to the repo-root `.env` (both new, both need
  billing enabled). See the vendor doc.

## Testing

pytest with **mocked providers** (monkeypatch the SDK calls) so the suite is free and
offline by default, mirroring `rnd/tests`:
- `BrandKit` schema validation (Gemini output parses + required fields).
- `prompt_builder` output contains the hex palette and the logo reference.
- `pipeline` mode branching (review stops before images; auto runs through) and
  fallback-on-error (primary raises → fallback called → manifest records it).
- ledger appends correctly.
A separate `RUN_LIVE=1` gate runs one real cheap image end-to-end (a few cents), like
`rnd/`'s `RUN_LIVE_LLM` convention.

## Open risks to validate (the point of the experiment)

1. **Image client path** — confirm `gemini-3.1-flash-image` returns inline image bytes via
   `google-genai` with our key, and that **reference-image conditioning** (logo) actually
   improves cross-image consistency. (Primary unknown; do this first.)
2. **Logo drift** — does re-passing the generated logo keep it stable across N images, or do
   we need Nano Banana Pro / an edit pass? Measure.
3. **JSON reliability** — does Gemini reliably return a schema-valid BrandKit at our temp?
4. **Billing** — both keys need credits; verify a real call succeeds before building further.
5. **Video** — one Veo clip + one Seedance clip succeed and download (gated, budget-capped).

## Exit criteria (when the experiment graduates)

- `--mode auto` produces N visually **consistent** on-brand images from a real account's data, unattended.
- `--mode review` round-trips an edited kit into generation.
- Image fallback (nanobanana→flux) works on a forced primary failure.
- One Veo and one Seedance clip generated + saved.
- Total ledger cost per image run is understood and within expectation.

Meeting these → write the `apps/ai-layer` integration plan (Architecture A) and the Angular
`creative-studio` feature, reusing this module logic.
