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


# --- per-shot video prompt -----------------------------------------------------

def _shot(camera="selfie", motion="walks in", product_visible="absent",
          subject="a woman to camera"):
    from ai_layer.creative.schemas import Shot
    return Shot(purpose="hook", duration_s=3, camera=camera, subject=subject,
                product_visible=product_visible, motion=motion, dialogue=None)


def test_each_camera_gets_a_distinct_move(brand_kit):
    """Video's whole value-add over a still is motion. The live run shipped identical
    boilerplate camera on every shot; each camera must now carry its own move."""
    selfie = prompt_builder.build_shot_prompt(_shot(camera="selfie"), brand_kit)
    macro = prompt_builder.build_shot_prompt(_shot(camera="macro"), brand_kit)
    wide = prompt_builder.build_shot_prompt(_shot(camera="handheld_wide"), brand_kit)
    assert "push-in" in selfie
    assert "focus settling" in macro
    assert "follow the action" in wide


def test_ugc_shot_drops_the_brand_visual_style(brand_kit):
    """The brand's polished visual_style is the studio track's look; a UGC shot must not
    carry it, or it fights the 'real photo a customer took' craft (the live run demanded
    both at once). The brand NAME is fine (no visual priming)."""
    from ai_layer.creative import config
    from ai_layer.creative.schemas import UGCStyle
    style = UGCStyle(**config.UGC_STYLE_DEFAULT)
    ugc = prompt_builder.build_shot_prompt(_shot(), brand_kit, style=style)
    studio = prompt_builder.build_shot_prompt(_shot(), brand_kit, style=None)
    assert brand_kit.visual_style not in ugc
    assert brand_kit.visual_style in studio
    assert brand_kit.brand_name in ugc


def test_motion_has_no_doubled_period(brand_kit):
    """A shot.motion that already ends in a period produced 'dress fabric..' in the live run."""
    p = prompt_builder.build_shot_prompt(
        _shot(motion="woman's head, dress fabric."), brand_kit)
    assert "The shot moves: woman's head, dress fabric. " in p
    assert ".." not in p
