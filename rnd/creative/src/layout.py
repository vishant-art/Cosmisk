"""Layout planner: turn a CopySet + target format into a LayoutSpec.

Template-bounded and deterministic (no LLM) -- the production research (AutoPoster,
BannerAgency) plans a structured layout *before* rendering. v1 uses one safe,
proven template: logo top-left, copy bottom-anchored above the bottom safe zone
(headline -> subhead -> CTA -> legal). Per-format pixel dims + Meta safe zones.
The compositor (Pillow) reads these relative boxes and draws the words.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schemas import CopySet, LayoutBox, LayoutSpec  # noqa: E402

# Target aspect ratios -> (width, height) in px. The four Meta/Google ad shapes.
FORMATS: dict[str, tuple[int, int]] = {
    "1:1": (1080, 1080),
    "4:5": (1080, 1350),
    "9:16": (1080, 1920),
    "16:9": (1920, 1080),
}


def _safe_zone(fmt: str) -> dict:
    # Stories/Reels reserve UI space top & bottom; feed shapes need only a margin.
    if fmt == "9:16":
        return {"top": 0.14, "bottom": 0.20, "left": 0.06, "right": 0.06}
    return {"top": 0.06, "bottom": 0.06, "left": 0.06, "right": 0.06}


def plan_layout(copy: CopySet, fmt: str = "4:5", *, has_logo: bool = True) -> LayoutSpec:
    if fmt not in FORMATS:
        raise ValueError(f"unknown format {fmt!r}; expected one of {sorted(FORMATS)}")
    w, h = FORMATS[fmt]
    sz = _safe_zone(fmt)
    left, right, top = sz["left"], sz["right"], sz["top"]
    content_w = 1.0 - left - right
    boxes: list[LayoutBox] = []

    if has_logo:
        boxes.append(LayoutBox(role="logo", x=left, y=top, w=0.20, h=0.07, align="left", z=10))

    # Build the copy stack bottom-up so it always sits above the bottom safe zone.
    y = 1.0 - sz["bottom"]
    if copy.legal:
        y -= 0.03
        boxes.append(LayoutBox(role="legal", x=left, y=y, w=content_w, h=0.03,
                               align="left", z=10, max_font_pt=14))
    y -= 0.025
    cta_h = 0.07
    y -= cta_h
    boxes.append(LayoutBox(role="cta", x=left, y=y, w=0.42, h=cta_h,
                           align="center", z=10, max_font_pt=36))
    y -= 0.03
    if copy.subhead:
        sub_h = 0.06
        y -= sub_h
        boxes.append(LayoutBox(role="subhead", x=left, y=y, w=content_w, h=sub_h,
                               align="left", z=10, max_font_pt=40, scrim=True))
    y -= 0.02
    head_h = 0.16
    y -= head_h
    boxes.append(LayoutBox(role="headline", x=left, y=max(y, top), w=content_w, h=head_h,
                           align="left", z=10, max_font_pt=110, scrim=True))

    return LayoutSpec(fmt=fmt, width=w, height=h, safe_zone=sz, boxes=boxes)


def plan_all_formats(copy: CopySet, formats: list[str], *, has_logo: bool = True
                     ) -> dict[str, LayoutSpec]:
    """Plan every requested format from one CopySet (drives multi-format output)."""
    return {f: plan_layout(copy, f, has_logo=has_logo) for f in formats}
