"""The brand brain turns the summary into a validated BrandKit (fake LLM client).

Identity only. Concepts, script, storyboard and voiceover moved to story_brain in T6:
everything that consumes a CreativeTemplate lives there. If a test here needs a
`template=`, it is in the wrong file.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import brain  # noqa: E402
import brand_brain  # noqa: E402


def test_brand_kit_parses_and_validates(fake_client):
    kit, cost = brand_brain.generate_brand_kit(fake_client, "ACCOUNT: Test")
    assert kit.brand_name == "Lumen"
    assert kit.palette[0].css() == "#0FB5AE"
    assert kit.logo.brief
    assert cost == 0.0                     # the fake response carries no usage block


def test_vision_user_embeds_winner_images(tmp_path):
    w = tmp_path / "w1.png"
    Image.new("RGB", (8, 8), "red").save(w)
    parts = brain.vision_user("ACCOUNT: X", [str(w)], "ground it")
    assert parts[0]["type"] == "text" and "ground it" in parts[0]["text"]
    assert parts[1]["type"] == "image_url"
    assert parts[1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_vision_user_caps_at_six_images(tmp_path):
    paths = []
    for i in range(9):
        p = tmp_path / f"w{i}.png"
        Image.new("RGB", (4, 4), "blue").save(p)
        paths.append(str(p))
    parts = brain.vision_user("X", paths, "ground it")
    assert len(parts) == 1 + 6             # one text part + six images


def test_grounded_kit_still_validates(fake_client, tmp_path):
    w = tmp_path / "w1.png"
    Image.new("RGB", (8, 8), "red").save(w)
    kit, _ = brand_brain.generate_brand_kit(fake_client, "ACCOUNT: X", ground_images=[str(w)])
    assert kit.brand_name == "Lumen"


def test_brand_brain_does_not_consume_a_creative_template():
    """The module boundary, asserted rather than merely documented. brand_brain is
    IDENTITY; anything that takes a measured structure and turns it into an argument
    belongs in story_brain. Checks signatures, not prose."""
    import inspect
    public = [f for n, f in vars(brand_brain).items()
              if inspect.isfunction(f) and not n.startswith("_")
              and f.__module__ == "brand_brain"]
    assert public, "expected at least generate_brand_kit"
    for fn in public:
        params = inspect.signature(fn).parameters
        assert "template" not in params, f"{fn.__name__} consumes a template; move it"
