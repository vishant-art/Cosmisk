# Static Ad Image Generation — Architecture Research

> How production AI ad-creative generation actually works, and what it means for
> `rnd/creative/`. Status: **research (informs the next iteration of the creative layer)**.
> Web-verified December 2026. Companion to `creative-vendor-research.md` (the vendor/pricing
> doc) and `free-and-no-billing-options.md`.

---

## The one-line answer

**No — high-quality static ad generation does NOT depend only on the image model.** Every
serious ad-tech system (research and commercial) uses a **multi-stage pipeline** where the
image model produces *only the background/product scene* and a **deterministic engine
composites the text, logo, and CTA** on top, followed by a **verification stage**. The image
model is one component, not the whole machine.

The 2026 trend is **not** "better image models replace design pipelines." It is:

> **LLMs plan the ad → image models create visual assets → deterministic design engines
> assemble the final ad → a verifier gates it before export.**

This validates the hunch in the brief lemon shared. Below is the evidence, then exactly how
our current pipeline measures up and what is missing.

---

## 1. Why text in images was historically hard (and why it's now *mostly* solved)

Latent diffusion (SD/SDXL, Midjourney-era) treats an image as a continuous field denoised
from noise. Two structural reasons text broke:

- **VAE compression destroys glyph detail.** The latent autoencoder discards exactly the
  high-frequency detail that fine glyph strokes are made of. The model draws "text-like
  texture," not characters — hence `S4LE`, `SAlE`, gibberish.
- **Text is discrete; diffusion is continuous.** Diffusion is SOTA on continuous domains but
  struggles to render discrete symbol sequences, worst on multi-line / dense / multilingual.

**What changed (2025–2026):** the frontier models that render legible text are
**autoregressive + unified with the language model** (GPT-4o-style native image gen). Images
are emitted as sequences of latent patches interleaved with text tokens in one decoding
stream, so the model that *understands the words* also lays out the pixels — carrying
spelling and instruction fidelity into the image instead of handing a blurry conditioning
vector to a separate denoiser. Gemini 3 / Nano Banana is reasoning-grounded for the same
reason.

