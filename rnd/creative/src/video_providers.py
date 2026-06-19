"""Video generation with primary + fallback (gated behind --video; costs dollars).

  primary  = Veo 3.1 (veo-3.1-generate-preview) via google-genai (long-running poll)
  fallback = Seedance 2.0 (bytedance/seedance-2.0/*) via fal-client

SDK imports are LAZY. Each provider returns {provider, model, path, cost_usd}.
Output URLs are temporary (Veo 2-day, fal *.fal.media) -- both fns download to disk
immediately.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import ledger  # noqa: E402


def _veo(prompt: str, out_path: Path, *, image=None, aspect="9:16",
         duration=8, resolution="720p", poll_s=10, log=print) -> dict:
    from google import genai          # lazy
    from google.genai import types

    client = genai.Client(api_key=config.GEMINI_API_KEY)
    cfg = types.GenerateVideosConfig(aspect_ratio=aspect, resolution=resolution,
                                     duration_seconds=str(duration))
    kwargs = {"model": config.VIDEO_PRIMARY_MODEL, "prompt": prompt, "config": cfg}
    if image:
        kwargs["image"] = types.Image.from_file(location=str(image))
    op = client.models.generate_videos(**kwargs)
    while not op.done:
        log(f"  [veo] rendering... ({poll_s}s)")
        time.sleep(poll_s)
        op = client.operations.get(op)
    vid = op.response.generated_videos[0]
    client.files.download(file=vid.video)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    vid.video.save(str(out_path))
    return {"provider": "veo", "model": config.VIDEO_PRIMARY_MODEL,
            "path": str(out_path), "cost_usd": ledger.video_cost("veo", duration, resolution)}


def _seedance(prompt: str, out_path: Path, *, image=None, aspect="9:16",
              duration=5, resolution="720p", log=print) -> dict:
    import fal_client                  # lazy
    import requests

    if image:
        endpoint = config.VIDEO_FALLBACK_I2V
        args = {"prompt": prompt, "image_url": fal_client.upload_file(str(image)),
                "resolution": resolution, "duration": str(duration), "aspect_ratio": aspect}
    else:
        endpoint = config.VIDEO_FALLBACK_T2V
        args = {"prompt": prompt, "resolution": resolution,
                "duration": str(duration), "aspect_ratio": aspect}
    res = fal_client.subscribe(endpoint, arguments=args, with_logs=False)
    url = res["video"]["url"]
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(requests.get(url, timeout=300).content)
    return {"provider": "seedance", "model": endpoint, "path": str(out_path),
            "cost_usd": ledger.video_cost("seedance", duration, resolution)}


_PROVIDERS = {"veo": _veo, "seedance": _seedance}
_FALLBACK = {"veo": "seedance", "seedance": "veo"}


def generate_video(prompt: str, out_path, *, provider="veo", image=None, aspect="9:16",
                   duration=8, resolution="720p", log=print) -> dict:
    return _PROVIDERS[provider](prompt, Path(out_path), image=image, aspect=aspect,
                                duration=duration, resolution=resolution, log=log)


def generate_with_fallback(prompt: str, out_path, *, primary="veo", image=None,
                           aspect="9:16", duration=8, resolution="720p", log=print) -> dict:
    try:
        return generate_video(prompt, out_path, provider=primary, image=image,
                              aspect=aspect, duration=duration, resolution=resolution, log=log)
    except Exception as e:  # noqa: BLE001
        fb = _FALLBACK[primary]
        log(f"  [video] {primary} failed ({e!s:.120}); falling back to {fb}")
        res = generate_video(prompt, out_path, provider=fb, image=image, aspect=aspect,
                            duration=duration, resolution=resolution, log=log)
        res["fell_back_from"] = primary
        return res
