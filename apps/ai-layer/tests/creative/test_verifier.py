"""QA gate: deterministic checks (contrast, safe-zone, presence) + a VLM critic.
Honors 'reject, don't log' -- a failed creative does not ship."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image

from ai_layer.creative import compositor
from ai_layer.creative import layout
from ai_layer.creative import verifier
from ai_layer.creative.schemas import LayoutBox, LayoutSpec  # noqa: E402

# reuse the fake OpenRouter client shape from conftest
from conftest import FakeClient  # noqa: E402


# --- pure contrast math -------------------------------------------------------

def test_contrast_ratio_black_white_is_21():
    assert round(verifier.contrast_ratio(verifier.rel_lum((255, 255, 255)),
                                         verifier.rel_lum((0, 0, 0)))) == 21


def test_region_contrast_high_for_text_on_dark_low_for_uniform():
    # white text band on black
    hi = Image.new("RGB", (100, 100), "black")
    for y in range(40, 60):
        for x in range(100):
            hi.putpixel((x, y), (255, 255, 255))
    assert verifier.region_contrast(hi, (0, 0, 1, 1)) > 3.0
    flat = Image.new("RGB", (100, 100), (128, 128, 128))
    assert verifier.region_contrast(flat, (0, 0, 1, 1)) < 1.5


# --- deterministic checks -----------------------------------------------------

def test_check_safe_zone_flags_box_in_reserved_area():
    spec = LayoutSpec(fmt="9:16", width=1080, height=1920,
                      safe_zone={"top": 0.14, "bottom": 0.20, "left": 0.06, "right": 0.06},
                      boxes=[LayoutBox(role="headline", x=0.06, y=0.02, w=0.5, h=0.1)])
    assert verifier.check_safe_zone(spec).passed is False


def test_check_presence_requires_cta(copyset):
    good = layout.plan_layout(copyset, "4:5")
    assert verifier.check_presence(good, copyset).passed is True
    no_cta = LayoutSpec(**{**good.model_dump(), "boxes":
                           [b for b in good.model_dump()["boxes"] if b["role"] != "cta"]})
    assert verifier.check_presence(no_cta, copyset).passed is False


# --- integrated verify --------------------------------------------------------

def _good_ad(copyset, brand_kit, tmp_path):
    bg = tmp_path / "bg.png"
    Image.new("RGB", (1080, 1350), "white").save(bg)
    spec = layout.plan_layout(copyset, "4:5", has_logo=False)
    ad = compositor.compose(bg, spec, copyset, tmp_path / "ad.png", kit=brand_kit)
    return ad, spec


def test_verify_passes_for_good_ad(copyset, brand_kit, tmp_path):
    ad, spec = _good_ad(copyset, brand_kit, tmp_path)
    report = verifier.verify(ad, spec, copyset)
    assert report.approved, [c for c in report.checks if not c.passed]


def test_verify_fails_when_cta_missing(copyset, brand_kit, tmp_path):
    ad, spec = _good_ad(copyset, brand_kit, tmp_path)
    spec.boxes = [b for b in spec.boxes if b.role != "cta"]
    report = verifier.verify(ad, spec, copyset)
    assert report.verdict == "fail"
    assert report.retry_hint


# --- VLM critic ---------------------------------------------------------------

def test_vlm_critic_pass_and_fail(copyset, brand_kit, tmp_path):
    ad, _ = _good_ad(copyset, brand_kit, tmp_path)
    yes = FakeClient(lambda _sys: json.dumps({"passed": True, "issues": []}))
    no = FakeClient(lambda _sys: json.dumps({"passed": False, "issues": ["headline covers product"]}))
    assert verifier.vlm_critique(ad.path, copyset, client=yes).passed is True
    bad = verifier.vlm_critique(ad.path, copyset, client=no)
    assert bad.passed is False and "covers product" in bad.detail


def test_vlm_system_drops_logo_rule_when_not_expected():
    assert "logo is missing" in verifier._vlm_system(expect_logo=True)
    sys_no = verifier._vlm_system(expect_logo=False)
    assert "logo is missing" not in sys_no
    assert "intentionally has NO logo" in sys_no


def test_verify_includes_vlm_when_requested(copyset, brand_kit, tmp_path):
    ad, spec = _good_ad(copyset, brand_kit, tmp_path)
    no = FakeClient(lambda _sys: json.dumps({"passed": False, "issues": ["off-brand"]}))
    report = verifier.verify(ad, spec, copyset, client=no, run_vlm=True)
    assert any(c.name == "vlm_critic" for c in report.checks)
    assert report.verdict == "fail"
