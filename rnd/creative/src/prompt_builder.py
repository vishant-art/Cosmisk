"""Assemble the final image prompt from an ad concept + the locked brand kit.

This is the consistency glue: every prompt carries the same palette (with hex),
visual style, and tone, so a text-to-image run stays on-brand across concepts.
The logo is passed to the model as a REFERENCE IMAGE (not described here), since
re-referencing the asset holds it steadier than re-describing it.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schemas import AdConcept, BrandKit  # noqa: E402


def build_image_prompt(concept: AdConcept, kit: BrandKit, aspect: str = "4:5") -> str:
    dos = "; ".join(kit.dos) if kit.dos else "—"
    donts = "; ".join(kit.donts) if kit.donts else "—"
    return (
        f"{concept.scene}\n\n"
        f"Brand: {kit.brand_name}. Visual style: {kit.visual_style}. "
        f"Use the brand palette exactly: {kit.palette_str()}. "
        f"Mood/tone: {kit.tone}. "
        f"Do: {dos}. Don't: {donts}. "
        f"High-end advertising photography, {aspect} aspect ratio, "
        f"leave clean negative space for a logo and copy. "
        f"No text, words, or watermarks in the image (copy is added in post)."
    )


def build_logo_prompt(kit: BrandKit) -> str:
    return (
        f"Minimal, modern brand logo for '{kit.brand_name}'. {kit.logo.brief} "
        f"Use the brand palette: {kit.palette_str()}. "
        f"Vector-style, flat, centered on a plain white background, high contrast, "
        f"no photographic background, no extra text beyond the brand name."
    )
