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


# --- T1: UGCStyle -------------------------------------------------------------

def _style(**kw):
    from schemas import UGCStyle
    return UGCStyle(**kw)


def test_ugc_style_swaps_the_agency_craft_clause(brand_kit, concepts):
    studio = prompt_builder.build_image_prompt(concepts[0], brand_kit)
    ugc = prompt_builder.build_image_prompt(
        concepts[0], brand_kit, style=_style(camera="handheld", lighting="window"))

    assert "premium" in studio and "editorial" in studio
    assert "premium" not in ugc and "editorial" not in ugc
    assert "not an advertisement" in ugc
    assert "handheld" in ugc and "window" in ugc


def test_post_fields_never_reach_the_prompt(brand_kit, concepts):
    """grain/shake/compression are ffmpeg GUARANTEES applied by the editor. Naming them
    in a prompt turns a guarantee back into a wish, and a diffusion model asked to paint
    grain paints grain that cannot then be removed."""
    p = prompt_builder.build_image_prompt(
        concepts[0], brand_kit,
        style=_style(camera="selfie", grain=0.4, micro_shake=3.0, recompress=True)).lower()
    for banned in ("grain", "shake", "compress", "noise", "artifact"):
        assert banned not in p


def test_ugc_prompt_still_does_not_prime_text_or_logo(brand_kit, concepts):
    import re
    p = prompt_builder.build_image_prompt(
        concepts[0], brand_kit,
        style=_style(camera="handheld", lighting="window", framing="imperfect")).lower()
    for word in ("logo", "text", "watermark", "copy", "typography", "wordmark"):
        assert not re.search(rf"\b{word}\b", p)


def test_style_is_optional_and_defaults_to_the_old_behaviour(brand_kit, concepts):
    assert (prompt_builder.build_image_prompt(concepts[0], brand_kit)
            == prompt_builder.build_image_prompt(concepts[0], brand_kit, style=None))
