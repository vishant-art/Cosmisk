# Creative Studio — System Architecture

> The architecture of the creative generation system as it exists in source, spanning
> `rnd/creative/` (the R&D harness), `apps/ai-layer/ai_layer/creative/` (the production port),
> and the `apps/api` + `apps/web` surfaces that drive it.
>
> Derived from code at `f6c7a26` (branch `improve/creative`), not from the prior design docs.
> Where code and docs disagree, the code wins and the divergence is recorded in Appendix A.
>
> Companions: `creative-pipeline-architecture.md` (the as-built plan),
> `static-ad-generation-architecture-research.md` (why this shape),
> `creative-vendor-research.md` (vendor pricing), `creative-studio-db-design.md` (persistence design).

---

## 1. What the system is

It converts an ad account's winning campaigns, or a plain product brief, into finished,
multi-format static ad creatives and optional short video. The output is a set of PNGs (and
an MP4) with correct spelling, exact brand hex, real brand fonts, platform-legal safe zones,
and a machine-verified readability floor.

It is not a wrapper around an image model. The image model is one component of five.

---

## 2. The design thesis

Everything in this architecture follows from one decision:

> **The image model only ever generates a text-free background scene. The headline, subhead,
> CTA button and logo are composited on top by deterministic Pillow code, and the assembled ad
> is QA-gated before it ships.**

### 2.1 Why not let the image model render the text

Latent diffusion models compress an image through a VAE bottleneck that discards exactly the
high-frequency detail fine glyph strokes are made of. The model learns to draw "text-like
texture", not characters. Text is also discrete while diffusion is continuous, so symbol
sequences are the worst case for the sampler. The failure mode is not a typo, it is `S4LE`.

The 2025-2026 generation of autoregressive, language-model-unified image models (GPT-4o-style
native image generation, Gemini 3 / Nano Banana) largely fixed this, because the model that
understands the words also lays out the pixels. But "largely" is not good enough for ad copy.
Measured first-attempt in-image text accuracy for the models available to us on fal:

| Model | In-image text | Verdict for final copy |
|---|---|---|
| Nano Banana Pro (`gemini-3-pro-image`) | best in class, near-perfect short phrases | not on fal; escalation target only |
| Recraft V3/V4 | strong, purpose-built for design typography | viable, unused |
| Ideogram V3 | specialist, ~90-95% | viable, unused |
| **FLUX.2 [pro]** (our fallback) | **~60% first attempt** | never trust |
| SDXL | poor, classic glyphs-as-texture | never |

Even at 95%, a 5% chance of a misspelled headline on a client's paid creative is not a risk we
take. And the parts of an ad that matter most legally and commercially (prices, legal lines,
URLs, exact CTA wording) are precisely the small, dense, multi-line cases the models are worst
at.

### 2.2 What compositing buys

Correctness by construction rather than by sampling:

- **Spelling** is the `CopySet` string, drawn with `ImageDraw.text`. It cannot drift.
- **Brand color** is the palette hex, not a model's impression of the palette hex.
- **Brand font** is a `.ttf` we ship, not a lookalike.
- **Safe zones** are geometry, verified numerically against the platform's reserved margins.
- **Readability** is a measured WCAG contrast ratio, not a vibe.
- **Multi-format** is a re-layout of the same copy, so one idea ships as a coherent set.

The cost is that the pipeline is five stages instead of one, and that the generative step must
be actively *prevented* from drawing text. Both are handled below.

### 2.3 The two second-order consequences

These are the non-obvious places the thesis propagates, and they are easy to break in a refactor.

**The positive prompt never mentions text.** `prompt_builder.build_image_prompt` deliberately
omits the words "logo", "text", "copy" and "negative space", because naming a concept primes a
diffusion model to render it. Suppression lives *only* in the negative prompt. Adding
"leave space for a headline" to the positive prompt would reliably produce a headline.

**Video is seeded from the background, never the finished ad.** If you seed image-to-video with
a composited ad, the video model warps the overlaid type as it animates. So `video_smoke` seeds
from `concept_NN_bg.png` (text-free) and the copy is burned onto the *rendered clip* afterwards
as a lower-third. Text is never fed to a generative model at any point in the system.

---

## 3. System context

Three runtimes, one feature.

```
 apps/web (Angular 17)          apps/api (Fastify / TS)          apps/ai-layer (Python / FastAPI)
 ─────────────────────          ───────────────────────          ───────────────────────────────
 /app/ugc-studio                /creative-studio/*               ai_layer.creative
 "Creative Studio"              · JWT auth, user scoping         · brand_brain  (OpenRouter)
 · URL -> brief                 · studio_generations envelope    · image_providers / compositor
 · format chips                 · decrypts the Meta token        · verifier (QA gate)
 · 3s poll                      · thin HTTP client, flag-gated   · video_providers / video_post
 · <img src=asset proxy>        · asset byte proxy               · meta_creatives (winner fetch)
                                                                 · ledger (cost)
```

The split is forced by the runtimes: the pipeline is pandas, Pillow, ffmpeg and the fal SDK, so
it is Python. Auth, the relational DB and the UI contract are TypeScript. They talk over HTTP,
reusing the exact pattern the analytics/chat layer already uses (`AI_LAYER_URL` flag, thin TS
client, `X-API-Key` on the Python side).

`rnd/creative/` is a fourth tree: the original offline harness. It imports nothing from `apps/`
and nothing imports it. The production code is a behavior-preserving port of it (§11).

---

## 4. Module map

`ai_layer/creative/` (identical file set in `rnd/creative/src/`):

