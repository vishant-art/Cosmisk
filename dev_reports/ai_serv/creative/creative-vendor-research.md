# Creative Studio — Vendor Research (image + video gen APIs)

> Research backing `rnd/creative/` (the standalone CLI experiment). Status: **experiment (rnd)**.
> Captures how to actually reach the four vendors: keys, SDKs, model IDs, code, pricing, gotchas.
> Verified against official sources June 2026. Last updated: 2026-06-20.

## Decision summary

| Slot | Primary | Fallback |
|---|---|---|
| **Image** | Nano Banana 2 — `gemini-3.1-flash-image` (Google GenAI SDK) | FLUX.2 [pro] — `fal-ai/flux-2-pro` (fal.ai) |
| **Video** | Veo 3.1 — `veo-3.1-generate-preview` (Google GenAI SDK) | Seedance 2.0 — `bytedance/seedance-2.0/*` (fal.ai) |

Two SDKs cover everything: **`google-genai`** (Nano Banana + Veo, both Google) and **`fal-client`** (FLUX + Seedance, both on fal). That is the whole integration surface.

Two API keys to obtain (both new to this repo; see billing below):
- `GEMINI_API_KEY` — https://aistudio.google.com/apikey (one click, no GCP project needed).
- `FAL_KEY` — https://fal.ai/dashboard/keys (add a payment method / credits before first run).

---

## Pricing & billing (verified 2026-06-20)

### Image — price per image

| Model | Provider | 1K | 2K | 4K | Notes |
|---|---|---|---|---|---|
| **Nano Banana 2** `gemini-3.1-flash-image` | Google | **$0.067** | $0.101 | $0.151 | 0.5K = $0.045. Billed by tokens ($60 / 1M image-output tok) |
| **Nano Banana Pro** `gemini-3-pro-image` | Google | $0.134 | $0.134 | $0.24 | $120 / 1M image-output tok |
| **FLUX.2 [pro]** `fal-ai/flux-2-pro` | fal.ai | **$0.03** (1024²) | — | — | $0.03 first MP + $0.015/extra MP, rounds up; 1080×1920 ≈ $0.045. **Input ref images also count toward MP.** |
| FLUX.1 Kontext [pro] `fal-ai/flux-pro/kontext` | fal.ai | ~$0.04 flat | — | — | per-image, not per-MP (pull from page to confirm) |

Google image models get a **50% Batch API discount**. FLUX has no batch tier.

### Video — price per second of output

| Model | Provider | 720p | 1080p | 4K | 8s/720p clip |
|---|---|---|---|---|---|
| **Veo 3.1 Standard** `veo-3.1-generate-preview` | Google | $0.40 | $0.40 | $0.60 | **$3.20** |
| **Veo 3.1 Fast** | Google | $0.10 | $0.12 | $0.30 | $0.80 |
| **Seedance 2.0** `bytedance/seedance-2.0/text-to-video` | fal.ai | ~$0.30 | ~$0.68 (i2v) | — | 5s/720p ≈ **$1.51** |
| **Seedance 2.0 Fast** `.../fast/*` | fal.ai | ~$0.24 | — | — | 5s/720p ≈ $1.21 |

Seedance bills by tokens: `(h × w × seconds × 24) / 1024` at **$0.014 / 1k tokens**. Veo has no batch discount. Both Google and fal **only charge on success** (no charge for queue waits / server errors).

### Billing models

**Google (Gemini API / Vertex AI)** — **postpaid, credit card required, NO free tier** on any of these models (the ~500-img/day free quota people cite is the *older* `gemini-2.5-flash-image`, not these). Two paths, same unit rates: an **AI Studio API key** with billing enabled (simplest) or **Vertex AI** (GCP project + billing account, better for enterprise quota/IAM/regions). No stated minimum spend.
- **$300 GCP free-trial credit covers these models on the Vertex AI path** (general GCP credit, not service-restricted) — ~2,200 Pro images or ~90s of standard Veo. Card required, expires ~90 days. This is the only way to run Veo/Nano Banana with no real spend. The standalone AI Studio key billing is a *separate* payments flow not tied to the trial credit.

**fal.ai (FLUX + Seedance)** — **prepaid credits**: you load money first and it draws down; you must have a payment method / funded credits before generating. Also available **postpaid via Google Cloud Marketplace** (billed monthly through your GCP account).
- Concurrency starts at **2 jobs**, auto-scales up to **40** as you buy credits. Excess requests queue (async auto-retries 429).
- Output URLs are temporary (configurable retention via the `X-Fal-Object-Lifecycle-Preference` header) — download immediately.

### fal.ai free credits (confirmed scene)

