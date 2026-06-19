"""The prompt must carry the brand's palette + style so images stay on-brand."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import prompt_builder  # noqa: E402


def test_image_prompt_carries_brand(brand_kit, concepts):
    p = prompt_builder.build_image_prompt(concepts[0], brand_kit, aspect="9:16")
    assert "#0FB5AE" in p                      # hex palette injected
    assert "Lumen" in p                        # brand name
    assert "9:16" in p                         # aspect
    assert concepts[0].scene in p              # the concept's scene
    assert "No text" in p                      # text excluded (added in post)


def test_logo_prompt_uses_brief(brand_kit):
    p = prompt_builder.build_logo_prompt(brand_kit)
    assert "Lumen" in p
    assert "lamp glyph" in p                    # from logo.brief
    assert "white background" in p
