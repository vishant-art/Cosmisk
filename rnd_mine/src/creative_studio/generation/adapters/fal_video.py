# src/creative_studio/generation/adapters/fal_video.py
"""bytedance/seedance-2.0/image-to-video adapter (i2v only -- ref2v/t2v are out
of scope for Task 17's `generate_clip`).

Argument shape is ported from the working, live-verified
`apps/ai-layer/ai_layer/creative/video_providers.py::_seedance()`, cross-checked
against fal's own published schema for this endpoint (fetched July 2026):
`duration` is a STRING enum (`"4"`.."15"`), not an integer -- confirmed by the
schema's own listed values and matching the working code's explicit
`str(duration)` cast, which is a deliberate cast, not an accident. This is a
delta from the plan doc, which wrote `"duration": vp.duration_seconds` as if
the bare int were correct.

`generate_audio` is sent explicitly as `False`: each shot's native audio would
just be discarded once the separate TTS voice track is dubbed on (T7.5 in the
apps/ai-layer editor), so it is never generated in the first place.

`resolution`/`aspect_ratio` are NOT sent -- `VideoPrompt` carries neither
field (Task 16 builder), so fal's own defaults (`"720p"` / `"auto"`, the
latter inferred from the seed image) apply. Revisit if a later task adds
those fields to `VideoPrompt`.
"""
from __future__ import annotations

from creative_studio.generation.adapters.base import MODEL_IDS, FalAdapter, FalAdapterError
from creative_studio.generation.builders import VideoPrompt
from creative_studio.storage.r2 import R2Store

_CONTENT_TYPE = "video/mp4"  # Seedance has no output_format param; mp4 is the only container.


async def generate_clip(adapter: FalAdapter, r2: R2Store, vp: VideoPrompt, key: str) -> tuple[str, dict]:
    """Generate one image-to-video clip from `vp` and store the mp4 in R2 at
    `key`.

    Returns `(r2_uri, meta)` where `meta` always carries `modelId` and, when
    fal's result includes a `seed`, that too.
    """
    model_id = MODEL_IDS["video_i2v"]
    arguments = {
        "prompt": vp.prompt,
        "image_url": vp.image_url,
        "duration": str(vp.duration_seconds),
        "generate_audio": False,
    }

    result = await adapter.submit(model_id, arguments)

    video = result.get("video") or {}
    if not video.get("url"):
        raise FalAdapterError(
            f"fal video generation returned no video url for model {model_id!r}; "
            f"result keys: {sorted(result.keys())}"
        )

    data = await adapter.download(video["url"])
    uri = r2.put_bytes(key, data, _CONTENT_TYPE)

    meta = {"modelId": model_id}
    if "seed" in result:
        meta["seed"] = result["seed"]
    return uri, meta