- **Reported $10 free when you add a payment method** to a new account (surfaced from fal's own pages; **not stated on the FAQ page**, so treat as semi-official — confirm in the billing dashboard). The third-party "$20 signup" figure is **not supported** — don't rely on it.
- **Expiration:** free / promotional credits expire **anywhere from 1 week to 1 year** depending on the grant; **purchased** credits expire **365 days** from purchase.
- **No standing free tier** — the prepaid model means no generations without funded (or granted) credits.
- **Alternative free route:** **fal Research Grants** (grants@fal.ai) — free compute for open-source / research work. Apply if it fits.
- Bottom line: budget as if a card/payment method is required; the only "real free" lanes are the **GCP $300 trial** (for Veo/Nano Banana via Vertex) and **fal's ~$10 + Research Grants** (for FLUX/Seedance). For zero-setup free *image* testing, the experiment already uses **Cloudflare Workers AI (SDXL)** — see `free-and-no-billing-options.md`.

---

## 1. Image primary — Nano Banana 2 (Google)

- **Model ID (GA):** `gemini-3.1-flash-image`. Premium sibling: `gemini-3-pro-image` (best logo/text fidelity, 4K). Older/cheapest: `gemini-2.5-flash-image`.
  - **Correction to our brainstorm:** the image models went **GA and dropped the `-preview` suffix**. Use the bare IDs. The old `gemini-3-pro-image-preview` is being **shut down 2026-06-25** — do not target preview IDs.
- **SDK:** `pip install google-genai` (v2.9.0). The old `google-generativeai` package is **dead** (EOL Nov 2025). Import is `from google import genai`.
- **Auth:** `genai.Client()` reads `GEMINI_API_KEY` / `GOOGLE_API_KEY` from env. AI Studio key is far simpler than Vertex for a solo experiment.
- **Output:** inline base64 parts (not the File API). `part.inline_data.data` is **already decoded bytes**.

```python
from google import genai
from google.genai import types
from PIL import Image

client = genai.Client()  # GEMINI_API_KEY in env

# text-to-image
resp = client.models.generate_content(
    model="gemini-3.1-flash-image",
    contents=["studio shot, matte-black skincare bottle, warm rim light"],
    config=types.GenerateContentConfig(
        response_modalities=["IMAGE"],
        image_config=types.ImageConfig(aspect_ratio="4:5", image_size="2K"),
    ),
)
for part in resp.parts:
    if part.inline_data:
        part.as_image().save("ad.png")

# with reference image (logo/product consistency) — pass extra contents items
logo = Image.open("logo.png")
resp = client.models.generate_content(
    model="gemini-3-pro-image",  # Pro for best logo fidelity
    contents=["Place this exact logo top-left; keep colors/proportions.", logo],
    config=types.GenerateContentConfig(response_modalities=["IMAGE"]),
)
```

- **Aspect ratios:** `1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`. **Sizes:** `1K | 2K | 4K`.
- **Pricing:** `gemini-3.1-flash-image` $0.045 (0.5K) → $0.067 (1K) → $0.101 (2K) → $0.151 (4K). Pro ~$0.134 (1K/2K), ~$0.24 (4K). Batch API ~halves it.

## 2. Image fallback — FLUX.2 [pro] (fal.ai)

- **Endpoints:** `fal-ai/flux-2-pro` (text-to-image), `fal-ai/flux-2-pro/edit` (multi-ref), `fal-ai/flux-pro/kontext` (single-image targeted edit, preserves composition).
- **SDK:** `pip install fal-client`; `import fal_client`; reads `FAL_KEY` from env. `fal_client.upload_file(path)` returns a hosted URL for reference inputs.

```python
import fal_client, requests
res = fal_client.subscribe("fal-ai/flux-2-pro", arguments={
    "prompt": "studio product shot, brand teal #0FB5AE backdrop, soft light",
    "image_size": {"width": 1080, "height": 1350},  # or enum: portrait_4_3, etc.
    "output_format": "png",
}, with_logs=True)
url = res["images"][0]["url"]
open("ad.png", "wb").write(requests.get(url).content)
```

- **Brand control:** accepts **HEX colors in-prompt** + `@`-image referencing / JSON structured prompts. Use `/edit` or `/kontext` for strict brand-asset fidelity.
- **Pricing:** $0.03 first megapixel + $0.015/MP (1024² ≈ $0.03; 1080×1350 ≈ $0.045). Kontext pro flat $0.04.
- **Why fal not BFL-direct:** fal's one SDK also covers Seedance (video); BFL only serves FLUX, so going direct still needs a second client. Near-identical FLUX pricing. fal wins for a one-SDK experiment.

## 3. Video primary — Veo 3.1 (Google)

- **Model IDs (still preview, no GA yet):** `veo-3.1-generate-preview` (standard, t2v + i2v, native audio), `veo-3.1-fast-generate-preview` (cheaper), `veo-3.1-lite-generate-preview` (720p only). Veo 3/2 IDs **die 2026-06-30**.
- **Long-running:** returns an operation you poll, then download the MP4 via the Files API. **Videos are retained only 2 days on Google's servers — download immediately.**

```python
import time
from google import genai
from google.genai import types

client = genai.Client()
op = client.models.generate_videos(
    model="veo-3.1-generate-preview",
    prompt="slow push-in on the product rotating on a turntable",
    config=types.GenerateVideosConfig(
        aspect_ratio="9:16",      # ONLY 16:9 or 9:16
        resolution="720p",        # 720p | 1080p | 4k  (1080p/4k require 8s)
        duration_seconds="8",     # "4" | "6" | "8"
    ),
)
while not op.done:
    time.sleep(10)
    op = client.operations.get(op)
vid = op.response.generated_videos[0]
client.files.download(file=vid.video)
vid.video.save("ad.mp4")
# image-to-video: add image=types.Image.from_file(location="start.png")
```

- **Pricing (per second, billed on success only):** Standard $0.40 (720p/1080p) / $0.60 (4K); Fast $0.10 / $0.12 / $0.30. **An 8s/720p Standard clip ≈ $3.20.** (A "Lite" tier ~$0.05/s circulates on third-party blogs but is **not on any official Google page** — unverified.) Full table + billing in the *Pricing & billing* section above.

## 4. Video fallback — Seedance 2.0 (fal.ai)

- **Endpoints:** `bytedance/seedance-2.0/text-to-video`, `/image-to-video`, `/reference-to-video` (multi-ref), plus `bytedance/seedance-2.0/fast/*` cheaper tiers.

```python
import fal_client
res = fal_client.subscribe("bytedance/seedance-2.0/text-to-video", arguments={
    "prompt": 'model walks toward camera; she says "this changed my routine"',
    "resolution": "720p",      # t2v caps at 720p; i2v/ref go to 1080p
    "duration": "5",           # "auto" or 4–15 (seconds)
    "aspect_ratio": "9:16",
    "generate_audio": True,    # native synced audio; quotes in prompt = lip-sync
}, with_logs=True)
print(res["video"]["url"])     # temporary *.fal.media URL — download promptly
```

- **Reference-to-video:** `image_urls` (≤9) + `video_urls` (≤3) + `audio_urls` (≤3), total ≤12, referenced in-prompt as `@Image1`, `@Video1`.
- **Pricing:** token formula `tokens = (h × w × dur × 24) / 1024`, billed `$0.014 / 1k tokens`. Effective ~$0.30/s standard, ~$0.24/s fast. **720p/5s ≈ $1.51 standard, $1.21 fast.**

---

## Cross-vendor gotchas (matter for the experiment + product)

- **No model renders reliable in-clip text.** Logos/CTAs/legal copy get composited in post for video. For images, Nano Banana Pro is the best at legible text.
- **SynthID watermark** is on every Google image and video — invisible, non-removable, tags content as AI. fal/FLUX/Seedance expose no watermark param (no explicit "clean" guarantee found — verify ToS for commercial use).
- **Person/celebrity blocks** on Google models; Veo `person_generation` is limited to `allow_adult` in EU/UK/CH/MENA.
- **Temporary output URLs.** Veo files: 2-day retention. fal `*.fal.media` URLs: temporary. Download + re-host immediately; never treat as permanent.
- **Preview churn.** Veo 3.1 is preview (no SLA, params can shift). Pin model IDs in `config.py` so a vendor rename is a one-line change.
- **Cost asymmetry.** Images are cents; video is dollars per clip. The experiment **defaults to image-only** and gates video behind an explicit flag to avoid surprise spend.
- **OpenRouter image path exists** (`modalities:["image","text"]` → base64 data URL) but the native `google-genai` SDK is better for reference-image conditioning and full config control. We use the native SDK.

## Keys to add to the repo-root `.env`

| Key | Status | Where to get it |
|---|---|---|
| `GEMINI_API_KEY` | **missing** (declared in apps/api but unset) | https://aistudio.google.com/apikey |
| `FAL_KEY` | **missing** | https://fal.ai/dashboard/keys (+ add credits) |
| `OPENROUTER_API_KEY` | present | already used by the ai-layer |

## Sources

Google: ai.google.dev/gemini-api/docs/{image-generation,video,pricing,models,api-key} · docs.cloud.google.com (gemini-3-1-flash-image, gemini-3-pro-image model docs) · cloud.google.com/blog (Gemini 3 + free trial) · github.com/googleapis/python-genai · blog.google/.../nano-banana-2.
fal: fal.ai/docs/{pricing,faq,media-expiration} + model pages for flux-2-pro, flux-pro/kontext, bytedance/seedance-2.0/* · pypi.org/project/fal-client.

**Flagged unverified:** Veo 3.1 "Lite" tier (third-party only, no official listing); fal's **$10-on-adding-payment** signup credit (fal-sourced but not on the FAQ page — confirm in dashboard); exact per-model image/Veo RPM at each paid tier; Kontext pro $0.04/image (pull from page); fal no-watermark guarantee; fal regional limits.
