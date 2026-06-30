"""Assemble the TEXT-FREE background prompt from an ad concept + the locked brand kit.

This is the consistency glue: every prompt carries the same palette (with hex),
visual style, and tone, so backgrounds stay on-brand across concepts. The prompt
describes ONLY the scene -- no text, no logo, no copy (the negative prompt suppresses
them). Logo and copy are composited deterministically afterwards (compositor.py).
"""
from __future__ import annotations

import sys
from pathlib import Path

from ai_layer.creative.schemas import AdConcept, BrandKit  # noqa: E402


# Suppression list for models with a real negative_prompt (SDXL); also appended as a
# hard instruction for instruction-following models (Gemini). DON'T put these words in
# the positive prompt -- naming "logo"/"text" there primes diffusion models to draw them.
_NEGATIVE = (
    "text, words, letters, numbers, captions, typography, font, handwriting, "
    "logo, wordmark, watermark, signature, label, sticker, badge, brand name, "
    "ui, interface, frame, border, poster text, meme text"
)


def build_negative_prompt() -> str:
    return _NEGATIVE


def build_image_prompt(concept: AdConcept, kit: BrandKit, aspect: str = "4:5") -> str:
    dos = "; ".join(kit.dos) if kit.dos else "—"
    donts = "; ".join(kit.donts) if kit.donts else "—"
    # NOTE: the positive prompt deliberately never mentions logo / text / copy / negative
    # space -- that priming is what made models render them. Suppression lives in the
    # negative prompt (build_negative_prompt), not here.
    return (
        f"{concept.scene}\n\n"
        f"Art-directed advertising photograph for {kit.brand_name}. "
        f"Visual style: {kit.visual_style}. Mood: {kit.tone}. "
        f"Color-grade deliberately to the brand palette (use it intentionally, not as flat "
        f"blocks): {kit.palette_str()}. "
        f"ONE clear hero subject, intentional composition with depth and a focal point; real, "
        f"tactile materials and authentic texture; motivated, directional lighting; premium "
        f"editorial craft. "
        f"Do: {dos}. Don't: {donts}. "
        f"Avoid the generic-stock / AI look: no plastic or waxy skin, no CGI sheen, no cliche "
        f"gradients, no clutter or random props, no over-blurred bokeh, nothing posed or "
        f"soulless-corporate. "
        f"A clean, unembellished {aspect} composition with calm, simple surroundings."
    )


def build_logo_prompt(kit: BrandKit) -> str:
    return (
        f"Design a distinctive, ownable brand logo for '{kit.brand_name}'. Concept: {kit.logo.brief} "
        f"Make it memorable and reductive -- one strong idea, well balanced, with deliberate "
        f"negative space, instantly legible even at small sizes. Use the brand palette: "
        f"{kit.palette_str()}. Flat vector style, crisp clean edges, centered on a plain white "
        f"background. Avoid cliches (generic swooshes, globes, gradient blobs, default leaf or "
        f"lightbulb marks) and any stock or templated look. No photographic background; no extra "
        f"text beyond the brand name."
    )