| Module | Responsibility |
|---|---|
| `config.py` | env resolution, model IDs, tunables. The single place any model ID appears. |
| `schemas.py` | Pydantic contracts. `BrandKit`, `CopySet`, `AdConcept`, `LayoutSpec`, `CompositedAd`, `QAReport`, `RunManifest`. |
| `campaign_select.py` | pick and summarize source campaigns. Reuses `ai_layer.meta_transform`. |
| `brand_brain.py` | summary (+ optional winner images) to `BrandKit` + `AdConcept[]`. The only reasoning step. |
| `prompt_builder.py` | concept + kit to a text-free background prompt, plus the negative prompt. |
| `image_providers.py` | fal only. flux-2-flex/pro, bria product-shot, birefnet cutout, flux-fill outpaint. |
| `layout.py` | `CopySet` + format to `LayoutSpec`. Template-bounded, safe-zone aware. No LLM. |
| `saliency.py` | region busyness to a scrim decision. |
| `compositor.py` | Pillow. Wrap/auto-fit copy, scrim, CTA pill, logo clear-space. Also `render_overlay` for video. |
| `verifier.py` | WCAG contrast + safe-zone + presence + a vision-model critic. Fail-closed. |
| `logo.py` | generate the logo once per run; re-referenced on every ad. |
| `video_providers.py` | Seedance i2v/ref2v/t2v, MiniMax TTS, fal muxer. |
| `video_post.py` | burn the copy overlay onto a clip with bundled ffmpeg. |
| `ledger.py` | per-step pricing, JSONL, running total. |
| `pipeline.py` | orchestration: `run` / `resume` / `video_smoke`. |
| `main.py` | CLI. |
| `service.py` | FastAPI router (production only; absent from `rnd`). |

Two structural properties worth preserving:

**Lazy SDK imports.** `fal_client`, `requests`, `PIL` and `imageio_ffmpeg` are imported *inside*
the functions that use them. The module tree imports, and all 93 tests run, with none of those
SDKs installed and no API keys present. Tests cost $0.

**Module-attribute dispatch.** `pipeline.py` calls `brand_brain.generate_brand_kit(...)`,
`image_providers.generate_with_fallback(...)`, `logo.generate_logo(...)` by module attribute
rather than importing the functions. This is deliberate: tests monkeypatch the module attribute
and drive the entire orchestration end to end with zero spend.

---

## 5. Data contracts

Relative coordinates in `[0,1]`, top-left origin, so a `LayoutSpec` is resolution-independent
and the same spec renders at 1080x1080 or 1920x1080.

```
BrandKit      brand_name, tagline, palette[PaletteColor], typography{heading_style, body_style},
              tone, voice_keywords[], dos[], donts[], visual_style, logo
PaletteColor  role: primary|secondary|accent|bg     hex: ^#?[0-9A-Fa-f]{6}$
Logo          brief, asset_path|None

CopySet       headline, cta_label, angle       validator: collapse whitespace, reject blank
              subhead|None, legal|None         validator: blank -> None
AdConcept     title, scene, ad_copy: CopySet

LayoutBox     role: headline|subhead|cta|logo|legal|product
              x, y, w, h: float    align, z, max_font_pt, scrim
LayoutSpec    fmt, width, height, safe_zone{top,bottom,left,right}, boxes[]

CompositedAd  path, fmt, width, height, background_path, concept_title, scrim_used, ad_copy
QACheck       name, passed, detail, cost_usd
QAReport      checks[], verdict: pass|fail, retry_hint|None, cost_usd, .approved
AssetRecord   kind: logo|image|video, provider, model, path, cost_usd, fell_back_from
RunManifest   run_id, account_name, select_strategy, mode,
              status: awaiting_review|complete,
              brand_kit, assets[], formats[], ads[], qa_reports[], rejected[], total_cost_usd
```

`CopySet` being a first-class model, rather than free text hanging off the concept, is what lets
`layout.py` decide *which boxes exist* (a `legal` box only when `copy.legal` is set) and lets
`verifier.py` compare the intended strings against what was rendered. It is the seam that makes
deterministic composition possible.

`BrandKit` is the locked identity. It is produced once by the brain, validated, serialized to
`brand_kit.json`, and every downstream stage reads from it. Nothing downstream ever handles
free-form model text.

---

## 6. Control flow

