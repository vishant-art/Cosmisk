from __future__ import annotations

import os
import secrets

import pytest

from creative_studio.config import get_settings
from creative_studio.storage.r2 import R2Store, key_for

# ---------------------------------------------------------------------------
# key_for: pure function, no network, no settings required.
# ---------------------------------------------------------------------------

def test_keyframe_raw():
    assert key_for("keyframe_raw", generation_id="g1", shot=2) == "creative-studio/runs/g1/keyframes/shot2/raw.png"

def test_keyframe_replaced():
    key = key_for("keyframe_replaced", generation_id="g1", shot=3)
    assert key == "creative-studio/runs/g1/keyframes/shot3/replaced.png"

def test_clip():
    assert key_for("clip", generation_id="g1", shot=1) == "creative-studio/runs/g1/clips/shot1.mp4"

def test_product_original():
    key = key_for("product_original", brand_id="b1", product_id="p1", filename="hero.jpg")
    assert key == "creative-studio/brands/b1/products/p1/original/hero.jpg"

def test_product_cutout_default_filename():
    key = key_for("product_cutout", brand_id="b1", product_id="p1")
    assert key == "creative-studio/brands/b1/products/p1/cutouts/cutout.png"

def test_product_cutout_explicit_filename():
    key = key_for("product_cutout", brand_id="b1", product_id="p1", filename="v2.png")
    assert key == "creative-studio/brands/b1/products/p1/cutouts/v2.png"

def test_product_mask_default_filename():
    key = key_for("product_mask", brand_id="b1", product_id="p1")
    assert key == "creative-studio/brands/b1/products/p1/masks/mask.png"

def test_portrait_default_filename():
    assert key_for("portrait", generation_id="g1") == "creative-studio/runs/g1/portraits/primary.png"

def test_portrait_explicit_filename():
    key = key_for("portrait", generation_id="g1", filename="alt.png")
    assert key == "creative-studio/runs/g1/portraits/alt.png"

def test_voice():
    assert key_for("voice", generation_id="g1") == "creative-studio/runs/g1/voice/narration.wav"

def test_subtitles():
    assert key_for("subtitles", generation_id="g1") == "creative-studio/runs/g1/voice/subtitles.srt"

def test_final_video():
    assert key_for("final_video", generation_id="g1") == "creative-studio/runs/g1/final/ad.mp4"

def test_final_static():
    assert key_for("final_static", generation_id="g1") == "creative-studio/runs/g1/final/static.png"

def test_thumbnail():
    assert key_for("thumbnail", generation_id="g1") == "creative-studio/runs/g1/final/thumb.jpg"

def test_unknown_kind_raises_value_error():
    with pytest.raises(ValueError, match="unknown"):
        key_for("not_a_real_kind", generation_id="g1")

def test_missing_part_raises_value_error_naming_the_part():
    with pytest.raises(ValueError, match="shot"):
        key_for("keyframe_raw", generation_id="g1")

def test_missing_part_on_clip_names_the_part():
    with pytest.raises(ValueError, match="generation_id"):
        key_for("clip", shot=1)

# ---------------------------------------------------------------------------
# Live smoke: exercises the real R2 bucket. Cheap (one small text object) and
# self-cleaning (deletes what it creates). Skips when storage credentials
# are not configured, mirroring tests/storage's DSN-guard pattern.
# ---------------------------------------------------------------------------

def _resolve_storage_key() -> str:
    try:
        return get_settings().storage_access_key_id
    except Exception:
        return os.environ.get("STORAGE_ACCESS_KEY_ID", "")

skip_unless_live_storage = pytest.mark.skipif(
    not _resolve_storage_key(),
    reason="STORAGE_ACCESS_KEY_ID not set; skipping live R2 round-trip test",
)

@skip_unless_live_storage
def test_r2_round_trip():
    settings = get_settings()
    store = R2Store(settings)
    key = f"creative-studio/_smoke/task8_{secrets.token_hex(8)}.txt"
    body = b"cosmisk task-8 r2 smoke test"

    try:
        uri = store.put_bytes(key, body, "text/plain")
        assert uri == f"r2://{settings.storage_bucket}/{key}"

        assert store.exists(key) is True
        assert store.get_bytes(key) == body

        url = store.presign(key)
        assert url.startswith("https://")
        assert key in url

        assert store.key_from_uri(uri) == key
    finally:
        store.delete(key)

    assert store.exists(key) is False
