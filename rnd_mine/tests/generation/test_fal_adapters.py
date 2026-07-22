# tests/generation/test_fal_adapters.py
"""Unit tests for the fal render adapters (image, cutout, placement, video, tts).

Every test drives the adapter through `FakeFalAdapter` (records every `(model_id,
arguments)` submit call and every download url; returns one canned result per
instance) and the shared `FakeR2` double from the project-root conftest. No
`fal_client`, no `httpx`, no `boto3`, no network -- these tests can never spend
money.

Canned results are shaped exactly like the REAL response for each model, per
fal's own published API schema (fetched July 2026) cross-checked against the
working, live-verified calls in `apps/ai-layer/ai_layer/creative/`:

  - image (fal-ai/flux-2-flex):        {"images": [{"url", "content_type"}], "seed"}
  - cutout (fal-ai/birefnet/v2):       {"image": {"url", "content_type"}}  (singular)
  - placement (fal-ai/bria/product-shot): {"images": [{"url", "content_type"}]}
  - video (bytedance/seedance-2.0/image-to-video): {"video": {"url"}, "seed"}
  - tts (fal-ai/minimax/speech-02-hd): {"audio": {"url", "content_type"}, "duration_ms"}

See `.superpowers/sdd/task-17-report.md` for the schema citations and the
argument-shape deltas this uncovered versus the original plan.
"""
from __future__ import annotations

import pytest

from creative_studio.generation.adapters import fal_bria, fal_birefnet, fal_image, fal_tts, fal_video
from creative_studio.generation.adapters.base import MODEL_IDS, FalAdapterError
from creative_studio.generation.builders import ImagePrompt, VideoPrompt, VoiceRequest


class FakeFalAdapter:
    """Records every `(model_id, arguments)` submit call and every download url.
    Returns the single canned `result` dict for every `submit` call (each test
    constructs its own instance, since each adapter function submits to exactly
    one model)."""

    def __init__(self, result: dict) -> None:
        self.result = result
        self.calls: list[tuple[str, dict]] = []
        self.download_urls: list[str] = []

    async def submit(self, model_id: str, arguments: dict) -> dict:
        self.calls.append((model_id, arguments))
        return self.result

    async def download(self, url: str) -> bytes:
        self.download_urls.append(url)
        return b"fake-bytes"


# ---------------------------------------------------------------------------
# fal_image.generate_image
# ---------------------------------------------------------------------------

async def test_generate_image_sends_exact_arguments_and_stores_result(fake_r2):
    prompt = ImagePrompt(
        prompt="A woman in a blazer",
        negative_prompt="watermark, text, logo",
        width=1080,
        height=1920,
    )
    adapter = FakeFalAdapter({
        "images": [{"url": "https://fal.media/files/x/img.png", "content_type": "image/png"}],
        "seed": 42,
    })

    uri, meta = await fal_image.generate_image(
        adapter, fake_r2, prompt, "creative-studio/runs/g1/keyframes/shot1/raw.png"
    )

    assert adapter.calls == [(
        MODEL_IDS["image"],
        {
            "prompt": "A woman in a blazer",
            "image_size": {"width": 1080, "height": 1920},
            "output_format": "png",
        },
    )]
    # Regression: forbidden tokens must NOT be named in the prompt sent to FLUX
    # (naming them can prime the draw; FLUX ignores negative phrasing anyway).
    sent_prompt = adapter.calls[0][1]["prompt"]
    assert "watermark" not in sent_prompt
    assert "logo" not in sent_prompt
    assert adapter.download_urls == ["https://fal.media/files/x/img.png"]
    assert uri == "r2://test-bucket/creative-studio/runs/g1/keyframes/shot1/raw.png"
    assert meta == {"modelId": MODEL_IDS["image"], "seed": 42}
    assert fake_r2.put_calls == [("creative-studio/runs/g1/keyframes/shot1/raw.png", "image/png")]


async def test_generate_image_includes_reference_urls_when_given(fake_r2):
    prompt = ImagePrompt(
        prompt="A blazer scene",
        negative_prompt="",
        reference_image_urls=("https://fake-presign/ref1.png", "https://fake-presign/ref2.png"),
    )
    adapter = FakeFalAdapter({"images": [{"url": "https://fal.media/files/x/img.png"}]})

    await fal_image.generate_image(adapter, fake_r2, prompt, "k.png")

    _, arguments = adapter.calls[0]
    assert arguments["image_urls"] == ["https://fake-presign/ref1.png", "https://fake-presign/ref2.png"]
    assert arguments["prompt"] == "A blazer scene"  # empty negative_prompt: no suffix, no trailing space


async def test_generate_image_omits_image_urls_when_no_references(fake_r2):
    prompt = ImagePrompt(prompt="A blazer scene", negative_prompt="")
    adapter = FakeFalAdapter({"images": [{"url": "https://fal.media/files/x/img.png"}]})

    await fal_image.generate_image(adapter, fake_r2, prompt, "k.png")

    _, arguments = adapter.calls[0]
    assert "image_urls" not in arguments


