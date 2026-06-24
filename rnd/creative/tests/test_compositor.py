"""Pillow compositor: place copy/logo over a text-free background, deterministically.
Tests cover the pure text helpers (wrap/auto-fit) and the integrated compose()."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageStat

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import compositor  # noqa: E402
import layout  # noqa: E402


def _draw():
    return ImageDraw.Draw(Image.new("RGB", (1080, 1350)))


def test_wrap_text_respects_max_width():
    draw = _draw()
    font = compositor._font(40)
    long = "this is a fairly long headline that should wrap onto several lines"
    lines = compositor.wrap_text(draw, long, font, max_w=300)
    assert len(lines) > 1
    for ln in lines:
        w, _ = compositor._text_size(draw, ln, font)
        assert w <= 300 or " " not in ln           # a single long word may exceed


def test_fit_font_shrinks_to_fit_box():
    draw = _draw()
    short = "Hi"
    long = "An unusually long headline that simply will not fit at the maximum size"
    f_short, _ = compositor.fit_font(draw, short, max_w=600, max_h=120, max_pt=110)
    f_long, _ = compositor.fit_font(draw, long, max_w=600, max_h=120, max_pt=110)
    assert f_long.size < f_short.size               # long copy forced smaller


def test_compose_writes_png_at_format_dims(copyset, brand_kit, tmp_path):
    bg = tmp_path / "bg.png"
    Image.new("RGB", (800, 1000), "white").save(bg)
    spec = layout.plan_layout(copyset, "4:5", has_logo=False)
    out = tmp_path / "ad.png"
    ad = compositor.compose(bg, spec, copyset, out, kit=brand_kit)
    assert Path(ad.path).exists()
    img = Image.open(ad.path)
    assert img.size == (1080, 1350)                 # resized/composited to format dims
    assert (ad.width, ad.height) == (1080, 1350)


def test_compose_overlays_logo(copyset, brand_kit, tmp_path):
    bg = tmp_path / "bg.png"
    Image.new("RGB", (1080, 1350), "white").save(bg)
    logo = tmp_path / "logo.png"
    Image.new("RGBA", (200, 200), (255, 0, 0, 255)).save(logo)   # solid red logo
    spec = layout.plan_layout(copyset, "4:5", has_logo=True)
    out = tmp_path / "ad.png"
    compositor.compose(bg, spec, copyset, out, kit=brand_kit, logo_path=str(logo))
    img = Image.open(out).convert("RGB")
    # the logo box top-left region should now contain red pixels, not pure white
    lb = spec.box("logo")
    px = img.getpixel((int((lb.x + lb.w / 2) * 1080), int((lb.y + lb.h / 2) * 1350)))
    assert px[0] > px[1] and px[0] > px[2]          # reddish


def test_compose_scrim_darkens_busy_headline_region(copyset, brand_kit, tmp_path):
    # white background + a scrim'd headline box -> region must darken below pure white
    bg = tmp_path / "bg.png"
    Image.new("RGB", (1080, 1350), "white").save(bg)
    spec = layout.plan_layout(copyset, "4:5", has_logo=False)
    out = tmp_path / "ad.png"
    ad = compositor.compose(bg, spec, copyset, out, kit=brand_kit)
    img = Image.open(out).convert("L")
    hb = spec.box("headline")
    cx = int((hb.x + hb.w / 2) * 1080)
    cy = int((hb.y + hb.h / 2) * 1350)
    region = img.crop((cx - 30, cy - 10, cx + 30, cy + 10))
    mean = ImageStat.Stat(region).mean[0]
    assert mean < 250                                # scrim (and/or text) darkened it
    assert ad.scrim_used is True
