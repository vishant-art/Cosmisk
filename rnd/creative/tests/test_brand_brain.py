"""The brain turns the summary into a validated kit + concepts (fake LLM client)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import brand_brain  # noqa: E402


def test_generate_brand_kit(fake_client):
    kit, cost = brand_brain.generate_brand_kit(fake_client, "ACCOUNT: Test")
    assert kit.brand_name == "Lumen"
    assert len(kit.palette) == 3
    assert cost == 0.0                       # fake client returns no usage.cost


def test_generate_concepts_count(fake_client, brand_kit):
    out, cost = brand_brain.generate_concepts(fake_client, brand_kit, "ctx", 3)
    assert len(out) == 3
    assert out[0].title == "Morning Glow"
    assert cost == 0.0


def test_generate_concepts_carry_copy(fake_client, brand_kit):
    out, _ = brand_brain.generate_concepts(fake_client, brand_kit, "ctx", 2)
    assert out[0].ad_copy.headline           # first-class copy, not buried in prose
    assert out[0].ad_copy.cta_label
    assert out[0].ad_copy.angle


def test_grounding_builds_multimodal_message_and_still_parses(fake_client, tmp_path):
    from PIL import Image
    w = tmp_path / "winner.png"
    Image.new("RGB", (8, 8), "white").save(w)
    # vision message is a list of parts (text + image), and the kit still validates
    parts = brand_brain._vision_user("ACCOUNT: X", [str(w)], "ground it")
    assert parts[0]["type"] == "text"
    assert any(p["type"] == "image_url" for p in parts)
    kit, _ = brand_brain.generate_brand_kit(fake_client, "ACCOUNT: X", ground_images=[str(w)])
    assert kit.brand_name == "Lumen"


class _OneShot:
    """Minimal client returning a fixed JSON string (no concepts)."""
    class _C:
        @staticmethod
        def create(**kw):
            class R:
                choices = [type("X", (), {"message": type("M", (), {"content": '{"concepts": []}'})})]
            return R()
    chat = type("Chat", (), {"completions": _C()})()


def test_concepts_fallback_when_empty(brand_kit):
    out, _ = brand_brain.generate_concepts(_OneShot(), brand_kit, "ctx", 2)
    assert len(out) == 2          # synthesises placeholders rather than returning nothing
    assert out[0].ad_copy.headline   # even placeholders carry valid copy
    assert out[0].ad_copy.cta_label
