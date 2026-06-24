"""Video generation -- fal is the only provider (rebuild plan, decision D1).

Seedance 2.0, mode chosen by inputs:
  refs   -> reference-to-video  (product/brand refs)
  image  -> image-to-video      (seed = the TEXT-FREE background, NOT the finished ad)
  else   -> text-to-video       (no seed; least brand-consistent, last resort)

Copy/logo are NOT baked into the i2v input (the model would warp overlaid text); they
are composited onto the rendered clip afterwards (animated lower-third / end-card).

SDK imports are LAZY. Output URLs are temporary (*.fal.media) -- downloaded immediately.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import ledger  # noqa: E402

# resolution -> (width, height) px for the Seedance token formula (orientation
# doesn't change width*height, so one entry per resolution is enough).
_VIDEO_DIMS = {"720p": (1280, 720), "1080p": (1920, 1080), "4k": (3840, 2160)}


def _seedance(prompt: str, out_path: Path, *, image=None, refs=None, aspect="9:16",
              duration=5, resolution="720p", fast=False, log=print) -> dict:
    import fal_client                   # lazy
    import requests
    common = {"prompt": prompt, "resolution": resolution,
              "duration": str(duration), "aspect_ratio": aspect}
    if refs:
        endpoint = config.VIDEO_REF2V
        args = {**common, "image_urls": [fal_client.upload_file(str(r)) for r in refs]}
    elif image:
        endpoint = config.VIDEO_I2V
        args = {**common, "image_url": fal_client.upload_file(str(image))}
    else:
        endpoint = config.VIDEO_T2V
        args = {**common}
    res = fal_client.subscribe(endpoint, arguments=args, with_logs=False)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(requests.get(res["video"]["url"], timeout=300).content)
    bucket = ("seedance_4k" if resolution == "4k" else
              "seedance_fast" if fast else "seedance")
    w, h = _VIDEO_DIMS.get(resolution, _VIDEO_DIMS["720p"])
    return {"provider": "seedance", "model": endpoint, "path": str(out_path),
            "cost_usd": ledger.video_cost(bucket, w, h, float(duration))}


def generate_video(prompt: str, out_path, *, image=None, refs=None, aspect="9:16",
                   duration=5, resolution="720p", fast=False, log=print) -> dict:
    return _seedance(prompt, Path(out_path), image=image, refs=refs, aspect=aspect,
                     duration=duration, resolution=resolution, fast=fast, log=log)


def generate_with_fallback(prompt: str, out_path, *, image=None, refs=None, aspect="9:16",
                           duration=5, resolution="720p", fast=False, log=print) -> dict:
    """Try the seeded mode; on error drop the seed and fall back to text-to-video."""
    try:
        return generate_video(prompt, out_path, image=image, refs=refs, aspect=aspect,
                              duration=duration, resolution=resolution, fast=fast, log=log)
    except Exception as e:  # noqa: BLE001
        if not (image or refs):
            raise
        log(f"  [video] seeded mode failed ({e!s:.120}); falling back to text-to-video")
        res = generate_video(prompt, out_path, image=None, refs=None, aspect=aspect,
                            duration=duration, resolution=resolution, fast=fast, log=log)
        res["fell_back_from"] = "image-to-video"
        return res