```
 INPUT, one of three:
   (a) brief dict           -> _brief_summary()            [product path, service.py]
   (b) meta account + token -> meta_live.fetch_envelope()
   (c) dataset JSON path    -> campaign_select.load_dataset()
                                        |
                                        v
 [1] CAMPAIGN SELECT   top-roas | top-revenue | last-n | all   (n=5)
       -> a compact FACTUAL TEXT BLOCK, not structured data
                                        |
       (optional) META WINNERS: insights(level=ad) -> rank by ROAS
                  -> resolve image hashes -> DOWNLOAD NOW (URLs expire)
                  -> run_dir/winners/*.png ------------+
                                        |              |
                                        v              | refs / ground_images
 [2] BRAND BRAIN   google/gemini-2.5-flash, temp 0.7, OpenRouter, json_object mode
       summary [+ up to 6 base64 winner images]  -> BrandKit
       BrandKit + summary                        -> N x AdConcept (each with a CopySet)
                                        |
                                        v
 [3] LOGO   once per run. flux-2-flex, aspect 1:1 -> logo.png
            kit.logo.asset_path mutated; the SAME asset is re-referenced on every ad
                                        |
       mode=review?  -> write brand_kit.json + manifest.json, STOP
                        (human edits the kit; `--resume <run_id>` picks it back up)
                                        |
                                        v
 [4] PER CONCEPT   (ThreadPoolExecutor, max_workers = min(n, 4))
     |
     |- plan_all_formats()  -> one LayoutSpec per format, computed up front
     |
     |- BASE FORMAT ONLY, for attempt in range(qa_retries + 1):
     |      build_image_prompt()      -> text-free positive + negative prompt
     |      generate_with_fallback()  -> concept_NN_bg.png
     |      compositor.compose()      -> ad_NN_<base>.png
     |      verifier.verify()         -> QAReport
     |          approved -> accept, break
     |          else     -> log retry_hint, REGENERATE THE BACKGROUND
     |      exhausted -> manifest.rejected.append(title); skip the concept entirely
     |
     |- NON-BASE FORMATS, from the ACCEPTED background only:
     |      outpaint(bg, fmt)     -> concept_NN_bg_<slug>.png
     |      compositor.compose()  -> ad_NN_<slug>.png
     |      (outpaint failure -> resize the base bg instead)
     v
 [5] LEDGER   every step priced -> ledger.jsonl, then a TOTAL row
 [6] MANIFEST manifest.json

 optional --video:  Seedance i2v seeded from concept_NN_bg.png
                    -> video_post burns the copy lower-third (bundled ffmpeg)
                    -> optional MiniMax TTS voiceover + fal muxer
```

Two invariants in that diagram are load-bearing:

**Only the base format is QA-gated.** The expensive generate-and-verify loop runs once per
concept. Other formats derive from the accepted background, so a concept that passes QA passes
for every ratio, and a concept that fails costs at most `qa_retries + 1` backgrounds.

**A rejected concept produces zero files.** It is not written and then filtered. `continue`
skips it before any non-base format is touched.

---

## 7. Stage specifications

### 7.1 Campaign select

Reuses the shared L1 contract `meta_transform.CampaignDayFact` / `Dataset`, the same one the
analytics pipeline uses. `campaign_summary()` groups per campaign and derives
`roas = revenue/spend`, `link_ctr`, `cpa`.

Strategies: `top-roas` (default), `top-revenue`, `last-n` (most recently active), `all`.

What reaches the brain is prose, not JSON:

```
ACCOUNT: {name}   CURRENCY: {ccy}   WINDOW: {since} to {until}
SELECTED {n} CAMPAIGNS (name | spend | revenue | roas | purchases | link_ctr%):
  - {campaign_name}: spend=... | revenue=... | roas=2.41 | purchases=... | link_ctr=1.83
```

Prose because the brain is being asked to *infer* a brand from evidence, and a factual block
reads as evidence. In the product path (`service.py`) this stage is bypassed entirely:
`_brief_summary()` compresses the user's brief into the same block shape and
`pipeline.run(summary=...)` short-circuits step 1. The brain has one input contract regardless
of whether the source is a real ad account or a text brief.

### 7.2 Brand brain

One model for everything textual and everything visual-critical: **`google/gemini-2.5-flash`**
over OpenRouter, `temperature=0.7`, `response_format={"type": "json_object"}`,
`extra_body={"usage": {"include": True}}`.

Structured output is enforced by JSON mode plus a prose schema in the system prompt, then
validated client-side with `BrandKit.model_validate`. Not tool-calling, and no JSON Schema
constraint is sent. The production port hardened `_chat_json` with `attempts=3`, retrying on
`JSONDecodeError`, because the model intermittently truncates JSON at `temperature > 0`.

The prompts are written to fight the default failure mode of brand-generating LLMs, which is
blandness. The kit prompt explicitly forbids cliché SaaS teal/orange and luxury black+gold
palettes, and forbids swoosh/globe/leaf/gradient-blob logos. The concepts prompt demands each
of the N concepts occupy a *different strategic angle* (hero-product, in-use lifestyle,
problem/solution, social proof, visual metaphor, pattern interrupt) and constrains `headline`
to six words or fewer and `cta_label` to one to three action words. Those constraints are also
what make the downstream layout tractable: a six-word headline fits a 0.16-height box.

**Brand grounding.** With `--ground` plus `--meta-account`, `_vision_user()` builds a multimodal
message: the summary text plus up to six base64-encoded PNGs of the account's actual
highest-ROAS ads. The identity is then inferred from what is demonstrably converting, not from
the numbers alone. This is the single highest-leverage feature in the system for an existing
advertiser, because it turns generation into *extension of a proven aesthetic* rather than
invention from nothing.

### 7.3 Layout

A single deterministic template. No LLM, by design: layout is a constraint-satisfaction problem
with a known-good answer, and a model would only add variance. Logo top-left; the copy stack
anchored to the bottom edge and built *bottom-up* so it structurally cannot collide with the
bottom safe zone.

| Format | Pixels | Safe zone (top / bottom / left / right) |
|---|---|---|
| `1:1` | 1080 x 1080 | .06 / .06 / .06 / .06 |
| `4:5` (default base) | 1080 x 1350 | .06 / .06 / .06 / .06 |
| `9:16` | 1080 x 1920 | **.14 / .20** / .06 / .06 |
| `16:9` | 1920 x 1080 | .06 / .06 / .06 / .06 |

`9:16` reserves far more vertical margin because Stories and Reels overlay platform chrome
there. Getting this wrong means the CTA sits under the "Send message" bar.

Boxes, stacked upward from the bottom safe-zone edge:

