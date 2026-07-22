# tests/generation/test_fal_adapters_live.py
"""Live fal smokes for the Task 17 render adapters -- ONE per adapter, real
network, real spend. Gated behind BOTH `CS_LIVE_SMOKE=1` and a configured
`FAL_KEY`, mirroring `tests/planning/test_planners.py` and
`tests/storage/test_r2.py`'s skip-gate pattern, so a plain
`python -m pytest` never spends money by accident.

NOT RUN as part of Task 17 (per the task brief: unit-faked only, live smokes
written but skip-gated and not executed). They run later, under supervision,
as part of Task 26's live run (docs/Working Copy Implementation Plan.md).

Each smoke is exactly ONE paid fal call -- where an adapter needs a source
image (cutout, placement, video i2v), it reuses the same real, publicly
accessible Shopify CDN image already committed in
`ingestion/fixtures/shopify_products.json`, rather than chaining prior paid
adapter calls to manufacture a "real" scene/cutout. That keeps this file's
total live cost bounded to 5 calls, at the cheapest arguments each model
accepts. Every uploaded R2 object is deleted in a `finally` block.
"""
from __future__ import annotations

import os
import secrets

import pytest

from creative_studio.config import get_settings
from creative_studio.generation.adapters import fal_bria, fal_birefnet, fal_image, fal_tts, fal_video
from creative_studio.generation.adapters.base import FalAdapter
from creative_studio.generation.builders import ImagePrompt, VideoPrompt, VoiceRequest
from creative_studio.storage.r2 import R2Store

# A real, small, publicly-accessible product photo already committed to the repo
# (same fixture `tests/ingestion` uses for Shopify normalization), reused here as
# the cheapest available real https source image for cutout/placement/i2v smokes.
_SAMPLE_PRODUCT_IMAGE_URL = (
    "https://cdn.shopify.com/s/files/1/0821/3381/1487/files/089A8607.jpg?v=1754912486"
)


def _resolve_fal_key() -> str:
    try:
        return get_settings().fal_key
    except Exception:
        return os.environ.get("FAL_KEY", "")


skip_unless_live_smoke = pytest.mark.skipif(
    os.environ.get("CS_LIVE_SMOKE") != "1" or not _resolve_fal_key(),
    reason="set CS_LIVE_SMOKE=1 and configure FAL_KEY to run these paid live fal adapter smokes",
)


def _smoke_key(name: str) -> str:
    return f"creative-studio/_smoke/task17_{name}_{secrets.token_hex(6)}"


@skip_unless_live_smoke
async def test_generate_image_live():
    settings = get_settings()
    adapter = FalAdapter(settings)
    r2 = R2Store(settings)
    prompt = ImagePrompt(
        prompt="a small red apple on a plain white studio background, photorealistic",
        negative_prompt="watermark, text, logo",
        width=512,
        height=512,
    )
    key = _smoke_key("image.png")

    try:
        uri, meta = await fal_image.generate_image(adapter, r2, prompt, key)
        assert uri == f"r2://{settings.storage_bucket}/{key}"
        assert meta["modelId"] == "fal-ai/flux-2-flex"
        assert r2.exists(key)
    finally:
        r2.delete(key)


@skip_unless_live_smoke
async def test_remove_background_live():
    settings = get_settings()
    adapter = FalAdapter(settings)
    r2 = R2Store(settings)
    key = _smoke_key("cutout.png")

    try:
        uri, meta = await fal_birefnet.remove_background(adapter, r2, _SAMPLE_PRODUCT_IMAGE_URL, key)
        assert uri == f"r2://{settings.storage_bucket}/{key}"
        assert meta["modelId"] == "fal-ai/birefnet/v2"
        assert r2.exists(key)
    finally:
        r2.delete(key)


@skip_unless_live_smoke
async def test_place_product_live():
    settings = get_settings()
    adapter = FalAdapter(settings)
    r2 = R2Store(settings)
    key = _smoke_key("placed.png")

    try:
        # Reuses the one real sample image for both roles (see module docstring):
        # this is a wire-level smoke, not a creative-quality check.
        uri, meta = await fal_bria.place_product(
            adapter, r2,
            scene_url=_SAMPLE_PRODUCT_IMAGE_URL,
            product_cutout_url=_SAMPLE_PRODUCT_IMAGE_URL,
            key=key,
        )
        assert uri == f"r2://{settings.storage_bucket}/{key}"
        assert meta["modelId"] == "fal-ai/bria/product-shot"
        assert r2.exists(key)
    finally:
        r2.delete(key)


@skip_unless_live_smoke
async def test_generate_clip_live():
    settings = get_settings()
    adapter = FalAdapter(settings)
    r2 = R2Store(settings)
    vp = VideoPrompt(prompt="the apple slowly rotates", duration_seconds=4, image_url=_SAMPLE_PRODUCT_IMAGE_URL)
    key = _smoke_key("clip.mp4")

    try:
        uri, meta = await fal_video.generate_clip(adapter, r2, vp, key)
        assert uri == f"r2://{settings.storage_bucket}/{key}"
        assert meta["modelId"] == "bytedance/seedance-2.0/image-to-video"
        assert r2.exists(key)
    finally:
        r2.delete(key)


@skip_unless_live_smoke
async def test_synthesize_voice_live():
    settings = get_settings()
    adapter = FalAdapter(settings)
    r2 = R2Store(settings)
    vr = VoiceRequest(text="Testing.", voice_id="Wise_Woman")
    key = _smoke_key("voice.mp3")

    try:
        uri, meta = await fal_tts.synthesize_voice(adapter, r2, vr, key)
        assert uri == f"r2://{settings.storage_bucket}/{key}"
        assert meta["modelId"] == "fal-ai/minimax/speech-02-hd"
        assert r2.exists(key)
    finally:
        r2.delete(key)
