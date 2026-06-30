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

from ai_layer.creative import config
from ai_layer.creative import ledger

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


def _ref_megapixels(refs) -> int:
    """Total input megapixels of the reference images. FLUX.2 bills input refs at
    the same per-MP rate as output, so they must be counted for an accurate cost."""
    if not refs:
        return 0
    from PIL import Image               # lazy
    total = 0
    for r in refs:
        try:
            with Image.open(r) as im:
                total += ledger.megapixels(*im.size)
        except Exception:               # noqa: BLE001 -- unreadable ref ~ assume 1MP
            total += 1
    return total


def _flux(prompt: str, out_path: Path, *, refs=None, aspect="4:5", negative=None,
          flex=True, **_ignore) -> dict:
    import fal_client                   # lazy
    w, h = _ASPECT_PX.get(aspect, (1024, 1280))
    endpoint = config.IMAGE_MODEL_FLEX if flex else config.IMAGE_MODEL_PRO
    args = {"prompt": _suppress(prompt, negative),
            "image_size": {"width": w, "height": h}, "output_format": "png"}
    ref_mp = _ref_megapixels(refs)
    if refs:                            # brand-asset conditioning (flex supports up to 10)
        args["image_urls"] = [fal_client.upload_file(str(r)) for r in refs]
    res = fal_client.subscribe(endpoint, arguments=args, with_logs=False)
    _download(res["images"][0]["url"], out_path)
    return {"provider": "flux" if flex else "flux_pro", "model": endpoint,
            "path": str(out_path),
            "cost_usd": ledger.image_cost("flux_flex" if flex else "flux_pro", w, h,
                                          ref_mp=ref_mp)}


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


def cutout(src_path, out_path) -> dict:
    """Remove the background of a product image (fal BiRefNet) so it can be dropped
    into a generated scene via product-shot. Returns {provider, model, path, cost_usd}."""
    import fal_client                   # lazy
    args = {"image_url": fal_client.upload_file(str(src_path))}
    res = fal_client.subscribe(config.IMAGE_CUTOUT_MODEL, arguments=args, with_logs=False)
    img = res.get("image") or (res.get("images") or [{}])[0]
    _download(img["url"], Path(out_path))
    return {"provider": "birefnet", "model": config.IMAGE_CUTOUT_MODEL,
            "path": str(out_path), "cost_usd": 0.0}   # negligible; fal rate unverified


def _fit(src, w, h):
    """Resize `src` to fit ENTIRELY within (w,h), preserving aspect."""
    scale = min(w / src.width, h / src.height)
    return src.resize((max(1, int(src.width * scale)), max(1, int(src.height * scale))))


def _cover_blur(src, w, h, *, blur=42):
    """A (w,h) blurred background that COVERS the canvas with the scene's own colors."""
    from PIL import ImageFilter         # lazy
    cover = max(w / src.width, h / src.height)
    big = src.resize((int(src.width * cover) + 1, int(src.height * cover) + 1))
    left, top = (big.width - w) // 2, (big.height - h) // 2
    return big.crop((left, top, left + w, top + h)).filter(ImageFilter.GaussianBlur(blur))


def outpaint(src_path, out_path, *, fmt: str, prompt: str = "", negative=None,
             mode: str = "blur") -> dict:
    """Reframe one background to another aspect ratio, preserving the focal point.

    mode="blur" (default, deterministic, free): the sharp source is centered and the
    new margins are filled with a scaled-up, heavily-blurred copy of the SAME scene --
    the standard social-reframe look. No model, so it can never hallucinate text/logos
    in the margins (the failure mode of the generative fill).

    mode="generative": FLUX fill paints the margins (mask-based). Higher fidelity when
    it works, but can invent garbled signage despite the negative prompt -- opt-in.
    """
    from PIL import Image               # lazy
    from ai_layer.creative.layout import FORMATS           # lazy, avoids an import cycle at module load
    if fmt not in FORMATS:
        raise ValueError(f"unknown format {fmt!r}")
    tw, th = FORMATS[fmt]
    src = Image.open(src_path).convert("RGB")
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)

    if mode == "generative":
        return _outpaint_generative(src, out, tw, th, prompt, negative)

    canvas = _cover_blur(src, tw, th)                 # blurred scene fills the margins
    fg = _fit(src, tw, th)                            # sharp source, centered
    canvas.paste(fg, ((tw - fg.width) // 2, (th - fg.height) // 2))
    canvas.save(out)
    return {"provider": "reframe-blur", "model": "pillow",
            "path": str(out), "cost_usd": 0.0}


def _outpaint_generative(src, out, tw, th, prompt, negative) -> dict:
    """FLUX fill (inpaint) painting the new margins via a canvas + mask. Opt-in."""
    import fal_client                   # lazy
    from PIL import Image, ImageDraw     # lazy
    fg = _fit(src, tw, th)
    ox, oy = (tw - fg.width) // 2, (th - fg.height) // 2
    canvas = Image.new("RGB", (tw, th), (127, 127, 127))
    canvas.paste(fg, (ox, oy))
    mask = Image.new("L", (tw, th), 255)              # white = regenerate the new margins
    ImageDraw.Draw(mask).rectangle([ox, oy, ox + fg.width - 1, oy + fg.height - 1], fill=0)
    cpath = out.with_name(out.stem + "_canvas.png"); canvas.save(cpath)
    mpath = out.with_name(out.stem + "_mask.png"); mask.save(mpath)
    text = _suppress(prompt or "extend the scene naturally, matching the existing "
                     "style, lighting and colors", negative)
    args = {"image_url": fal_client.upload_file(str(cpath)),
            "mask_url": fal_client.upload_file(str(mpath)), "prompt": text}
    res = fal_client.subscribe(config.IMAGE_OUTPAINT_MODEL, arguments=args, with_logs=False)
    _download(res["images"][0]["url"], out)
    return {"provider": "flux_fill", "model": config.IMAGE_OUTPAINT_MODEL,
            "path": str(out), "cost_usd": ledger.image_cost("flux_fill", tw, th)}