| Role | Height | Width | Max font | Notes |
|---|---|---|---|---|
| `legal` | .03 | content | 14pt | only if `copy.legal` |
| `cta` | .07 | .42 | 36pt | centered |
| `subhead` | .06 | content | 40pt | only if `copy.subhead`; `scrim=True` |
| `headline` | .16 | content | 110pt | `scrim=True`; `y` clamped to `max(y, top)` |
| `logo` | .07 | .20 | n/a | top-left inset, `z=10` |

The headline `y` clamp is the one place the bottom-up stack can be overridden: with a legal line,
a subhead and a tall headline, the stack would run above the top safe zone, so it is pinned.

### 7.4 Compositor

Pillow only. No browser, no headless Chrome, no web fonts. The whole rendering surface is
`ImageDraw`.

**Font resolution.** Globs `assets/fonts/*.ttf` then `*.otf` and takes the first, so a brand font
dropped in that directory wins. Falls back to matplotlib's bundled DejaVu Sans via
`font_manager.findfont`, then to `ImageFont.load_default`. Line spacing is a constant `1.25`.

**Auto-fit.** `fit_font()` is a shrink-to-fit search: start at the box's `max_font_pt`, greedily
word-wrap, measure the widest line and `line_h * len(lines)`; if either overflows, decrement
**4pt** and retry; hard floor at **12pt**. A long headline degrades in size rather than
overflowing or being truncated. This is why the brain's six-word constraint matters: it keeps
the headline near 110pt instead of near the floor.

**Scrim.** A contrast panel drawn on its own RGBA layer and `alpha_composite`d *under* the text.
Rounded rectangle, padded **22px** beyond the box on all sides with `radius = pad`, filled
`(0, 0, 0, 130)`, about 51% opacity. Applied to `headline`/`subhead` when the box is busy, where
busy means `box.scrim` is preset True *or* the saliency check fires. When a scrim is drawn the
text switches to `#FFFFFF`; otherwise it uses the palette `primary` as ink.

**CTA.** A fully-rounded pill (`radius = h // 2`) filled with the palette `accent`, label auto-fit
into `(w - 24, h - 12)` and centered, drawn in the palette `bg` color.

**Logo clear-space.** `pad = int(min(w, h) * 0.15)`; the mark is `thumbnail`'d into the padded
interior preserving aspect ratio, then centered. A 15% clear-space margin is enforced
structurally rather than trusted to a generator.

`render_overlay()` is the video sibling: a transparent PNG of copy + CTA + logo with no
background. Because the underlying video frames are unknown and moving, it *always* draws the
scrim and always uses white text.

### 7.5 Saliency

Decides whether a region is too visually busy to take text directly. Pillow only: crop the
region, convert to `L`, apply `ImageFilter.FIND_EDGES`, take the histogram-weighted mean pixel
value, normalize by `/255.0`. `needs_scrim()` fires at a normalized edge density **>= 0.08**.

A flat sky scores near zero and takes ink directly. A crowded product shelf scores high and gets
a scrim. The interface is two functions wide specifically so a spectral-residual OpenCV
implementation could replace the internals later without touching the compositor.

### 7.6 Prompt construction

The positive prompt interleaves `concept.scene` with the locked kit: `brand_name`,
`visual_style`, `tone`, `palette_str()` (with real hex), and the `dos` / `donts` lists. It closes
with explicit anti-slop direction: no plastic or waxy skin, no CGI sheen, no cliché gradients,
no clutter, no over-blurred bokeh, nothing posed or soulless-corporate.

The negative prompt is a single constant, used as a true `negative_prompt` for diffusion models
and appended as a hard instruction for instruction-following models:

```
text, words, letters, numbers, captions, typography, font, handwriting, logo,
wordmark, watermark, signature, label, sticker, badge, brand name, ui, interface,
frame, border, poster text, meme text
```

### 7.7 The QA gate

Fail-closed. This is the direct implementation of the repo-wide "NO MEDIOCRE OUTPUTS: reject,
don't log" rule. Execution order is `safe_zone -> presence -> contrast -> (vlm_critic)`, cheap
deterministic checks first so a geometry failure never pays for a vision call.

**Safe zone.** For every box with role in `(headline, subhead, cta, legal)`, fail if it crosses
any reserved margin, with `1e-6` float tolerance.

**Presence.** `headline` and `cta` boxes must exist; a `legal` box must exist when `copy.legal`
is set. This checks layout roles, not rendered pixels.

**Contrast.** Hero roles only, `(headline, subhead)`. Crop the box, convert to grayscale, take
the 98th percentile as `hi` and the 2nd percentile as `lo` (a robust proxy for text versus
background), and compute the WCAG ratio `(hi + 0.05) / (lo + 0.05)` over standard relative
luminance. The threshold is **3.0**, the WCAG AA *large-text* bar, justified because ad copy is
large. On failure the retry hint appends "add/darken scrim".

**Vision critic.** `google/gemini-2.5-flash` at `temperature=0`, `response_format=json_object`,
sent the base64 PNG plus the intended copy strings. The system prompt is an
advertising-creative-director rubric that fails the ad if the headline is unreadable or
low-contrast, if the headline or CTA overlaps the product, if spelling differs from the intended
copy, if the CTA is missing or invisible, if the logo is missing or crowded, or if it "looks
generic, off-brand, or AI-slop". The prompt is logo-aware: under `--no-logo` the logo clause is
dropped and replaced with "This ad intentionally has NO logo; that is correct, not a defect."

Verdict parsing is fail-closed: `passed = bool(parsed.get("passed", False))`. A truncated or
malformed critic response fails the ad rather than passing it.

