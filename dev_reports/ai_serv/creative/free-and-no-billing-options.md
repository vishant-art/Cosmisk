# Creative Studio — Free / No-Billing Options

> Companion to `creative-vendor-research.md`. Status: **experiment (rnd)**.
> Free or no-credit-card ways to test image/video generation while the paid vendors
> (Nano Banana, Veo, fal) need billing enabled. Verified June 2026. Last updated: 2026-06-19.

## The headline

- **Images: easy to do for free.** Cloudflare Workers AI gives a real API key, FLUX.1
  schnell, hundreds of images/day, **no card**. That alone unblocks the whole image pipeline.
- **Video: genuinely hard for free.** No "free video API" exists like for images. Every
  premium platform's free credits are **web-app only and do not reach their API**. The only
  truly free, code-callable path is running open-weights **LTX-Video** yourself on a free GPU.
- **Our chosen models have no free tier.** Gemini image (Nano Banana) and Veo are **paid-only**
  on the API in 2026. The consumer Gemini/Flow apps give free daily images/clips but aren't
  programmable. The only "free" route to Veo/Imagen from code is the **GCP $300 trial (card required)**.

---

## Images — ranked for "test free this week"

| Rank | Option | Card? | Free size | Models |
|---|---|---|---|---|
| 1 | **Cloudflare Workers AI** | No | ~10k neurons/day → ~170–230 FLUX imgs/day | FLUX.1 schnell, SDXL, SDXL-Lightning |
| 2 | **Pollinations.ai** | No | keyless, ~1 req/15s | flux, turbo, sana, SD |
| 3 | **AI Horde** | No | unlimited but queued | SDXL + many, FLUX schnell |
| 4 | **HF Inference Providers** | No | $0.10/mo credits (a few imgs) | FLUX schnell/dev, many |
| 5 | **GCP $300 trial → Vertex Imagen** | **Yes** | $300 / 90 days | Imagen 4 |
| — | Gemini image API free tier | — | **none (paid-only in 2026)** | — |

### 1. Cloudflare Workers AI — best free pick (no card)
- Free Workers plan, never expires. FLUX.1 schnell ≈ 55–60 neurons/image (~170–230/day; my
  arithmetic, not an official number). SDXL listed at $0.00/step in beta (beta state can change).
- **Keys:** dash.cloudflare.com → My Profile → API Tokens → Create Token (Workers AI template).
  Account ID is in the dashboard URL. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.
- **Model IDs:** `@cf/black-forest-labs/flux-1-schnell`, `@cf/stabilityai/stable-diffusion-xl-base-1.0`.
- **Gotcha:** FLUX returns JSON with base64 `result.image`; SDXL returns **raw bytes**.

```python
import os, base64, requests
acct = os.environ["CLOUDFLARE_ACCOUNT_ID"]; tok = os.environ["CLOUDFLARE_API_TOKEN"]
url = f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/black-forest-labs/flux-1-schnell"
r = requests.post(url, headers={"Authorization": f"Bearer {tok}"},
                  json={"prompt": "studio product shot, teal backdrop", "steps": 4})
open("out.png","wb").write(base64.b64decode(r.json()["result"]["image"]))
```

### 2. Pollinations.ai — zero friction (no key, no signup)
```python
import urllib.parse, requests
p = urllib.parse.quote("a red bicycle on a beach at sunset")
r = requests.get(f"https://image.pollinations.ai/prompt/{p}",
                 params={"width":1024,"height":1024,"model":"flux","nologo":"true"}, timeout=120)
open("out.png","wb").write(r.content)
```
Rate-limited (~1/15s anonymous); premium models (nanobanana, seedream) are blocked anonymously.
Flag: sources conflicted on how much of the keyless path now sits behind their "Pollen" credits — verify live.

### 3. AI Horde — free community GPUs (no card)
Anonymous apikey `0000000000` (low priority) or register free for kudos/priority. Async:
`POST /api/v2/generate/async` → poll `/check/{id}` → `/status/{id}`. SDXL + FLUX schnell. Slower (queued).

### 4. HF Inference Providers
$0.10/month free credits (PRO $9/mo → $2) — good for *trying many models*, not volume. Token at
huggingface.co → Settings → Access Tokens (Inference Providers permission).
```python
from huggingface_hub import InferenceClient
img = InferenceClient(provider="auto", api_key=HF_TOKEN).text_to_image(
    "astronaut riding a horse", model="black-forest-labs/FLUX.1-schnell")
img.save("out.png")
```

### Small no-card trial credits (real keys)
Kie.ai (80 free credits, no card — offers nano-banana-2/Flux-2 proxies), Runware ($2 trial),
Modal ($30/mo compute but you run the model yourself). fal.ai has promo credits but **publishes no
fixed signup amount** — plan as if a card may be needed.

