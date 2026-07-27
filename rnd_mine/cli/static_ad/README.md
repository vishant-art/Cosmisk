# Standalone Static Ad Generator

One self-contained file (`stat1.py`) that produces a static product ad the same
way the Creative Studio pipeline does, but with zero dependence on the
`creative_studio` package and zero database. Everything is interactive (no flags),
every prompt is inlined in the file for editing, and all artifacts land on disk.

## Run

```
cd rnd_mine/cli/static_ad
../../.venv/Scripts/python stat1.py
```

It reads `OPENROUTER_API_KEY`, `FAL_KEY` (and optionally `FAL_ADMIN_KEY` for the
balance line, `SHOPIFY_*` for the live-store source, `META_ACCESS_TOKEN` for ad
grounding) from the repo root `.env`.

## What it asks

- **Product image** - local path, image URL, or a live Shopify search (pick from results).
- **Product name / category / description** - name and category default from the source.
- **Brand name** - defaults to the Shopify store's display name, still overridable.
- **Brand positioning / vibe** - drafted by an LLM from brand + product, shown as an
  editable default (press Enter to accept).
- **Creative preference** - your own direction, no seeded default.
- **Audience hint** - optional.
- **Text to put in the image?** - optional; blank lets the LLM write the copy.

Enter accepts the shown defaults. Before spending anything it prints an itemized
estimate (~$0.35-0.60, upscaler included) and requires a `y`.

## Pipeline

```
inputs
  -> [LLM] creative spec -> [LLM] character persona -> [LLM] product shot plan
  -> [FLUX.2] reference portrait (1024x1024)
  -> [FLUX.2] scene keyframe with a plain placeholder garment (1152x2048, portrait as ref)
  -> garment swap:  Nano Banana 2 Pro (OpenRouter) swaps ONLY the outfit for the real
                    product, keeping the same person + scene            ==> clean static ad (before)
                    fallback if it fails: BiRefNet cutout + BRIA product-shot placement
  -> upscale:       fal Crystal upscaler -> ~4K (long edge 3840)        ==> upscaled ad (after)
  -> text stage:    [Gemini vision] scene analysis -> [LLM] ad copy -> Pillow overlay
                    (built on the upscaled ad)  ==> 4 archetype ad images
                    (promo / editorial / catalog / signature) + a 5th "custom"
                    image ONLY when you supplied "Text to put in the image?"
```

The garment swap runs on Nano Banana 2 (one instruction-driven edit) specifically to
avoid the "second model" that BRIA product-shot introduces; BiRefNet+BRIA stay wired
only as a fallback.

## Quality / resolution

Highest-quality is the default: the FLUX keyframe renders at the largest true 9:16 frame
FLUX.2 allows (1152x2048), and the final ad is upscaled toward ~4K with the fal Crystal
upscaler (`clarityai/crystal-upscaler`, face-optimised, ~$0.016/MP). Both the raw swap
(`07_static_ad.png`) and the upscaled result (`07u_static_ad_upscaled.png`) are saved so
you can compare before/after. Text variants are rendered on the upscaled image, so the
overlay type is crisp at output resolution. Nano Banana's own 2K/4K mode is not used: the
resolution parameter is inconsistent through OpenRouter and a rejected param would drop the
swap to the BRIA fallback, so the upscaler is the reliable quality lever. If the upscale
call fails, the run continues and builds the variants on the un-upscaled image.

## Text overlay rules

- **Gemini vision** (`gemini-2.5-flash`) returns the person/face boxes and whether the
  top/bottom bands are clear.
- **Exactly two text blocks** per image: a top line (white) and a bottom line.
- **Lower 30% only** - all text is confined to the bottom band (top of the band at
  0.70 of image height) and always sits below the detected face, so nothing lands on
  the model's head.
- **Accent colour by colour theory** - the bottom line is coloured by a designer-pairing
  lookup on the dominant colour of the text band (champagne gold on rich cool tones like
  purple/blue/red, warm cream on oranges/browns, soft coral on greens), not a raw
  complement (which clashes). The top line stays white.
- **Georgia Bold** for headline + lower line on promo/editorial/catalog. The
  **signature** archetype sets its hook in an elegant cursive script (bundled
  **Great Vibes**, `fonts/`, with Monotype Corsiva / Edwardian / Segoe Script as
  Windows fallbacks); its lower tagline stays Georgia Bold. Cursive is never used on
  the lower line and never uppercased.
- **No emojis, no logos, and "Shop Now" is banned** - enforced in the copy prompt and
  again as a render-time backstop (rewritten to "Get Yours").

## What it produces (in `runs/<timestamp>/`)

| File | Stage |
|---|---|
| `00_inputs.json`, `00_product_source.jpg` | your answers + the product photo |
| `00_meta_grounding.txt` | winning Meta ad hooks (only if a valid token resolves) |
| `01_creative_spec.json` | LLM creative spec (objective, hook, direction) |
| `02_character.json` | LLM persona (wardrobe never references the product) |
| `03_shot_plan.json` | LLM single product-shot plan |
| `prompts_used.txt` | every rendered prompt, incl. the FLUX raw prompts |
| `04_portrait.png` | FLUX.2 reference portrait (1024x1024) |
| `05_keyframe_raw.png` | FLUX.2 scene with a plain placeholder garment (1152x2048) |
| `06_product_cutout.png` | BiRefNet cutout (fallback path only) |
| `07_static_ad.png` | **the clean ad (before upscale)** - real product swapped in, no text |
| `07u_static_ad_upscaled.png` | **the clean ad (after upscale)** - ~4K, fal Crystal |
| `07b_scene_analysis.json` | Gemini vision text-placement analysis |
| `07c_ad_copy.json` | LLM ad copy for all three archetypes |
| `08_ad_promo.png`, `09_ad_editorial.png`, `10_ad_catalog.png` | text variants |
| `11_ad_signature.png` | signature variant (cursive hook + Georgia tagline) |
| `12_ad_custom.png` | **only if you supplied text** - your exact text as the hook + an LLM tagline |
| `cost.json` | this run's spend (exact fal balance delta when `FAL_ADMIN_KEY` is set) |

A one-line-per-run history is also appended to `runs/ledger.jsonl` (run id, timestamp,
renderer, stages, balance before/after, exact spend). Aborted runs are recorded at $0.00.
`spent` is `null` if `FAL_ADMIN_KEY` is absent (no balance to diff).

## Baked-in lessons from the pipeline build

- FLUX gets the raw prompt only; the negative-terms list is reference-only (folding it
  in names the tokens and can prime the model to draw them).
- Nano Banana 2 re-renders the whole frame, so the swap prompt pushes hard on
  photographic realism (skin texture, film grain, lighter even lighting, less glow).
- Vision uses `gemini-2.5-flash`, not a 3.x reasoning model - the latter truncates JSON.
- No logos, ever (`showBrandLogo` forced false in the spec stage).
