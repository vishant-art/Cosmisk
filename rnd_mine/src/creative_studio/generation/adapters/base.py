# src/creative_studio/generation/adapters/base.py
"""fal adapter base: model IDs, video-duration snapping, and the single seam
that touches fal for real (render) generation.

Model ids are ported verbatim from `apps/ai-layer/ai_layer/creative/config.py`
(verified June 2026 against a live account). `ALLOWED_VIDEO_DURATIONS` mirrors
that module's `VIDEO_ALLOWED_DURATIONS` -- Seedance 2.0 accepts only this
discrete set of clip lengths (7/9/11/13/14s are rejected by the API).

`FalAdapter.__init__` is the ONLY place render credentials (`FAL_KEY`) are
wired into the environment. It never reads or sets the admin key
(`FAL_ADMIN_KEY`) -- that key is for billing reads only, see `balance.py`.
The two-key split is deliberate: the render path never carries admin scope.
"""
from __future__ import annotations

import math
import os

import fal_client
import httpx

MODEL_IDS: dict[str, str] = {
    "image": "fal-ai/flux-2-flex",
    "image_fallback": "fal-ai/flux-2-pro",
    "cutout": "fal-ai/birefnet/v2",
    "placement": "fal-ai/bria/product-shot",
    "video_i2v": "bytedance/seedance-2.0/image-to-video",
    "tts": "fal-ai/minimax/speech-02-hd",
}

# Seedance's discrete accepted durations (seconds). Not a range: 7, 9, 11, 13,
# and 14 are rejected by the API.
ALLOWED_VIDEO_DURATIONS: tuple[int, ...] = (4, 5, 6, 8, 10, 12, 15)


def video_duration_for(shot_seconds: float) -> int:
    """Smallest allowed Seedance duration that covers `shot_seconds`.

    Snaps up to the smallest value in `ALLOWED_VIDEO_DURATIONS` that is
    `>= ceil(shot_seconds)`. Raises `ValueError` when the requested length
    exceeds even the longest allowed duration.
    """
    needed = math.ceil(shot_seconds)
    for duration in ALLOWED_VIDEO_DURATIONS:
        if duration >= needed:
            return duration
    raise ValueError(
        f"shot_seconds={shot_seconds!r} needs {needed}s, which exceeds the "
        f"longest allowed Seedance duration ({ALLOWED_VIDEO_DURATIONS[-1]}s)"
    )


class FalAdapterError(Exception):
    """Raised when a fal asset download fails (non-200 response).

    The message carries only the HTTP status and the URL path -- never a
    query string, which may carry a signed-URL token.
    """


class FalAdapter:
    """Thin wrapper around `fal_client` (render) and httpx (asset download).

    This is the single place render generation touches fal: `submit` wraps
    `fal_client.subscribe_async`, `download` fetches the resulting asset
    bytes over HTTP. Construction wires `FAL_KEY` from `settings.fal_key`
    into the environment (the only place that happens); it never touches
    `settings.fal_admin_key`.
    """

    def __init__(self, settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._settings = settings
        self._transport = transport
        os.environ["FAL_KEY"] = settings.fal_key

    async def submit(self, model_id: str, arguments: dict) -> dict:
        """Submit `arguments` to `model_id` and wait for the fal queue result."""
        return await fal_client.subscribe_async(model_id, arguments=arguments)

    async def download(self, url: str) -> bytes:
        """GET `url` and return the raw response bytes.

        Raises `FalAdapterError` on a non-200 response.
        """
        async with httpx.AsyncClient(transport=self._transport, follow_redirects=True) as client:
            response = await client.get(url)
        if response.status_code != 200:
            raise FalAdapterError(
                f"fal download failed: HTTP {response.status_code} for {response.url.path}"
            )
        return response.content
