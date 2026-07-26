# Standalone Static Ad Generator

One self-contained file (`static_ad.py`) that produces a static product ad the same
way the Creative Studio pipeline does, but with zero dependence on the
`creative_studio` package and zero database. Everything is interactive (no flags),
every prompt is inlined in the file for editing, and all artifacts land on disk.

## Run

```
cd rnd_mine/cli/static_ad
../../.venv/Scripts/python static_ad.py
```

It reads `OPENROUTER_API_KEY`, `FAL_KEY` (and optionally `FAL_ADMIN_KEY` for the
balance line, `SHOPIFY_*` for source option 3) from the repo root `.env`.

## What it asks

Product image (local path / URL / live Shopify search), product name + category,
optional description, brand name + vibe, creative preference, optional audience
hint. Enter accepts the shown defaults. Before spending anything it prints an
itemized estimate (~$0.15-0.40) and requires a `y`.

## What it produces (in `runs/<timestamp>/`)

| File | Stage |
|---|---|
| `00_inputs.json`, `00_product_source.jpg` | your answers + the product photo |
| `01_creative_spec.json` | LLM creative spec (objective, hook, direction) |
| `02_character.json` | LLM persona (wardrobe never references the product) |
| `03_shot_plan.json` | LLM single product-shot plan |
| `prompts_used.txt` | every rendered prompt, incl. the FLUX raw prompts |
| `04_portrait.png` | FLUX.2 reference portrait (1024x1024) |
| `05_keyframe_raw.png` | FLUX.2 scene with generic placeholder garment (1080x1920) |
| `06_product_cutout.png` | BiRefNet transparent cutout of the real product |
| `07_static_ad.png` | **the ad** - BRIA places the real product into the scene |

## Baked-in lessons from the pipeline build

- FLUX gets the raw prompt only; the negative-terms list is reference-only
  (folding it in names the tokens and can prime the model to draw them).
- BRIA mapping: `image_url` = product cutout, `ref_image_url` = scene;
  `manual_placement` (the `automatic` mode costs ~10x).
- No logos, ever (`showBrandLogo` forced false in the spec stage).