Sources: ShareGPT-4o-Image ([arXiv 2506.18095](https://arxiv.org/abs/2506.18095)) ·
GlyphDraw ([arXiv 2303.17870](https://arxiv.org/pdf/2303.17870)) ·
STRICT text-in-image benchmark ([arXiv 2505.18985](https://arxiv.org/pdf/2505.18985)).

### Where each model actually stands on in-image text

| Model | In-image text | For us |
|---|---|---|
| **Nano Banana Pro** (`gemini-3-pro-image`) | **Best in class** — short phrases near-perfect, long stays legible, multilingual | escalation target for dense copy |
| **Nano Banana 2 / Flash** (`gemini-3.1-flash-image`) — **our primary** | **Excellent, near-Pro** at large/sparse copy (≤3–5 elements, render ≥2K) | good, but it's the *Flash* tier, not Pro |
| GPT-image / 4o | Excellent (~99% on short strings, incl. CJK) | reference standard |
| **Recraft V3/V4** (on fal) | Strong; purpose-built for design + long accurate text + vector | **the fal differentiator for branded text** |
| **Ideogram V3** (on fal) | Specialist ~90–95%; posters/logos | typography-heavy creatives |
| Seedream 4.x | Strong, esp. CJK | cheap/fast alt |
| **FLUX.2 [pro]** (`fal-ai/flux-2-pro`) — **our fallback** | **~60% first-attempt**; loses text head-to-heads to Gemini | never trust for final copy |
| **SDXL** (our free Cloudflare path) | **Poor** (classic glyphs-as-texture) | never bake text here |

**Naming flag worth recording:** our config labels `gemini-3.1-flash-image` as "Nano Banana 2."
That ID is correct, but it is the **Flash** tier — *not* **Nano Banana Pro**
(`gemini-3-pro-image`). They are different models; Pro is the escalation for dense
headline+subhead+legal copy. (See `creative-vendor-research.md` for IDs/pricing.)

Sources: Nano Banana Pro ([Google blog](https://blog.google/technology/ai/nano-banana-pro/)) ·
NB2 vs FLUX 2 ([Overchat](https://overchat.ai/ai-hub/nano-banana-pro-vs-flux-2),
[Artlist](https://artlist.io/blog/flux-2-pro-vs-nano-banana-pro/)) ·
FLUX.2 ~60% text ([WaveSpeed](https://wavespeed.ai/blog/posts/introducing-wavespeed-ai-flux-2-pro-text-to-image-on-wavespeedai/)).

**Decision:** Nano Banana 2 beats FLUX.2 pro at text *decisively*. But even the best models are
not trusted by production systems for exact, brand-critical, small, or multi-line copy
(prices, legal lines, URLs, precise CTA wording). **Default to compositing text in post;**
optionally allow Nano Banana 2 (only) to bake *large hero/integrated text* (text on
packaging, signage, curved surfaces) behind an **OCR check** that compares rendered text to
the intended string and falls back to post-overlay on mismatch. Never let FLUX.2 or SDXL
render final copy.

---

## 2. The production pipeline shape (validated)

Across research systems and commercial products the pattern is consistent:

```
strategy/plan  →  copy generation  →  structured LAYOUT (JSON: boxes, sizes, layer order)
   →  image model generates ONLY the text-free background/product scene
   →  deterministic compositor places text + logo + CTA (exact fonts, exact hex)
   →  verifier checks the creative  →  (loop back on failure)  →  export
```

The clearest one-to-one confirmation is **BannerAgency**
([arXiv 2503.11060](https://arxiv.org/abs/2503.11060)): a 4-agent system —
Strategist → Background Designer (text-free backdrop) → Foreground Designer (JSON blueprint of
logo/text/CTA positions + styling) → Developer (renders as **editable SVG/Figma layers, not
baked pixels**) — plus a Design Reviewer refinement loop.

Other research with the same skeleton:

- **CreativeAds / "Multi-Object Advertisement Creative Generation"**
  ([arXiv 2603.13745](https://arxiv.org/html/2603.13745v1)) — Product Pairing → **Layout
  Generation** (VLM emits coordinates, sizes, layer order) → masked-inpaint Background
  (preserves the real product via ControlNet).
- **AutoPoster** (Alibaba, [arXiv 2308.01095](https://arxiv.org/abs/2308.01095)) — saliency
  locates the product → image cleaning/retargeting → layout → tagline → style (font/color)
  prediction. The canonical content-aware ad-poster pipeline.
- **TextDiffuser / GlyphControl / GlyphDraw2** — even when text *is* "generated," it is
  guided by an explicit **planned layout + glyph control**, never free generation.
- **PosterGen / PosterAgent / AesthetiQ** — all share planner → layout → render →
  **VLM-critic loop**.

### What the commercial tools actually do under the hood

The tools that optimize for **conversion** separate copy from imagery and composite text
deterministically:

| Product | Approach | Text handling |
|---|---|---|
| **AdCreative.ai** | Template/data-driven hybrid + a **Creative Scoring AI** (per-element conversion prediction) | text = dynamic template field, composited |
| **Meta Advantage+** | Hybrid: separate AI background-gen, image expansion, text-variation, and **text-overlay templates** | headlines generated as *text*, placed via overlay templates |
| **Bria (FIBO)** | Prompt/ref → **structured JSON** before rendering; product embedded at user coordinates | deterministic coordinate placement |
| **Pebblely / Flair.ai** | Background-removal → isolate the **real product** → AI background → auto shadows | composites the real product cutout, not text |
| **Canva Magic Design** | Pure template; pulls Brand Kit | editable text layers |

Free, end-to-end "generate the finished ad including text" is essentially **absent** from
serious conversion tooling. Reasons it's avoided: conversion consistency, brand safety + legal
copy accuracy, localization (swap text layers per language), multi-format resizing, and
editability/auditability.

Sources: BannerAgency ([2503.11060](https://arxiv.org/html/2503.11060v1)) · AdCreative
([adcreative.ai](https://www.adcreative.ai/), [custom-templates](https://www.adcreative.ai/custom-templates)) ·
Meta Advantage+ ([adsuploader](https://adsuploader.com/blog/advantage-plus-creative-enhancements)) ·
Bria ([bria.ai](https://bria.ai/)) · Pebblely ([how-to](https://pebblely.com/how-to/)).

### What the verifier stage checks

Deterministic, repeatable checks (OCR + geometry + contrast math), optionally backed by a
VLM critic:

- Headline visibility / dominance · text size & readability thresholds
- **Text-vs-background contrast ratio** (WCAG ≥ 4.5:1 normal, ≥ 3:1 large) — the load-bearing
  reason text shouldn't sit on a busy generated background
- CTA presence/clarity/placement · logo presence + clear-space · brand palette/font adherence
- Product prominence (headline must not cover the product) · safe-zone compliance (Meta
  Stories/Reels reserve ~top 14% / bottom 20%)

Sources: AdCreative scoring · Ad Corrector ([methodology](https://adcorrector.com/methodology)) ·
PosterGen ([2508.17188](https://arxiv.org/html/2508.17188v1)).

---

## 3. fal.ai is a full ad toolchain, not just a FLUX fallback

We currently use `fal-ai/flux-2-pro` *only* as a fallback. With funded fal access it should be
a **co-primary**, because fal hosts the exact capabilities Nano Banana lacks.

**Text / brand-style generation (fal's real differentiator):**
- `fal-ai/recraft/v3/text-to-image` (and `recraft/v4*`) — long accurate text, brand-style
  consistency, **palette control**, native vector/SVG; tops the text-to-image benchmark.
  $0.04/img ($0.08 vector). Recraft **"Create Style"** builds a reusable brand style from your
  reference images. ([Recraft on fal](https://fal.ai/models/fal-ai/recraft/v3/text-to-image))
- `fal-ai/ideogram/v3` — posters/logos, typography first-class.
- `fal-ai/recraft/vectorize` — raster → SVG wordmark, $0.01/img.

**Brand-asset editing & product placement:**
- `fal-ai/flux-pro/kontext` — targeted edits keeping product/logo consistent (swap product,
  fix logo placement, recolor to brand palette), ~$0.055/MP.
- `fal-ai/bria/product-shot` — drops the client's **actual product** into a generated scene,
  **trained on licensed data, explicitly commercial-safe**, built for e-commerce.
- `fal-ai/flux-general/inpainting` — inpaint **with ControlNet + LoRA** (layout-locked
  regeneration); `fal-ai/flux-pro/v1/fill` for inpaint/outpaint.

**Multi-reference brand conditioning:**
- `fal-ai/flux-2-flex` — enhanced typography + **up to 10 reference images** (logos, product,
  palette). The most ad-relevant FLUX.2 tier; better than pro-only for branded scenes.
- Train a **FLUX.2 [dev] LoRA** (`fal-ai/flux-2`, ~$0.012/MP, open-weights) per brand for true
  brand conditioning beyond prompt text.

**Finishing:** `fal-ai/birefnet/v2` (edge-accurate cutout) → `fal-ai/clarity-upscaler`
(ad-resolution). fal **Workflows** can chain generate → stage → upscale server-side in one
endpoint, though Python orchestration is more debuggable.

**SDK:** `fal-client` — `subscribe()` (blocking, interactive) vs `submit()` (queue, batch);
`fal_client.upload_file(path)` returns a CDN URL for reference inputs; outputs are temporary
(download/persist immediately). FLUX + Bria are documented commercial-safe; no default
watermark (Google's SynthID *is* on Nano Banana/Veo). Confirm per-model terms for
client-facing work.

Sources: [FLUX.2 on fal](https://fal.ai/flux-2) · [flux-2-flex](https://fal.ai/models/fal-ai/flux-2-flex) ·
[Recraft](https://fal.ai/recraft) · [Bria product-shot](https://fal.ai/models/fal-ai/bria/product-shot) ·
[Kontext](https://fal.ai/models/fal-ai/flux-pro/kontext) ·
[BiRefNet v2](https://fal.ai/models/fal-ai/birefnet/v2) ·
[Workflows](https://fal.ai/docs/model-apis/model-endpoints/workflows) ·
[fal-client](https://pypi.org/project/fal-client/).

---

## 4. The compositor + verifier (the two missing stages, in Python)

### Compositor — recommended: HTML/CSS → PNG via headless Chromium (Playwright), Pillow as util

- **Why HTML/CSS:** ad creative needs real auto-layout — balanced headline wrapping
  (`text-wrap: balance`), gradient scrims, rounded CTA buttons, web/brand fonts, exact hex,
  and **multi-format re-render from one template**. All native to CSS, painful in raw Pillow.
  Author one templated HTML component, inject the generated background URL + copy + logo,
  screenshot per aspect ratio. Brand fonts/hex are correct **by construction**. Deploys on
  Railway/Docker (install Chromium + brand fonts, run `--no-sandbox`).
- **Alternatives:** **SVG → PNG** (Satori/Yoga for auto-wrap, `resvg`/`cairosvg`) is lighter
  than Chromium and renders fonts to paths (perfect spelling); **Pillow** alone is the lightest
  and fully deterministic but you hand-roll wrapping/scrims/auto-fit. **Hosted template APIs**
  (Bannerbear/Placid/Templated/Robolly) are fine for a throwaway MVP but make the compositor a
  vendor dependency rather than owned IP.
- **Keep Pillow** for the primitives the QA stage needs anyway (luminance/contrast math, alpha
  composite, saliency sampling) and as a no-Chromium fast path.

**Auto-layout / where text goes:** compute a **saliency map** (OpenCV `saliency` module, or
`smartcrop.py`) and place text over **low-saliency** regions so it never covers the product;
drop a **gradient scrim** when no clean region exists. Auto-fit headlines with a measure→shrink
loop (`getlength()`/`multiline_textbbox()` in Pillow, or CSS in the HTML path). This is exactly
AutoPoster's approach.

**Multi-format (1:1, 4:5, 9:16, 16:9):** either responsive template rules re-rendered per
ratio, or **generative outpainting** to extend the background per ratio (e.g. Segmind AI Banner
Resizer pattern), then run the same compositor + saliency placement, re-fitting copy to each
safe box.

Sources: [Pillow ImageFont](https://pillow.readthedocs.io/en/stable/reference/ImageFont.html) ·
[Satori](https://github.com/vercel/satori) · [OpenCV saliency](https://pyimagesearch.com/2018/07/16/opencv-saliency-detection/) ·
[AutoPoster](https://arxiv.org/pdf/2308.01095).

### Verifier — recommended: two-stage gate (deterministic first, Gemini-vision critic second)

1. **Deterministic pass (free, fail-closed):** WCAG contrast on text-vs-background, safe-zone
   geometry, headline-vs-product overlap via the saliency mask, CTA/logo presence + clear-space.
2. **VLM critic pass (Gemini via OpenRouter — already wired):** send the rendered creative + a
   rubric, require **structured JSON** (pass/fail + reason per check: spelling, legibility,
   hierarchy, "headline covers product?", on-brand). Gate export on it. Treat the VLM score as
   advisory — a 2026 benchmark shows VLMs are decent design critics but not infallible
   ([arXiv 2603.01083](https://arxiv.org/html/2603.01083)); optionally add GPT-4o as a second
   judge for high-value creatives.

This mirrors AutoPoster / PosterGen / AesthetiQ (content-aware layout + saliency, then a
multimodal LLM gate) and fits our **"NO MEDIOCRE OUTPUTS — reject, don't log"** rule directly.

---

## 5. How `rnd/creative/` measures up — the gap

Current pipeline:
`select campaigns → brand_brain (LLM decides BrandKit + concepts JSON) → prompt_builder
(palette/style glue) → image_providers (Nano Banana 2 → FLUX.2 → Cloudflare) → output`.

What it already gets **right** (ahead of the curve):
- Separates text/logo from diffusion — positive prompt never mentions logo/text; a separate
  `_NEGATIVE` prompt suppresses it. This is the correct instinct.
- Generates the logo once as a reusable asset (`logo.py`).
- Consistency glue (same palette/style block on every prompt).

What is **missing** vs the validated production shape:

| Stage | Status in `rnd/creative/` | Action |
|---|---|---|
| Strategy / copy | brain decides concepts, but copy isn't a first-class field | emit headline/subhead/CTA strings explicitly |
| **Layout JSON** | **absent** — jumps from concept straight to one image prompt | add a layout/foreground stage: boxes, sizes, layer order, per format |
| Text-free background | partially — relies on negative prompt only | constrain the image stage to background/product scene by design |
| **Deterministic compositor** | **absent** — "overlay logo+copy in post" is a stated decision, **not implemented** | build it (Playwright HTML→PNG, Pillow utils) |
| **Verifier / QA** | **absent** | deterministic checks + Gemini-vision critic gate |
| fal as co-primary | fal is fallback-only | route by intent: Recraft/Ideogram for text, Bria for product placement, Kontext for brand edits |

**Highest-leverage additions:** the **layout-JSON + deterministic compositor** pair (fixes copy
correctness, brand safety, multi-format) and the **verifier** (fixes silent quality failures).
Both slot cleanly into the existing JSON-brain architecture.

> Note: this is research only — no code changed. Activation is a separate, approved decision.

---

## Sources (master list)

Research: ShareGPT-4o-Image [2506.18095](https://arxiv.org/abs/2506.18095) · STRICT
[2505.18985](https://arxiv.org/pdf/2505.18985) · BannerAgency
[2503.11060](https://arxiv.org/abs/2503.11060) · CreativeAds
[2603.13745](https://arxiv.org/html/2603.13745v1) · AutoPoster
[2308.01095](https://arxiv.org/abs/2308.01095) · TextDiffuser-2
[2311.16465](https://arxiv.org/html/2311.16465) · PosterGen
[2508.17188](https://arxiv.org/html/2508.17188v1) · VLM design-aesthetics
[2603.01083](https://arxiv.org/html/2603.01083) · CTR-driven ad image gen
[2502.06823](https://arxiv.org/pdf/2502.06823).

Models / leaderboards: [Nano Banana Pro](https://blog.google/technology/ai/nano-banana-pro/) ·
[NB2 vs FLUX2 (Overchat)](https://overchat.ai/ai-hub/nano-banana-pro-vs-flux-2) ·
[Artificial Analysis Image Arena](https://artificialanalysis.ai/).

fal: [FLUX.2](https://fal.ai/flux-2) · [flux-2-flex](https://fal.ai/models/fal-ai/flux-2-flex) ·
[Recraft V3](https://fal.ai/models/fal-ai/recraft/v3/text-to-image) ·
[Ideogram V3](https://fal.ai/docs/model-api-reference/image-generation-api/ideogram-v3) ·
[Bria product-shot](https://fal.ai/models/fal-ai/bria/product-shot) ·
[Kontext](https://fal.ai/models/fal-ai/flux-pro/kontext) ·
[BiRefNet v2](https://fal.ai/models/fal-ai/birefnet/v2) ·
[Workflows](https://fal.ai/docs/model-apis/model-endpoints/workflows) ·
[fal-client](https://pypi.org/project/fal-client/).

Commercial / compositor / QA: [AdCreative.ai](https://www.adcreative.ai/) ·
[Meta Advantage+](https://adsuploader.com/blog/advantage-plus-creative-enhancements) ·
[Bria](https://bria.ai/) · [Pebblely](https://pebblely.com/how-to/) ·
[Pillow](https://pillow.readthedocs.io/en/stable/reference/ImageFont.html) ·
[Satori](https://github.com/vercel/satori) ·
[OpenCV saliency](https://pyimagesearch.com/2018/07/16/opencv-saliency-detection/) ·
[Ad Corrector methodology](https://adcorrector.com/methodology).
