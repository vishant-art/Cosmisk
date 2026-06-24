# Creative Pipeline Rebuild — Layout → Compositor → Verifier (fal-only)

> Implementation plan to evolve `rnd/creative/` from a one-shot image generator into the
> validated production shape: **plan → copy → layout JSON → text-free background → deterministic
> composite → verify → (video)**. Makes **fal.ai the primary and only provider for image + video**.
> Status: **PLAN (awaiting approval — no code written yet).**
> Backed by `static-ad-generation-architecture-research.md` and `creative-vendor-research.md`.

---

## 0. Decisions (LOCKED 2026-06-23)

| # | Decision | LOCKED choice |
|---|---|---|
| D1 | Image+video provider | **fal-only.** Drop Google (Nano Banana 2, Veo) **and Cloudflare** entirely — no dev-smoke path. |
| D2 | Compositor engine | **Pillow-only.** No Playwright/Chromium. Ship brand `.ttf/.otf`, draw with `ImageDraw`; hand-roll wrap/auto-fit/scrim. |
| D3 | Text in imagery | **Never baked.** Image model makes text-free scenes only; all copy composited deterministically. |
| D4 | Multi-format | **One background per concept, outpainted/extended per ratio** (fal), then re-composited. |
| D5 | Video seed | **Reuse the text-free background** via image-to-video; overlay copy in post. |
| D6 | Verifier loop | deterministic checks → VLM critic → **max 2 retries then REJECT** (no mediocre ship). |
| D7 | Home | **Stays in `rnd/creative/`** as R&D for now; promotion into `apps/ai-layer` (M4) is a later, separate step. |

Text brain + VLM verifier stay on **OpenRouter** (`google/gemini-2.5-flash`). "fal-only" applies
to **image and video generation**, not the LLM reasoning/critique.

---

## 1. Target pipeline (end to end)

```
Stage 0  Campaign select        winning campaigns -> factual summary           [exists]
Stage 1  Brand brain + copy     BrandKit + per-concept COPY (headline/sub/CTA) [enhance]
Stage 2  Layout planner         layout JSON per format (boxes, order, safe zone,
                                 + text-free background brief)                  [NEW]
Stage 3  Background gen (fal)    text-free scene/product image (+ upscale)      [rebuild fal-only]
Stage 4  Compositor             bg + layout + copy + logo -> final static ad   [NEW]
Stage 5  Verifier / QA gate     deterministic checks -> VLM critic -> pass|loop|reject  [NEW]
Stage 6  Video (fal, gated)     text-free bg -> i2v -> overlay copy            [rebuild fal-only]
Stage 7  Multi-format + output  1:1 / 4:5 / 9:16 / 16:9, manifest, ledger      [enhance]
```

The image model is deliberately constrained to **only the background/product scene**. Everything
that must be exact (copy, logo, CTA, legal) is assembled deterministically. This is the single
most consistent finding across BannerAgency / AutoPoster / AdCreative / Meta Advantage+.

---

## 2. Stage-by-stage spec

### Stage 0 — Campaign selection *(exists, keep)*
`campaign_select.py` already picks winners (`top-roas`/`top-revenue`/`last-n`/`all`) and
summarizes them, reusing `rnd/src/meta_transform`. No change.

### Stage 1 — Brand brain + copy *(enhance `brand_brain.py`, `schemas.py`)*
Today `generate_concepts()` returns loose concepts. Change: each concept must emit **first-class
copy** as structured fields, so downstream stages never have to parse prose.
- New schema `CopySet`: `headline`, `subhead?`, `cta_label`, `legal?`, `angle` (the strategic
  reason this creative exists — ties into the strategic-cognition principle).
- `generate_concepts()` returns `list[AdConcept]` where each `AdConcept` carries a `CopySet` and a
  `scene_brief` (a text-free description of the visual: subject, setting, mood, where the negative
  space for text should sit).
- Still OpenRouter `google/gemini-2.5-flash`, `response_format=json_object`, validated by pydantic.

### Stage 2 — Layout planner *(NEW: `layout.py`, schemas in `schemas.py`)*
The missing "Foreground Designer" stage. Produces a **layout JSON per target format**.
- New schemas:
  - `LayoutBox`: `role` (`headline|subhead|cta|logo|product|legal`), `x`,`y`,`w`,`h` (relative
    0–1), `align`, `z` (layer order), `max_font_pt?`, `scrim` (bool).
  - `LayoutSpec`: `format` (`1x1|4x5|9x16|16x9`), `safe_zone` (Meta feed/story/reel margins),
    `boxes: list[LayoutBox]`, `text_region` (target low-saliency rect for copy).
- Implementation: an LLM call (`gemini-2.5-flash`) that, given the `CopySet` + `scene_brief` +
  brand palette, emits the boxes; **plus** a deterministic post-pass that snaps boxes into the
  format's safe zone and reserves logo clear-space. Start rule-based (templated layouts per
  format) and let the LLM only choose among templates + fill copy — cheaper and more stable than
  free-form coordinates (AutoPoster-style content-aware layout, but template-bounded).
- This stage is also what unlocks multi-format (D4) and localization (swap `CopySet`, re-render).