**Retry and reject.** `--qa-retries` defaults to **1**, so `qa_retries + 1 = 2` total attempts.
On failure the loop **regenerates the background** and re-composites and re-verifies. On
exhaustion the concept title is appended to `manifest.rejected` and the concept is skipped
entirely. Every attempt's `QAReport` is retained in `manifest.qa_reports` regardless of verdict,
so rejects are auditable after the fact.

Note the retry regenerates the *background*, not the layout or the copy. The premise is that a
contrast or overlap failure is a property of the scene, and a new scene is the cheapest fix that
preserves the concept.

### 7.8 Multi-format expansion

Non-base formats never regenerate a background. They take the single accepted background, extend
it to the target aspect ratio, and re-composite the copy so it re-fits the new safe zone.

`outpaint()` has two modes. The default and only one the pipeline calls is **`mode="blur"`**: the
sharp source is centered on the target canvas and the new margins are filled with a scaled-up,
`GaussianBlur(42)`'d copy of the same scene. Provider `reframe-blur`, model `pillow`, cost
`$0.00`. The rationale is in the docstring and it is a correctness argument, not a cost argument:
**a non-model fill can never hallucinate text or a logo into the margins.** Having spent the
whole pipeline preventing the image model from drawing text, it would be perverse to invite it
back in at the reframe step.

A `mode="generative"` path exists (mask-based fill via `fal-ai/flux-pro/v1/fill`), is priced and
tested, and is never invoked. See Appendix A.

### 7.9 Video

Image generation costs cents; video costs dollars. Video is therefore off by default behind
`--video`.

Seedance 2.0 in one of three modes, selected by input precedence `refs -> image -> text`:

- **i2v**, seeded from `concept_NN_bg.png`, the text-free background. The default path.
- **ref2v**, from product or brand reference images.
- **t2v**, last resort, least brand-consistent.

`generate_with_fallback` degrades by dropping **native audio first**, then the seed (falling back
to t2v). The ordering is empirical: Seedance rejects clips whose auto-generated audio trips a
content filter, so keeping the seed matters more than keeping the audio. Cost is charged on
success only, because `video_cost` is computed inside `_seedance` on a returned clip.

Post-processing (`video_post.add_copy_overlay`) measures the real clip dimensions with
`imageio_ffmpeg.read_frames`, renders a transparent lower-third via `compositor.render_overlay`
sized to those exact dimensions, and burns it on with the **ffmpeg binary bundled by
imageio-ffmpeg** (`get_ffmpeg_exe()`), so no system ffmpeg is required on the host or in the
container. The audio stream is stream-copied (`-c:a copy`), never re-encoded.

Optional `--voiceover`: the brain writes a duration-fitted script
(`words = max(6, int(seconds * 2.4))`, about 145 wpm), `fal-ai/minimax/speech-02-hd` renders it,
and `fal-ai/ffmpeg-api/merge-audio-video` muxes it on.

---

## 8. Models: what and why

All generative I/O goes through **fal**. All reasoning and vision critique goes through
**OpenRouter**. There is no Cloudflare path and no native Gemini SDK anywhere in the module,
despite `CLOUDFLARE_*` and `GEMINI_API_KEY` existing in the root `.env`; those variables are not
read by this code. Every model ID lives in `config.py` and nowhere else.

| Purpose | Model | Why this one |
|---|---|---|
| Brand kit, concepts, VO script | `google/gemini-2.5-flash` | Cheap, fast, strong instruction-following, reliable JSON mode. The task is structured extraction plus taste, not deep reasoning. Already paid for via OpenRouter. |
| Vision critic | `google/gemini-2.5-flash` | Same model, `temperature=0`. Multimodal, so it grades the rendered PNG against the intended copy strings. Cheap enough to run on every ad. |
| Background, primary | `fal-ai/flux-2-flex` | Best quality-per-dollar for photographic brand scenes on fal, and it accepts **up to 10 reference images**, which is what makes Meta-winner conditioning possible. |
| Background, fallback | `fal-ai/flux-2-pro` | Simpler, cheaper first megapixel, no ref support. Used only when flex errors. |
| Real product into scene | `fal-ai/bria/product-shot` | Purpose-built: places a real product cutout into a generated scene without re-synthesising the product. Preserves the actual SKU. |
| Background removal | `fal-ai/birefnet/v2` | Clean alpha cutout, feeds `product-shot`. |
| Outpaint (unused) | `fal-ai/flux-pro/v1/fill` | Mask-based aspect extension. Implemented, not called; the blur reframe is preferred because it cannot hallucinate glyphs. |
| Video | `bytedance/seedance-2.0/{image,reference,text}-to-video` | Native synced audio for free, strong i2v adherence to the seed frame, and the seed frame is exactly what we already produced. |
| TTS | `fal-ai/minimax/speech-02-hd` (voice `Wise_Woman`) | fal-hosted, so one vendor, one key, one billing surface. Chosen over ElevenLabs for that reason, not for quality. |
| Audio mux | `fal-ai/ffmpeg-api/merge-audio-video` | ~$0.0002/s, avoids shipping a second ffmpeg invocation path. |

**Why one text model for both the brain and the critic.** The critic is not a stronger judge than
the generator; it is a *differently-prompted* judge looking at a rendered artifact the generator
never saw. The information asymmetry, not the model capability, is what makes the check useful.
Using the same cheap model keeps the QA gate affordable enough to run unconditionally in
production (`service.py` passes `run_vlm=True` always).

**Why fal for everything generative.** One key (`FAL_KEY`), one SDK, one billing surface, one
lazy import. The pipeline was originally multi-provider (a free Cloudflare FLUX.1-schnell path
existed) and was consolidated. The cost is vendor lock-in on generation; the benefit is that
`image_providers.py` and `video_providers.py` have exactly one error-handling shape.

