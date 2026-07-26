"""Layout planner: a CopySet + format -> a deterministic, safe-zone-respecting
LayoutSpec the compositor places. Template-bounded, no LLM, fully offline."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import layout  # noqa: E402
from schemas import CopySet  # noqa: E402


def _roles(spec):
    return {b.role for b in spec.boxes}


def test_known_formats_have_pixel_dims(copyset):
    for fmt, (w, h) in {"1:1": (1080, 1080), "4:5": (1080, 1350),
                        "9:16": (1080, 1920), "16:9": (1920, 1080)}.items():
        spec = layout.plan_layout(copyset, fmt)
        assert (spec.width, spec.height) == (w, h)
        assert spec.fmt == fmt


def test_headline_and_cta_always_present(copyset):
    roles = _roles(layout.plan_layout(copyset, "4:5"))
    assert "headline" in roles
    assert "cta" in roles


def test_logo_box_only_when_has_logo(copyset):
    assert "logo" in _roles(layout.plan_layout(copyset, "4:5", has_logo=True))
    assert "logo" not in _roles(layout.plan_layout(copyset, "4:5", has_logo=False))


def test_subhead_box_follows_copy(copyset):
    assert "subhead" in _roles(layout.plan_layout(copyset, "4:5"))           # copyset has a subhead
    bare = CopySet(headline="H", cta_label="Buy", angle="a")
    assert "subhead" not in _roles(layout.plan_layout(bare, "4:5"))


def test_legal_box_follows_copy(copyset):
    assert "legal" in _roles(layout.plan_layout(copyset, "4:5"))             # copyset has legal
    bare = CopySet(headline="H", cta_label="Buy", angle="a")
    assert "legal" not in _roles(layout.plan_layout(bare, "4:5"))


def test_story_boxes_respect_safe_zone(copyset):
    spec = layout.plan_layout(copyset, "9:16")
    assert spec.safe_zone["top"] >= 0.14 and spec.safe_zone["bottom"] >= 0.20
    for b in spec.boxes:
        if b.role in ("headline", "subhead", "cta", "legal"):
            assert b.y >= spec.safe_zone["top"] - 1e-9
            assert b.y + b.h <= 1 - spec.safe_zone["bottom"] + 1e-9


def test_all_boxes_within_unit_canvas(copyset):
    for fmt in ("1:1", "4:5", "9:16", "16:9"):
        for b in layout.plan_layout(copyset, fmt).boxes:
            assert 0 <= b.x and 0 <= b.y
            assert b.x + b.w <= 1 + 1e-9
            assert b.y + b.h <= 1 + 1e-9


def test_unknown_format_rejected(copyset):
    with pytest.raises(ValueError):
        layout.plan_layout(copyset, "7:3")