### Stage 3 — Background / scene generation, fal-only *(rebuild `image_providers.py`)*
Generate the **text-free** background/product scene. Route by creative intent:

| Intent | fal endpoint | Notes |
|---|---|---|
| Brand lifestyle / abstract scene | `fal-ai/flux-2-flex` | up to 10 brand refs (logo/product/palette), better typography-free control; primary |
| Zero-config quick scene | `fal-ai/flux-2-pro` | simpler, ~$0.03/MP |
| **Real product in a scene** | `fal-ai/bria/product-shot` | drops the client's actual product into a generated background; **commercial-safe (licensed data)**; e-commerce-optimized |
| Brand-asset edit (recolor/swap/fix logo placement on a scene) | `fal-ai/flux-pro/kontext` | targeted edits, product/logo consistency |
| Product cutout (for compositing product over a scene) | `fal-ai/birefnet/v2` | edge-accurate matting |
| Finish to ad-res | `fal-ai/clarity-upscaler` | optional upscale before composite |

- `prompt_builder.py` becomes a **scene-brief builder**: palette/style/mood block + the explicit
  instruction to leave negative space in the planned `text_region`, and the existing `_NEGATIVE`
  prompt to suppress any text/logo/watermark. (Positive prompt still never names text/logo.)
- New schema `BackgroundAsset`: `path`, `format`, `provider`, `endpoint`, `seed?`, `mp`, `cost`.
- **This asset is the reusable seed for both Stage 4 (compositor) and Stage 6 (video).**

### Stage 4 — Deterministic compositor *(NEW: `compositor.py`, `saliency.py`)*
Assemble the final static ad with **Pillow only** (D2 — no browser, deploys trivially):
- Render each `LayoutBox` onto the background with `ImageDraw`/`ImageFont.truetype` (shipped brand
  `.ttf/.otf`), fills from exact brand hex. Hand-rolled helpers:
  - **wrap + auto-fit:** measure with `getlength()`/`multiline_textbbox()`, shrink font and re-wrap
    until the headline fits its box (`max_font_pt` ceiling from the layout).
  - **scrim:** when contrast is at risk, paint a semi-opaque alpha gradient panel behind the text
    box (a Pillow `Image` with an alpha-gradient, `alpha_composite`d under the copy).
  - **CTA button:** rounded-rect (`ImageDraw.rounded_rectangle`) filled with brand color + label.
  - **logo:** `alpha_composite` the RGBA logo into its box with clear-space padding.
- `saliency.py` (OpenCV `saliency` module or `smartcrop`): compute the background saliency map,
  confirm the planned `text_region` is low-saliency (else move it / force `scrim=true`), and ensure
  copy never overlaps the product region.
- Pillow also provides the primitives the verifier reuses (luminance sampling, WCAG contrast math).
- New schema `CompositedAd`: `path`, `format`, `background_ref`, `layout_ref`, `copy_ref`.

> Trade-off accepted (D2): no CSS box model, so wrapping/line-height/kerning/scrims are hand-rolled
> in Pillow. Worth it for a zero-infra, fully deterministic, Chromium-free compositor.

### Stage 5 — Verifier / QA gate *(NEW: `verifier.py`)*
Two-stage, fail-closed (honors **"NO MEDIOCRE OUTPUTS — reject, don't log"**).
1. **Deterministic (free, runs first):**
   - WCAG contrast ratio text-vs-background ≥ 4.5:1 (normal) / 3:1 (large).
   - Safe-zone geometry (no copy/logo in Meta Stories reserved top ~14% / bottom ~20%).
   - Headline/CTA boxes do not intersect the product saliency mask.
   - CTA + logo present, logo clear-space respected.
   - (Optional) OCR the render and diff against `CopySet` — catches any stray/garbled text.