---

## Video — ranked for "test a few clips free" (be realistic)

| Rank | Option | Card? | Free | API-callable? |
|---|---|---|---|---|
| 1 | **LTX-Video on HF ZeroGPU Space** (`gradio_client`) | No | shared GPU pool, queued | **Yes** |
| 2 | **LTX-Video / CogVideoX on Colab/Kaggle free T4** | No | free GPU hours | Yes (your code) |
| 3 | **Novita AI** | likely No | ~$0.50 voucher (unverified) → a few cheap clips | Yes |
| 4 | **fal.ai promo credits** | verify | rumored ~$20 (unverified) | Yes |
| 5 | **Vertex Veo on GCP $300 trial** | **Yes** | $300 / 90 days | Yes |

### 1. LTX-Video on a free HF Space — the only truly free code path
```python
from gradio_client import Client
client = Client("Lightricks/ltx-video-distilled")          # free with a signed-in HF account
out = client.predict("a cat playing piano, cinematic", api_name="/generate")
```
Shared ZeroGPU pool (~300s/call, low priority; a free `HF_TOKEN` improves quota). Best-effort
reliability (the Space can sleep or rename `api_name`). **License:** custom LTX open-weights license —
fine for testing; verify before any commercial use. For Apache-2.0 safety use **CogVideoX-5B**
(`zai-org/CogVideoX-5b`, runs on a free Colab T4).

### Why premium video can't be free via API
Architectural fact, consistent across Kling / Hailuo / Vidu / Pika / Runway / Luma: **free web
credits never transfer to the developer API**, and the API is separate prepaid billing. Pika's API
is now delivered through fal (paid). So "free daily credits" you see advertised are web-app only.

### Veo specifically
- **AI Studio / Gemini API:** zero free Veo quota (pricing lists Veo as Free Tier "Not available").
- **Vertex AI + $300 trial:** Veo is a Google first-party model and is **not** on the trial
  exclusion list, so it should draw from the $300 — **card required** to start. (Rests on
  absence-of-exclusion; confirm in the billing console.)

---

## How this plugs into `rnd/creative/`

The experiment's provider layer (`image_providers.py`) already has a primary→fallback registry.
To run images **for free**, add a `cloudflare` provider and use it as the primary:

```python
# in image_providers.py — add to _PROVIDERS
def _cloudflare(prompt, out_path, *, refs=None, aspect="4:5", size="2K", pro=False):
    import os, base64, requests
    acct, tok = os.environ["CLOUDFLARE_ACCOUNT_ID"], os.environ["CLOUDFLARE_API_TOKEN"]
    url = f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai/run/@cf/black-forest-labs/flux-1-schnell"
    r = requests.post(url, headers={"Authorization": f"Bearer {tok}"},
                      json={"prompt": prompt, "steps": 4}); r.raise_for_status()
    Path(out_path).write_bytes(base64.b64decode(r.json()["result"]["image"]))
    return {"provider": "cloudflare", "model": "flux-1-schnell", "path": str(out_path), "cost_usd": 0.0}
_PROVIDERS["cloudflare"] = _cloudflare
```

Then `--image-provider cloudflare` runs the whole brand-kit → logo → ads pipeline at **$0**.
Quality is below Nano Banana 2 (FLUX schnell is a fast/draft model, weaker at logos/text and no
reference-image conditioning), so it's a **testing-only** path — keep Nano Banana as the primary
for real output once `GEMINI_API_KEY` is funded. For free video, generate clips out-of-band on an
LTX Space and drop the MP4s into the run folder rather than wiring it as a provider.

Brain (text/BrandKit/concepts) is **already free-ish** — it runs on OpenRouter, which you fund, and
`google/gemini-2.5-flash` is cheap (fractions of a cent per kit).

## Caveats / unverified

- Cloudflare images/day = arithmetic, not official; SDXL "$0.00/step" is beta and may change.
- Pollinations keyless-vs-Pollen boundary; HF exact rate limits; fal (~$20) and Novita (~$0.50)
  amounts and whether a card is needed — all third-party / unverified.
- Veo-covered-by-$300-trial rests on absence-of-exclusion; confirm in the console.
- Premium free credit amounts + newest model IDs (Kling v3, Luma Ray3) change monthly.

## Sources

Cloudflare Workers AI pricing + flux model pages · HF Inference Providers pricing / text-to-image /
text-to-video / Lightricks ltx-video-distilled Space · Pollinations APIDOCS · AI Horde API ·
ai.google.dev/gemini-api/docs/pricing · docs.cloud.google.com/free/docs/free-cloud-features ·
fal.ai docs/pricing · novita.ai/docs · Replicate billing.
