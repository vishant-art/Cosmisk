"""Image generation -- fal is the only provider (rebuild plan, decision D1).

  flux      = FLUX.2 [flex]  (fal-ai/flux-2-flex)  -- brand-scene primary, up to 10 refs
  flux_pro  = FLUX.2 [pro]   (fal-ai/flux-2-pro)   -- simpler fallback
  product   = Bria product-shot (fal-ai/bria/product-shot) -- real product into a scene

All generation produces a TEXT-FREE background/scene; copy + logo are composited
later (compositor.py). `outpaint()` extends one background to other aspect ratios.

SDK imports (`fal_client`, `requests`) are LAZY so this module imports -- and the
mock test suite runs -- without them installed. Each provider returns a dict:
{provider, model, path, cost_usd}.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import ledger  # noqa: E402

# aspect -> (width, height) px for fal's explicit image_size.
_ASPECT_PX = {
    "1:1": (1024, 1024), "4:5": (1024, 1280), "5:4": (1280, 1024),
    "9:16": (1080, 1920), "16:9": (1920, 1080), "3:4": (1080, 1440),
    "4:3": (1440, 1080), "2:3": (1024, 1536), "3:2": (1536, 1024),
}


def _suppress(prompt: str, negative: str | None) -> str:
    """Fold the negative list into the prompt as a hard suppression instruction."""
    return prompt if not negative else f"{prompt}\n\nMust NOT appear in the image: {negative}."


def _download(url: str, out_path: Path) -> None:
    import requests                     # lazy
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(requests.get(url, timeout=120).content)


def _flux(prompt: str, out_path: Path, *, refs=None, aspect="4:5", negative=None,
          flex=True, **_ignore) -> dict:
    import fal_client                   # lazy
    w, h = _ASPECT_PX.get(aspect, (1024, 1280))
    endpoint = config.IMAGE_MODEL_FLEX if flex else config.IMAGE_MODEL_PRO
    args = {"prompt": _suppress(prompt, negative),
            "image_size": {"width": w, "height": h}, "output_format": "png"}
    if refs:                            # brand-asset conditioning (flex supports up to 10)
        args["image_urls"] = [fal_client.upload_file(str(r)) for r in refs]
    res = fal_client.subscribe(endpoint, arguments=args, with_logs=False)
    _download(res["images"][0]["url"], out_path)
    return {"provider": "flux" if flex else "flux_pro", "model": endpoint,
            "path": str(out_path),
            "cost_usd": ledger.image_cost("flux_flex" if flex else "flux_pro", w, h)}


def _flux_flex(prompt, out_path, **kw) -> dict:
    return _flux(prompt, out_path, flex=True, **kw)


def _flux_pro(prompt, out_path, **kw) -> dict:
    return _flux(prompt, out_path, flex=False, **kw)


def _product_shot(prompt: str, out_path: Path, *, refs=None, aspect="4:5",
                  negative=None, **_ignore) -> dict:
    """Drop a real product (refs[0]) into a generated, text-free scene."""
    import fal_client                   # lazy
    if not refs:
        raise RuntimeError("product_shot needs the product image in refs[0]")
    args = {"image_url": fal_client.upload_file(str(refs[0])),
            "scene_description": _suppress(prompt, negative)}
    res = fal_client.subscribe(config.IMAGE_MODEL_PRODUCT, arguments=args, with_logs=False)
    imgs = res.get("images") or res.get("result", {}).get("images") or []
    if not imgs:
        raise RuntimeError("product_shot returned no image")
    _download(imgs[0]["url"], out_path)
    return {"provider": "product", "model": config.IMAGE_MODEL_PRODUCT,
            "path": str(out_path), "cost_usd": ledger.image_cost("product")}


_PROVIDERS = {"flux": _flux_flex, "flux_pro": _flux_pro, "product": _product_shot}
_FALLBACK = {"flux": "flux_pro", "flux_pro": "flux", "product": "flux"}


def generate_image(prompt: str, out_path, *, provider="flux", refs=None, aspect="4:5",
                   negative=None, pro=False, log=print, **_ignore) -> dict:
    # back-compat shim: `pro=True` on the flux path routes to FLUX.2 [pro].
    if pro and provider == "flux":
        provider = "flux_pro"
    return _PROVIDERS[provider](prompt, Path(out_path), refs=refs, aspect=aspect,
                                negative=negative)


def generate_with_fallback(prompt: str, out_path, *, primary="flux", refs=None, aspect="4:5",
                           negative=None, pro=False, log=print, **_ignore) -> dict:
    """Try the primary fal provider; on ANY error fall through to its fallback."""
    if pro and primary == "flux":
        primary = "flux_pro"
    try:
        return generate_image(prompt, out_path, provider=primary, refs=refs,
                              aspect=aspect, negative=negative)
    except Exception as e:  # noqa: BLE001 -- fallback is the whole point
        fb = _FALLBACK[primary]
        log(f"  [image] {primary} failed ({e!s:.120}); falling back to {fb}")
        res = generate_image(prompt, out_path, provider=fb, refs=refs,
                            aspect=aspect, negative=negative)
        res["fell_back_from"] = primary
        return res


def outpaint(src_path, out_path, *, fmt: str, prompt: str = "", negative=None) -> dict:
    """Extend one background to another aspect ratio (fal flux fill), preserving the
    focal point. Drives multi-format output without re-generating a fresh scene.
    NOTE: fal fill schema needs live verification; mock-tested here."""
    import fal_client                   # lazy
    from layout import FORMATS          # lazy, avoids import cycle at module load
    if fmt not in FORMATS:
        raise ValueError(f"unknown format {fmt!r}")
    w, h = FORMATS[fmt]
    args = {"image_url": fal_client.upload_file(str(src_path)),
            "image_size": {"width": w, "height": h},
            "prompt": _suppress(prompt, negative)}
    res = fal_client.subscribe(config.IMAGE_OUTPAINT_MODEL, arguments=args, with_logs=False)
    _download(res["images"][0]["url"], Path(out_path))
    return {"provider": "flux_fill", "model": config.IMAGE_OUTPAINT_MODEL,
            "path": str(out_path), "cost_usd": ledger.image_cost("flux_fill", w, h)}