async def test_generate_image_falls_back_to_default_content_type(fake_r2):
    prompt = ImagePrompt(prompt="A blazer scene", negative_prompt="")
    adapter = FakeFalAdapter({"images": [{"url": "https://fal.media/files/x/img.png"}]})  # no content_type

    await fal_image.generate_image(adapter, fake_r2, prompt, "k.png")

    assert fake_r2.put_calls == [("k.png", "image/png")]


async def test_generate_image_missing_url_raises_fal_adapter_error(fake_r2):
    adapter = FakeFalAdapter({"seed": 1})  # no "images" key at all
    prompt = ImagePrompt(prompt="x", negative_prompt="")

    with pytest.raises(FalAdapterError) as exc_info:
        await fal_image.generate_image(adapter, fake_r2, prompt, "k.png")

    message = str(exc_info.value)
    assert MODEL_IDS["image"] in message
    assert "seed" in message


# ---------------------------------------------------------------------------
# fal_birefnet.remove_background
# ---------------------------------------------------------------------------

async def test_remove_background_sends_exact_arguments_and_stores_result(fake_r2):
    adapter = FakeFalAdapter({
        "image": {"url": "https://fal.media/files/x/cutout.png", "content_type": "image/png"},
    })

    uri, meta = await fal_birefnet.remove_background(
        adapter, fake_r2, "https://fake-presign/product.png",
        "creative-studio/brands/b1/products/p1/cutouts/cutout.png",
    )

    assert adapter.calls == [(
        MODEL_IDS["cutout"],
        {"image_url": "https://fake-presign/product.png"},
    )]
    assert adapter.download_urls == ["https://fal.media/files/x/cutout.png"]
    assert uri == "r2://test-bucket/creative-studio/brands/b1/products/p1/cutouts/cutout.png"
    assert meta == {"modelId": MODEL_IDS["cutout"]}
    assert fake_r2.put_calls == [
        ("creative-studio/brands/b1/products/p1/cutouts/cutout.png", "image/png"),
    ]


async def test_remove_background_surfaces_mask_url_when_present(fake_r2):
    adapter = FakeFalAdapter({
        "image": {"url": "https://fal.media/files/x/cutout.png"},
        "mask_image": {"url": "https://fal.media/files/x/mask.png"},
    })

    _, meta = await fal_birefnet.remove_background(adapter, fake_r2, "https://fake-presign/product.png", "k.png")

    assert meta == {"modelId": MODEL_IDS["cutout"], "maskUrl": "https://fal.media/files/x/mask.png"}


async def test_remove_background_missing_url_raises_fal_adapter_error(fake_r2):
    adapter = FakeFalAdapter({"error": "unsupported image format"})

    with pytest.raises(FalAdapterError) as exc_info:
        await fal_birefnet.remove_background(adapter, fake_r2, "https://fake-presign/product.png", "k.png")

    message = str(exc_info.value)
    assert MODEL_IDS["cutout"] in message
    assert "error" in message


# ---------------------------------------------------------------------------
# fal_bria.place_product
# ---------------------------------------------------------------------------

async def test_place_product_sends_exact_arguments_and_stores_result(fake_r2):
    adapter = FakeFalAdapter({
        "images": [{"url": "https://fal.media/files/x/placed.png", "content_type": "image/png"}],
    })

    uri, meta = await fal_bria.place_product(
        adapter, fake_r2,
        scene_url="https://fake-presign/scene.png",
        product_cutout_url="https://fake-presign/cutout.png",
        key="creative-studio/runs/g1/keyframes/shot1/replaced.png",
    )

    assert adapter.calls == [(
        MODEL_IDS["placement"],
        {
            "image_url": "https://fake-presign/cutout.png",
            "ref_image_url": "https://fake-presign/scene.png",
            "placement_type": "manual_placement",
            "manual_placement_selection": "bottom_center",
        },
    )]
    assert adapter.download_urls == ["https://fal.media/files/x/placed.png"]
    assert uri == "r2://test-bucket/creative-studio/runs/g1/keyframes/shot1/replaced.png"
    assert meta == {"modelId": MODEL_IDS["placement"]}
    assert fake_r2.put_calls == [
        ("creative-studio/runs/g1/keyframes/shot1/replaced.png", "image/png"),
    ]


async def test_place_product_missing_url_raises_fal_adapter_error(fake_r2):
    adapter = FakeFalAdapter({"detail": "invalid placement_type"})

    with pytest.raises(FalAdapterError) as exc_info:
        await fal_bria.place_product(adapter, fake_r2, "https://x/scene.png", "https://x/cutout.png", "k.png")

    message = str(exc_info.value)
    assert MODEL_IDS["placement"] in message
    assert "detail" in message