**Why FLUX and not a text-capable model.** Because the image model is never asked to render text
(§2). Given that, the selection criterion collapses to photographic quality, reference-image
support and price per megapixel, and FLUX.2 flex wins on all three. The models that are *good* at
in-image text (Recraft, Ideogram, Nano Banana Pro) buy us nothing here.

**Fallback topology.** `generate_with_fallback` performs exactly **one** hop via
`_FALLBACK = {flux: flux_pro, flux_pro: flux, product: flux}`, tagging the result
`fell_back_from`. It is not a retry loop. Transient fal errors are absorbed; a persistent outage
fails the concept, which the QA loop then treats as a rejection.

---

## 9. Cost model

Two epistemic statuses, and `ledger.py` is careful to distinguish them.

**OpenRouter steps are exact.** `response_cost(resp)` reads `usage.cost` and adds
`usage.cost_details.upstream_inference_cost` to handle BYOK keys where the direct cost reads 0.
This is billed truth, not an estimate.

**fal steps are computed.** fal returns no cost, so the ledger derives it from published rates. A
fal "megapixel" is `1024^2`, rounded up, minimum 1.

| Operation | Rate |
|---|---|
| flux-2-flex | $0.05/MP, **including input reference-image megapixels** |
| flux-2-pro | $0.03 first MP + $0.015 per extra |
| bria product-shot | $0.04 flat |
| flux-pro/v1/fill | $0.05/MP |
| Seedance | `tokens = (w * h * sec * 24) / 1024`, then `tokens/1000 * $0.014` (fast `$0.0112`, 4k `$0.008`) |
| MiniMax TTS | $0.10 per 1K characters |
| fal muxer | ~$0.0002/s |

Each step appends one JSONL row `{op, provider, model, cost_usd, **meta}` to
`<run_dir>/ledger.jsonl`; `finalize()` appends a `TOTAL` row with a per-op breakdown.

Cost is dominated by two things. Reference-conditioned backgrounds, because refs bill at the
output rate and each Meta winner adds roughly $0.05. And video, because a 10s 720p clip is about
$3. A typical multi-format static run lands at $0.60 to $0.80; the one recorded live run through
the service produced two multi-format ads for $0.81 with zero rejects.

**A named architectural exception.** `CLAUDE.md` mandates "NO DIRECT LLM CALLS: `llmGateway`
(`createMessage`) only". The brand brain and the vision critic call OpenRouter directly through
the `openai` client, bypassing the TypeScript gateway. This is a deliberate, documented deviation
(integration-plan decision `D-cost`): creative LLM spend lives in the Python ledger and the
`ai_layer.cost_ledger` table, and is *not* written to the TS `cost_ledger` that the per-user
daily cap aggregates. Creative generation therefore spends real money outside the plan-tier cap.

---

## 10. Runtime architecture

### 10.1 Request lifecycle

```
 Browser  /app/ugc-studio
    |  POST /api/creative-studio/generate {brief, formats, metaAccountId}   [JWT, 5/min]
    v
 apps/api  routes/creative-studio.ts
    |  INSERT studio_generations (status=generating) + studio_outputs rows
    |  resolve and decrypt the user's Meta token
    |  return { generation_id } immediately
    |
    |  creativeGenEnabled() == Boolean(config.aiLayerUrl)
    |      true  -> processGenerationViaAiLayer()
    |      false -> processGeneration()          [LEGACY: FluxProvider + direct Claude]
    v
 services/creative-gen-client.ts
    |  POST {AI_LAYER_URL}/creative/generate   X-API-Key, X-Meta-Token    15s timeout
    |  -> { job_id, status: "queued" }
    v
 apps/ai-layer  creative/service.py
    |  _JOBS[job_id] = {...}                   <-- in-process dict
    |  BackgroundTasks.add_task(_run_job)
    |  pipeline.run(mode=auto, qa_retries=1, run_vlm=True, top_creatives=12, on_stage=stage)
    v
 [the pipeline of §6]   -> files under OUTPUT_DIR/<run_id>/

 meanwhile, in apps/api:
    poll GET {AI_LAYER_URL}/creative/jobs/{job_id} every 3s, ~8 min deadline
      -> write stage/progress_json onto the studio_generations row
      -> rewrite asset URLs  /creative/assets/<job>/x.png
                          -> /api/creative-studio/asset/<job>/x.png

 Browser polls GET /api/creative-studio/generation/:id every 3s until status != generating
 Browser loads <img src="/api/creative-studio/asset/<job>/ad_01_9x16.png">
    -> apps/api streams bytes from {AI_LAYER_URL}/creative/assets/...
```

### 10.2 The ai-layer surface

`POST /creative/generate` and `GET /creative/jobs/{job_id}` sit on an
`APIRouter(prefix="/creative")` mounted in `api.py` with `dependencies=[Depends(require_api_key)]`,
so the `X-API-Key` gate is applied at mount time rather than per-route. That key check only
enforces when `AI_LAYER_API_KEY` is set, so local dev is open. The static mount
`app.mount("/creative/assets", StaticFiles(directory=OUTPUT_DIR))` is deliberately *outside* the
key gate, "open for the client to fetch".

`CreativeRequest` accepts `images: int = Field(2, ge=1, le=8)` and
`formats = ["1:1", "4:5", "9:16"]`. Handlers are plain `def`, so FastAPI runs them in a
threadpool; the real work is a `BackgroundTasks` job. Progress is reported by an `on_stage(msg)`
closure threaded down into `pipeline.run` and `video_smoke`, which sets `job["stage"]` and appends
to `job["progress"]`.