2. **VLM critic (Gemini via OpenRouter):** send the rendered ad + a rubric, require **structured
   JSON** (`pass`/`fail` + `reason` per check: spelling, legibility, hierarchy, "headline covers
   product?", on-brand). Advisory but gating.
- New schema `QAReport`: `checks: list[{name, pass, detail}]`, `verdict`, `retry_hint`.
- **Loop policy (D6):** on fail, route the `retry_hint` back to the cheapest stage that can fix it
  (re-place copy → re-layout → regenerate background), max 2 retries, then **reject the concept**
  and move on (log why). Never ship a failed creative.

### Stage 6 — Video, fal-only, gated *(rebuild `video_providers.py`)*
Off by default behind `--video` (dollars per clip). Answers the "separate image?" question:
**reuse the Stage 3 text-free background; do not feed the composited final.**

| Step | fal endpoint | Notes |
|---|---|---|
| Image-to-video (default) | `bytedance/seedance-2.0/image-to-video` | seed = text-free background → clean motion, up to 1080p, brand-consistent with the static ad |
| Product-led | `bytedance/seedance-2.0/reference-to-video` | multi-ref (product/brand), in-prompt `@Image1` |
| Text-to-video | `bytedance/seedance-2.0/text-to-video` | no seed (720p cap); least brand-consistent, last resort |
| Cheaper tier | `bytedance/seedance-2.0/fast/*` | ~20% cheaper |

- After generation, **composite copy/logo/CTA onto the video** deterministically — an animated
  lower-third or a static end-card frame (reuse the Stage 4 compositor to render an overlay PNG
  with alpha, then mux with `ffmpeg`). Text is never baked into the i2v input.
- New schema `VideoAsset`: `path`, `source_background_ref`, `mode`, `duration`, `cost`.
- Download temporary `*.fal.media` URLs immediately (retention is short).

### Stage 7 — Multi-format + output *(enhance `pipeline.py`, `ledger.py`)*
- For each concept, produce 1:1 / 4:5 / 9:16 / 16:9. Default (D4): generate one background, then
  **outpaint/extend per ratio** (`fal-ai/flux-pro/v1/fill` or FLUX.2 edit) to preserve the focal
  point, then re-run Stage 4 compositor per ratio with the format's `LayoutSpec`.
- `RunManifest` extended with `copy`, `layouts`, `qa_reports`, `videos`. `ledger.py` keeps
  per-fal-call cost estimates (fal charges on success only).

---

## 3. Module change map (`rnd/creative/src/`)

| File | Change |
|---|---|
| `schemas.py` | add `CopySet`, `LayoutBox`, `LayoutSpec`, `BackgroundAsset`, `CompositedAd`, `QAReport`, `VideoAsset`; extend `RunManifest` |
| `brand_brain.py` | concepts emit `CopySet` + `scene_brief` |
| `layout.py` | **NEW** — template-bounded layout planner |
| `prompt_builder.py` | becomes the **text-free scene-brief** builder (palette/style + negative-space hint + `_NEGATIVE`) |
| `image_providers.py` | **rebuild fal-only** — flux-2-flex/pro, bria/product-shot, kontext, birefnet, clarity; drop Google + Cloudflare (D1) |
| `compositor.py` | **NEW** — Pillow compositor (wrap/auto-fit/scrim/CTA/logo) |
| `saliency.py` | **NEW** — OpenCV/smartcrop text-region + scrim decision |
| `verifier.py` | **NEW** — deterministic checks + Gemini-vision critic + loop policy |
| `video_providers.py` | **rebuild fal-only** — Seedance 2.0 i2v/ref/t2v; drop Veo |
| `pipeline.py` | orchestrate Stages 1–7, verifier loop, multi-format |
| `config.py` | fal model IDs only; remove `GEMINI_API_KEY` + **all Cloudflare** (D1) |
| `main.py` | flags: `--formats`, `--video`, `--qa-retries`, `--image-intent` |
| `requirements.txt` | add `opencv-python-headless`, `smartcrop`, `ffmpeg-python`; keep `fal-client`, `pillow`, `pydantic`. **No Playwright** (D2) |
| `tests/` | mock fal + Playwright + VLM; assert text-free bg never carries text, compositor places exact copy, verifier rejects low-contrast, video seeds from bg-not-final |

`fal-client`/OpenCV imports stay **lazy** inside provider/compositor functions so the
module tree + mock test suite run with no SDKs installed (current pattern).

---

## 4. Dependencies, infra, cost

- **Compositor (Pillow-only, D2):** no browser. Ship brand `.ttf/.otf` font files in the repo
  (`rnd/creative/assets/fonts/`) and load via `ImageFont.truetype`. Zero extra runtime infra.
- **fal**: funded `FAL_KEY` (present, verified). `subscribe()` for interactive, `submit()` for
  batch/multi-format. `upload_file()` brand assets once, reuse CDN URLs. Persist outputs immediately.
- **Rough cost per concept (static, 4 formats):** background ~$0.03–0.05 (flex) + 3 outpaints
  ~$0.09–0.15 + VLM critic ~$0.001 ≈ **~$0.15–0.20**. Video adds ~$1.2–1.5 per 5s clip (gated).
- **Keys status:** `FAL_KEY` ✅ works, all needed endpoints exist. `OPENROUTER_API_KEY` ✅ but
  **$3 cap, expires 2026-06-28** — rotate before any real run. `GEMINI_API_KEY` empty — now
  irrelevant under fal-only (D1).

---

## 5. Build phasing (suggested PR sequence)

1. **Schemas + copy** (Stage 1) — pure, fully unit-testable, no spend.
2. **Layout planner** (Stage 2) — template-bounded, mockable.
3. **fal image rebuild** (Stage 3) — provider refactor + one live smoke on the free-ish flex path.
4. **Compositor + saliency** (Stage 4) — the highest-leverage piece; Pillow.
5. **Verifier** (Stage 5) — deterministic first, then VLM critic + loop.
6. **Multi-format** (Stage 7) — outpaint + per-ratio composite.
7. **Video rebuild** (Stage 6) — last, gated, smallest blast radius.

Stages 1, 2, 4, 5 are testable offline with zero spend. Live fal cost only enters at Stage 3/6/7.

---

## 6. Open questions — RESOLVED

All four decisions locked 2026-06-23 (see section 0): drop Cloudflare (D1), Pillow-only compositor
(D2), outpaint per ratio (D4), stays in `rnd/creative/` (D7). Build approved — starting at Phase 1.