# ---------------------------------------------------------------------------
# fal_video.generate_clip
# ---------------------------------------------------------------------------

async def test_generate_clip_sends_exact_arguments_and_stores_result(fake_r2):
    vp = VideoPrompt(
        prompt="Character adjusts blazer sleeve while glancing at the mirror",
        duration_seconds=8,
        image_url="https://fake-presign/keyframe.png",
    )
    adapter = FakeFalAdapter({"video": {"url": "https://fal.media/files/x/clip.mp4"}, "seed": 123})

    uri, meta = await fal_video.generate_clip(adapter, fake_r2, vp, "creative-studio/runs/g1/clips/shot1.mp4")

    assert adapter.calls == [(
        MODEL_IDS["video_i2v"],
        {
            "prompt": "Character adjusts blazer sleeve while glancing at the mirror",
            "image_url": "https://fake-presign/keyframe.png",
            "duration": "8",
            "generate_audio": False,
        },
    )]
    assert adapter.download_urls == ["https://fal.media/files/x/clip.mp4"]
    assert uri == "r2://test-bucket/creative-studio/runs/g1/clips/shot1.mp4"
    assert meta == {"modelId": MODEL_IDS["video_i2v"], "seed": 123}
    assert fake_r2.put_calls == [("creative-studio/runs/g1/clips/shot1.mp4", "video/mp4")]


async def test_generate_clip_duration_is_stringified_per_seedance_schema(fake_r2):
    """Seedance's `duration` is a STRING enum ("4".."15"), not an int -- verified
    against fal's published schema and matching the working code's explicit
    `str(duration)` cast. This is a delta from the plan doc; see the report."""
    vp = VideoPrompt(prompt="p", duration_seconds=15, image_url="https://x/img.png")
    adapter = FakeFalAdapter({"video": {"url": "https://fal.media/files/x/clip.mp4"}})

    await fal_video.generate_clip(adapter, fake_r2, vp, "k.mp4")

    _, arguments = adapter.calls[0]
    assert arguments["duration"] == "15"
    assert isinstance(arguments["duration"], str)


async def test_generate_clip_missing_url_raises_fal_adapter_error(fake_r2):
    adapter = FakeFalAdapter({"status": "IN_QUEUE"})
    vp = VideoPrompt(prompt="p", duration_seconds=4, image_url="https://x/img.png")

    with pytest.raises(FalAdapterError) as exc_info:
        await fal_video.generate_clip(adapter, fake_r2, vp, "k.mp4")

    message = str(exc_info.value)
    assert MODEL_IDS["video_i2v"] in message
    assert "status" in message


# ---------------------------------------------------------------------------
# fal_tts.synthesize_voice
# ---------------------------------------------------------------------------

async def test_synthesize_voice_sends_exact_arguments_and_stores_result(fake_r2):
    vr = VoiceRequest(text="Premium tailoring made effortless.", voice_id="Wise_Woman", speed=1.0, energy="High")
    adapter = FakeFalAdapter({
        "audio": {"url": "https://fal.media/files/x/speech.mp3", "content_type": "audio/mpeg"},
        "duration_ms": 4200,
    })

    uri, meta = await fal_tts.synthesize_voice(adapter, fake_r2, vr, "creative-studio/runs/g1/voice/narration.wav")

    assert adapter.calls == [(
        MODEL_IDS["tts"],
        {"text": "Premium tailoring made effortless.", "voice_setting": {"voice_id": "Wise_Woman"}},
    )]
    assert adapter.download_urls == ["https://fal.media/files/x/speech.mp3"]
    assert uri == "r2://test-bucket/creative-studio/runs/g1/voice/narration.wav"
    assert meta == {"modelId": MODEL_IDS["tts"], "durationMs": 4200}
    assert fake_r2.put_calls == [
        ("creative-studio/runs/g1/voice/narration.wav", "audio/mpeg"),
    ]


async def test_synthesize_voice_falls_back_to_default_content_type(fake_r2):
    vr = VoiceRequest(text="Hi.")
    adapter = FakeFalAdapter({"audio": {"url": "https://fal.media/files/x/speech.mp3"}})  # no content_type

    await fal_tts.synthesize_voice(adapter, fake_r2, vr, "k.wav")

    assert fake_r2.put_calls == [("k.wav", "audio/mpeg")]


async def test_synthesize_voice_missing_url_raises_fal_adapter_error(fake_r2):
    adapter = FakeFalAdapter({"warning": "text truncated"})
    vr = VoiceRequest(text="")

    with pytest.raises(FalAdapterError) as exc_info:
        await fal_tts.synthesize_voice(adapter, fake_r2, vr, "k.wav")

    message = str(exc_info.value)
    assert MODEL_IDS["tts"] in message
    assert "warning" in message
