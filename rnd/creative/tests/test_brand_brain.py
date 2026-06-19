"""The brain turns the summary into a validated kit + concepts (fake LLM client)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import brand_brain  # noqa: E402


def test_generate_brand_kit(fake_client):
    kit = brand_brain.generate_brand_kit(fake_client, "ACCOUNT: Test")
    assert kit.brand_name == "Lumen"
    assert len(kit.palette) == 3


def test_generate_concepts_count(fake_client, brand_kit):
    out = brand_brain.generate_concepts(fake_client, brand_kit, "ctx", 3)
    assert len(out) == 3
    assert out[0].title == "Morning Glow"


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
    out = brand_brain.generate_concepts(_OneShot(), brand_kit, "ctx", 2)
    assert len(out) == 2          # synthesises placeholders rather than returning nothing