The per-request Meta token arrives as `X-Meta-Token`, falling back to the `META_ACCESS_TOKEN` env
var. This is the multi-tenancy seam: the pipeline itself holds no global token.

### 10.3 Async model

FastAPI `BackgroundTasks` plus an in-process job store, polled by `apps/api`, which is in turn
polled by the browser. Three polling layers, chosen (decision `D-async`) to mirror the existing
single-worker fire-and-forget pattern rather than introduce a queue.

Inside a job, `_generate_ads` runs concepts concurrently on a
`ThreadPoolExecutor(max_workers=min(n, 4))`. Because Pillow's font cache is not obviously
thread-safe on first load, `compositor._font(24)` is called once before dispatch to pre-warm it,
so concurrent composites do not race.

### 10.4 State and persistence

| Artifact | Where it lives | Durability |
|---|---|---|
| Job status, stage, progress | `_JOBS` dict in the ai-layer process | dies with the process |
| Brand kit, logo, backgrounds, ads, manifest, ledger | files under `OUTPUT_DIR/<run_id>/` | dies with the container |
| The run envelope, per-format outputs | `studio_generations` / `studio_outputs` (Postgres, via apps/api) | durable |
| `creative_jobs`, `brand_config` (ai_layer schema) | Postgres | **tables exist, never written** |
| Per-step spend | `ledger.jsonl` in the run dir | dies with the container |

There is no `ai_layer/storage.py` and no object storage bucket. Assets are served straight off
the ai-layer's local disk. The pipeline already downloads fal's expiring URLs immediately because
they expire, and then re-hosts them somewhere equally impermanent. This is the least finished
part of the system; see Appendix A.

### 10.5 Failure semantics

Layered, and consistently biased toward degrading rather than aborting.

| Failure | Behavior |
|---|---|
| Meta API unreachable or no token | caught, logged, run continues blind |
| Image provider error | one fallback hop (flex <-> pro, product -> flux) |
| QA fail | regenerate the background, up to `qa_retries`, then reject the concept |
| One concept raises | per-future exception isolation, other concepts still ship |
| Outpaint error | fall back to resizing the base background |
| Video total failure | returns `None`, the static run is unaffected |
| Voiceover or overlay error | best-effort, the base clip survives |
| Brain returns bad JSON | 3 parse retries (production port only), then raise |
| Vision critic returns bad JSON | treated as **fail** (fail-closed) |
| Any exception in `_run_job` | `status="failed"`, `job["error"]` set, worker survives |

---

## 11. `rnd/creative` versus the production port

The port is behavior-preserving. Every prompt, model ID, threshold and selection rule is
byte-identical. `schemas.py` is unchanged. `resume()` is unchanged line for line. What was added,
and only what was added:

1. **Imports.** `sys.path.insert` hacks replaced with real `from ai_layer.creative import ...`
   package imports. `campaign_select` consumes `ai_layer.meta_transform` rather than the `rnd/src`
   copy.
2. **JSON retry.** `_chat_json(..., attempts=3)` retries on `JSONDecodeError`.
3. **Concurrency.** The per-concept loop body was extracted into a standalone `_make_concept()`
   so it can run in a `ThreadPoolExecutor`, with per-future exception isolation and the font
   pre-warm.
4. **Progress callbacks.** An `on_stage` parameter threaded through `run` / `video_smoke` /
   `_generate_ads`, emitting milestone strings the job store surfaces to the poller.
5. **Brief mode.** `run(summary=..., account_name=...)` bypasses campaign select, for the product
   path where there is no ad account.
6. **Per-request Meta token.** `meta_token=` replaces the single global `META_ACCESS_TOKEN`.
7. **Configurable output dir.** New `CREATIVE_OUTPUT_DIR` env var; `OUTPUT_DIR` defaults to
   `ai_layer/data/creative_output`.

Notably absent from the port: no DB writes, no `brand_id` tenant scoping, no repository calls.

---

## 12. Testing

`rnd/creative/tests` collects **93 tests**. `apps/ai-layer/tests/creative` mirrors them file for
file. All are mock-based: `fal_client` and the LLM client are faked, so the suite runs at $0 with
no SDKs and no keys installed. This is a direct payoff of the lazy-import and
module-attribute-dispatch decisions in §4.

```powershell
cd rnd\creative
..\..\cos\Scripts\python.exe -m pytest tests          # 93 passed, $0
```

The ai-layer suite cannot currently run in the `cos` venv: `tests/conftest.py` imports
`sqlalchemy`, and `sqlalchemy`, `alembic` and `psycopg` are absent from that venv. Install with
`cos\Scripts\python.exe -m pip install -e apps\ai-layer`. That conftest also requires a live Neon
test branch via `PG*` env vars.

---

## 13. Running it

```powershell
# offline test suite, no keys, no spend
cd rnd\creative
..\..\cos\Scripts\python.exe -m pytest tests

# blind multi-format auto run, with the vision critic
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --select top-roas --images 3 --formats 1:1,4:5,9:16 --vlm

# condition on the account's real winning creatives, and ground the brand kit in them
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json `
    --meta-account act_<id> --ground --images 3 --formats 1:1,9:16

# drop a real product into the generated scenes
..\..\cos\Scripts\python.exe src\main.py --data ..\data\_real_sample.json --product .\product.jpg --images 4

