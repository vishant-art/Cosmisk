"""BrandKit validation -- the brain's output must parse into a typed kit."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from ai_layer.creative.schemas import BrandKit  # noqa: E402


def test_valid_kit_parses(brand_kit):
    assert brand_kit.brand_name == "Lumen"
    assert brand_kit.palette[0].css() == "#0FB5AE"
    assert "primary #0FB5AE" in brand_kit.palette_str()


def test_bad_hex_rejected():
    bad = dict(brand_name="X", tagline="y", palette=[{"role": "primary", "hex": "nothex"}],
               typography={}, tone="t", voice_keywords=[], dos=[], donts=[],
               visual_style="v", logo={"brief": "b"})
    with pytest.raises(ValidationError):
        BrandKit.model_validate(bad)


def test_bad_palette_role_rejected():
    bad = dict(brand_name="X", tagline="y", palette=[{"role": "neon", "hex": "#112233"}],
               typography={}, tone="t", voice_keywords=[], dos=[], donts=[],
               visual_style="v", logo={"brief": "b"})
    with pytest.raises(ValidationError):
        BrandKit.model_validate(bad)
