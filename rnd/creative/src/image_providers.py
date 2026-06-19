"""Image generation with primary + fallback.

  primary  = Nano Banana 2 (gemini-3.1-flash-image) via the google-genai SDK
  fallback = FLUX.2 [pro] (fal-ai/flux-2-pro) via fal-client

SDK imports are LAZY (inside each provider fn) so this module imports fine -- and
the mock test suite runs -- without google-genai / fal-client installed. Each
provider returns a dict: {provider, model, path, cost_usd}.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import ledger  # noqa: E402

# aspect -> (width, height) for providers that need explicit pixels (FLUX).
_ASPECT_PX = {
    "1:1": (1024, 1024), "4:5": (1024, 1280), "5:4": (1280, 1024),
    "9:16": (1080, 1920), "16:9": (1920, 1080), "3:4": (1080, 1440),
    "4:3": (1440, 1080), "2:3": (1024, 1536), "3:2": (1536, 1024),
}


def _nanobanana(prompt: str, out_path: Path, *, refs=None, aspect="4:5",
                size="2K", pro=False) -> dict:
    from google import genai          # lazy
    from google.genai import types
    from PIL import Image

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    model = config.IMAGE_PRO_MODEL if pro else config.IMAGE_PRIMARY_MODEL
    contents: list = [prompt]
    for r in (refs or []):
        contents.append(Image.open(r))

    resp = client.models.generate_content(
        model=model, contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=types.ImageConfig(aspect_ratio=aspect, image_size=size),
        ),
    )
    for part in resp.parts:
        if getattr(part, "inline_data", None) is not None:
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_bytes(part.inline_data.data)
            cost = ledger.image_cost("nanobanana_pro" if pro else "nanobanana", size)
            return {"provider": "nanobanana", "model": model,
                    "path": str(out_path), "cost_usd": cost}
    raise RuntimeError("nanobanana returned no image part")


def _flux(prompt: str, out_path: Path, *, refs=None, aspect="4:5",
          size="2K", pro=False) -> dict:
    import fal_client                  # lazy
    import requests

    w, h = _ASPECT_PX.get(aspect, (1024, 1280))
    args = {"prompt": prompt, "image_size": {"width": w, "height": h},
            "output_format": "png"}
    # FLUX fallback ignores logo refs in v1 (text-only); the /edit endpoint would
    # carry references but we keep the fallback path simple.
    res = fal_client.subscribe(config.IMAGE_FALLBACK_MODEL, arguments=args, with_logs=False)
    url = res["images"][0]["url"]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(requests.get(url, timeout=60).content)
    return {"provider": "flux", "model": config.IMAGE_FALLBACK_MODEL,
            "path": str(out_path), "cost_usd": ledger.image_cost("flux")}


def _cloudflare(prompt: str, out_path: Path, *, refs=None, aspect="4:5",
                size="2K", pro=False) -> dict:
    """FREE path: Cloudflare Workers AI, FLUX.1 schnell. No card, ~hundreds/day.
    Draft quality only -- no reference-image conditioning, square-ish output, so
    `refs`/`aspect`/`size` are ignored. Testing-only; keep Nano Banana for real output."""
    import base64  # lazy
    import requests

    if not (config.CLOUDFLARE_ACCOUNT_ID and config.CLOUDFLARE_API_TOKEN):
        raise RuntimeError("CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set")
    url = (f"https://api.cloudflare.com/client/v4/accounts/"
           f"{config.CLOUDFLARE_ACCOUNT_ID}/ai/run/{config.IMAGE_FREE_MODEL}")
    resp = requests.post(url, headers={"Authorization": f"Bearer {config.CLOUDFLARE_API_TOKEN}"},
                         json={"prompt": prompt, "steps": 4}, timeout=120)
    resp.raise_for_status()
    b64 = resp.json()["result"]["image"]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(base64.b64decode(b64))
    return {"provider": "cloudflare", "model": config.IMAGE_FREE_MODEL,
            "path": str(out_path), "cost_usd": 0.0}


_PROVIDERS = {"nanobanana": _nanobanana, "flux": _flux, "cloudflare": _cloudflare}
# cloudflare is the free primary; its fallback is a paid provider (only fires on a
# cloudflare error, and will itself error if no paid key is configured -- which is
# the correct signal rather than silently spending).
_FALLBACK = {"nanobanana": "flux", "flux": "nanobanana", "cloudflare": "flux"}


def generate_image(prompt: str, out_path, *, provider="nanobanana", refs=None,
                   aspect="4:5", size="2K", pro=False) -> dict:
    return _PROVIDERS[provider](prompt, Path(out_path), refs=refs, aspect=aspect,
                                size=size, pro=pro)


def generate_with_fallback(prompt: str, out_path, *, primary="nanobanana", refs=None,
                           aspect="4:5", size="2K", pro=False, log=print) -> dict:
    """Try the primary provider; on ANY error fall through to the other one."""
    try:
        return generate_image(prompt, out_path, provider=primary, refs=refs,
                              aspect=aspect, size=size, pro=pro)
    except Exception as e:  # noqa: BLE001 -- fallback is the whole point
        fb = _FALLBACK[primary]
        log(f"  [image] {primary} failed ({e!s:.120}); falling back to {fb}")
        res = generate_image(prompt, out_path, provider=fb, refs=refs,
                            aspect=aspect, size=size, pro=pro)
        res["fell_back_from"] = primary
        return res
