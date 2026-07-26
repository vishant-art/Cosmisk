"""CopySet -- the first-class ad copy (headline / subhead / CTA / legal / angle)
that the brain emits per concept, so the compositor never parses prose."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from schemas import CopySet  # noqa: E402


def test_full_copy_parses():
    c = CopySet(headline="Light, made simple", subhead="For every room",
                cta_label="Shop now", legal="*T&C apply", angle="hero-product clarity")
    assert c.headline == "Light, made simple"
    assert c.subhead == "For every room"
    assert c.cta_label == "Shop now"
    assert c.legal == "*T&C apply"
    assert c.angle == "hero-product clarity"


def test_optional_fields_default_none():
    c = CopySet(headline="H", cta_label="Buy", angle="a")
    assert c.subhead is None
    assert c.legal is None


def test_whitespace_is_collapsed():
    c = CopySet(headline="  Light,\n  made   simple ", cta_label=" Shop now ",
                angle="x", subhead="  for   every  room  ")
    assert c.headline == "Light, made simple"
    assert c.cta_label == "Shop now"
    assert c.subhead == "for every room"


def test_blank_subhead_becomes_none():
    c = CopySet(headline="H", cta_label="Buy", angle="a", subhead="   ")
    assert c.subhead is None


def test_empty_headline_rejected():
    with pytest.raises(ValidationError):
        CopySet(headline="   ", cta_label="Buy", angle="a")


def test_empty_cta_rejected():
    with pytest.raises(ValidationError):
        CopySet(headline="H", cta_label="", angle="a")