# human-in-the-loop: kit + logo only, edit output\<run>\brand_kit.json, then resume
..\..\cos\Scripts\python.exe src\main.py --mode review --data ..\data\_real_sample.json
..\..\cos\Scripts\python.exe src\main.py --resume <run_id> --data ..\data\_real_sample.json --images 4

# video (gated, dollars not cents)
..\..\cos\Scripts\python.exe src\main.py --resume <run_id> --video --voiceover
```

Live runs need `FAL_KEY` and `OPENROUTER_API_KEY` in the repo-root `.env`. For the service path,
`apps/api/.env` needs `AI_LAYER_URL` plus a matching `AI_LAYER_API_KEY`.

Full CLI surface: `--data`, `--select {last-n,top-roas,top-revenue,all}`, `--n-campaigns 5`,
`--mode {auto,review}`, `--images 5`, `--image-provider {flux,flux_pro,product}`, `--pro`,
`--no-logo`, `--formats 4:5`, `--qa-retries 1`, `--vlm`, `--meta-account`,
`--meta-preset last_30d`, `--top-creatives 5`, `--ground`, `--product`, `--ref` (repeatable),
`--resume`, `--video`, `--video-prompt`, `--duration 10`, `--resolution {720p,1080p}`,
`--video-aspect {9:16,16:9}`, `--no-audio`, `--voiceover`.

---

## Appendix A — where the code and the docs diverge

Recorded so the next reader does not trust a stale claim. None of these are fixed by this
document.

**A1. Outpaint never runs the generative path.** `creative-pipeline-architecture.md` states
"Outpaint: now mask-based (real aspect-ratio extension via `flux-pro/v1/fill`), replacing the
earlier resize fallback." The call site in both pipelines is
`image_providers.outpaint(bg, fbg, fmt=fmt, negative=negative)` and never passes `mode=`. The
signature default is `mode="blur"`. Multi-format expansion is therefore the deterministic Pillow
cover-blur reframe at `$0.00`. The `flux-pro/v1/fill` path is implemented, priced and tested, and
is dead code. Arguably the safer default (§7.8); the docs simply describe the other branch.

**A2. The creative DB layer is built, tested and unwired.** `creative_jobs` and `brand_config`
tables exist in `models.py`; `save_job`, `load_job`, `list_jobs`, `get_brand_config`,
`upsert_brand_config` exist in `repository.py`; all are unit-tested. Their only callers are
`tests/test_repository_creative.py`. `service.py` never imports `repository`. Consequences: an
ai-layer restart loses every in-flight and completed job, and `apps/api` will poll a `job_id` that
no longer exists until its ~8-minute deadline elapses. The brand kit is never cached to
`brand_config`, so every run re-pays for a kit. The design doc says "BUILDING (greenlit)"; the
integration plan says "DEFERRED"; the truth is a third thing.

**A3. `_JOBS` assumes exactly one uvicorn worker.** Module-global, never evicted. More than one
worker breaks polling non-deterministically. It is also an unbounded memory leak: every job dict,
including the full `brand_kit` and `assets`, is retained for the process lifetime.

**A4. Asset serving is unauthenticated on both hops.** The ai-layer's `/creative/assets` mount is
outside `require_api_key`. `apps/api`'s `GET /creative-studio/asset/:jobId/*` has no
`preHandler: [app.authenticate]`, unlike every sibling route. `jobId` is a `uuid4().hex`, so it is
a 122-bit capability token, which is defensible, but a leaked URL grants permanent cross-tenant
access to that run's assets and there is no `user_id` check on the path.

**A5. Assets are ephemeral.** No `storage.py`, no bucket. On Railway the filesystem does not
survive a redeploy, so `studio_outputs` rows accumulate asset URLs that 404.

**A6. The UI is always live and silently swaps engines.** `creative-studio.ts` is registered
unconditionally; the sidebar entry and SPA route are static. `AI_LAYER_URL` does not gate the
feature, it selects the backend. Set, and you get the full Python pipeline. Unset, and you fall
back silently to the legacy `processGeneration` (FluxProvider plus direct Claude, video stubbed).
A user cannot tell which engine produced their ad. The `config.ts:68` comment
"Empty AI_LAYER_URL = feature OFF (routes skip)" is true of the `/ai-layer/*` insight routes and
misleading about the creative ones.

**A7. No e2e coverage of creative generation.** `e2e/15-ai-studio.spec.ts` exercises AI Studio
(`/app/ai-studio`), the RAG chat assistant, which is a different feature from Creative Studio
(`/app/ugc-studio`). The URL to brief to formats to generate to poll flow has no e2e spec.

**A8. cv2 saliency is advertised but absent.** Mentioned in the README, the requirements file
(commented out) and the module docstring. No code path exists; only `ImageFilter.FIND_EDGES`.

**A9. The concept fallback bypasses the quality bar.** If `generate_concepts` parses zero
concepts, it fabricates N placeholders with `headline = kit.tagline`, `cta = "Shop now"`,
`angle = "placeholder i"`, which then proceed through the full generate-and-QA path. The QA gate
checks contrast, geometry, presence and art direction; none of those catch "the headline is the
tagline". This is the one route by which a mediocre output can ship, and it contradicts the
`SPECIFIC OR SILENT` rule.

**A10. Creative LLM spend is invisible to the daily cap.** Per §9, by explicit decision. Worth
restating because it is a billing-risk surface.

**Minor.** `verify()` executes `safe_zone -> presence -> contrast` while its docstring lists
"contrast, safe-zone, presence". The test count is 93, not the 91 the architecture doc claims.
The port's manifest `AssetRecord` uses `comp.concept_title` where `rnd` used `concept.title`.
