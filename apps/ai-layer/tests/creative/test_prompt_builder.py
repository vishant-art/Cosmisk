"""The prompt must carry the brand's palette + style so images stay on-brand."""
from __future__ import annotations

import sys
from pathlib import Path

from ai_layer.creative import prompt_builder


def test_image_prompt_carries_brand(brand_kit, concepts):
    p = prompt_builder.build_image_prompt(concepts[0], brand_kit, aspect="9:16")
    assert "#0FB5AE" in p                      # hex palette injected
    assert "Lumen" in p                        # brand name
    assert "9:16" in p                         # aspect
    assert concepts[0].scene in p              # the concept's scene


def test_positive_prompt_does_not_prime_text_or_logo(brand_kit, concepts):
    # naming "logo"/"text" in the POSITIVE prompt makes models draw them; suppression
    # must live only in the negative prompt, never the positive. (Word boundaries so
    # legitimate words like "texture" don't trip the "text" check.)
    import re
    p = prompt_builder.build_image_prompt(concepts[0], brand_kit).lower()
    for word in ("logo", "text", "watermark", "copy", "typography", "wordmark"):
        assert not re.search(rf"\b{word}\b", p), f"positive prompt should not mention '{word}'"


def test_negative_prompt_suppresses_text_and_logo():
    neg = prompt_builder.build_negative_prompt().lower()
    for word in ("text", "logo", "watermark", "letters", "signature"):
        assert word in neg


def test_logo_prompt_uses_brief(brand_kit):
    p = prompt_builder.build_logo_prompt(brand_kit)
    assert "Lumen" in p
    assert "lamp glyph" in p                    # from logo.brief
    assert "white background" in p
