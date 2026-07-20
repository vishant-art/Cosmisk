"""Assemble the TEXT-FREE background prompt from an ad concept + the locked brand kit.

This is the consistency glue: every prompt carries the same palette (with hex),
visual style, and tone, so backgrounds stay on-brand across concepts. The prompt
describes ONLY the scene -- no text, no logo, no copy (the negative prompt suppresses
them). Logo and copy are composited deterministically afterwards (compositor.py).
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from schemas import AdConcept, BrandKit, CreatorKit, UGCStyle  # noqa: E402


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


# The old craft clause. It asks, in as many words, for an advertisement: premium,
# editorial, art-directed, motivated lighting. That is precisely the look that reads
# as "ad" in a feed. Kept for product/catalogue work via STUDIO_STYLE.
_STUDIO_CRAFT = (
    "ONE clear hero subject, intentional composition with depth and a focal point; real, "
    "tactile materials and authentic texture; motivated, directional lighting; premium "
    "editorial craft. "
)

# The UGC craft clause. Amateur capture, on purpose. Note what is NOT here: no grain,
# no compression, no shake. Those are UGCStyle `post:` fields applied deterministically
# by the editor (T7.5). Asking a diffusion model to paint grain gets you painted grain,
# which cannot then be removed.
_UGC_CRAFT = (
    "Looks like a real photo a customer took, not an advertisement. Ordinary, lived-in "
    "surroundings with a little honest mess; nothing styled or staged; natural skin and "
    "real surfaces. "
)


def build_image_prompt(concept: AdConcept, kit: BrandKit, aspect: str = "4:5",
                       style: UGCStyle | None = None) -> str:
    """Assemble the text-free background prompt.

    `style` carries only its PROMPT half into the prompt (UGCStyle.to_prompt). The
    post-processing half is a guarantee the editor keeps, and naming it here would
    turn a guarantee back into a wish.
    """
    dos = "; ".join(kit.dos) if kit.dos else "—"
    donts = "; ".join(kit.donts) if kit.donts else "—"
    # NOTE: the positive prompt deliberately never mentions logo / text / copy / negative
    # space -- that priming is what made models render them. Suppression lives in the
    # negative prompt (build_negative_prompt), not here.
    craft = _STUDIO_CRAFT
    capture = ""
    if style is not None:
        craft = _UGC_CRAFT
        fragment = style.to_prompt()
        capture = f"{fragment}. " if fragment else ""
    return (
        f"{concept.scene}\n\n"
        f"Photograph for {kit.brand_name}. {capture}"
        f"Visual style: {kit.visual_style}. Mood: {kit.tone}. "
        f"Color-grade deliberately to the brand palette (use it intentionally, not as flat "
        f"blocks): {kit.palette_str()}. "
        f"{craft}"
        f"Do: {dos}. Don't: {donts}. "
        f"Avoid the generic-stock / AI look: no plastic or waxy skin, no CGI sheen, no cliche "
        f"gradients, no clutter or random props, no over-blurred bokeh, nothing posed or "
        f"soulless-corporate. "
        f"A clean, unembellished {aspect} composition with calm, simple surroundings."
    )


# How each ShotCamera reads to a video model. The storyboard's closed set (T6) becomes
# prose here, exactly once, rather than the model being handed the enum name.
# Each entry pairs the framing with a distinct camera MOVE. A video model reads film
# vocabulary as literal instruction, and the one thing video adds over a still is motion:
# leaving every shot on the same static framing wastes it (the live run shipped identical
# boilerplate camera on all three shots). One sensible move per camera, phone-plausible.
_SHOT_CAMERA = {
    "selfie": "front-facing phone selfie held at arm's length, a slight handheld push-in",
    "handheld_wide": "handheld wide shot with the whole scene in frame, the camera drifting to follow the action",
    "close_up": "close-up that slowly pushes in on the subject",
    "macro": "extreme macro with very shallow depth of field, the focus settling onto the detail",
    "over_shoulder": "over-the-shoulder shot, easing in past the shoulder",
    "overhead": "shot from directly overhead looking down, a slow descent toward the subject",
    "pov": "first-person point of view as if through the subject's eyes, natural head motion",
}


def build_shot_prompt(shot, kit: BrandKit, style: UGCStyle | None = None,
                      hint: str | None = None, creator: "CreatorKit | None" = None,
                      direction: str | None = None) -> str:
    """The prompt for ONE storyboard shot (T7).

    Carries the same rule as the still prompt: never mention text, logo or copy. Captions
    are burned on afterwards by the editor, deterministically, and priming a video model
    with the word "text" gets you letters you then cannot remove.

    `hint` is the QA verdict from the previous attempt (T9.5, rung 1). It is stated as a
    defect to fix, not as a vague instruction to try harder.

    `creator` names WHO is on camera, and lands immediately after the subject because that
    is what it modifies. It is only ever a wish: prompt text alone will not hold a face
    across five renders, which is what the persona seed (sequencer._persona_seed) is for.
    Only the creator's VISUAL half goes here -- how they speak is the script's business.

    `direction` is the operator's free-text guide for the whole ad's look/feel; the SAME
    string steers the script (story_brain) so the words and the pictures share one intent.
    """
    camera = _SHOT_CAMERA.get(shot.camera, shot.camera.replace("_", " "))
    capture = style.to_prompt() if style is not None else ""
    craft = _UGC_CRAFT if style is not None else _STUDIO_CRAFT
    motion = f"The shot moves: {shot.motion.strip().rstrip('.').strip()}. " if shot.motion else ""
    product = {
        "hero": "The product is the subject of this shot, clearly in frame and in focus. ",
        "background": "The product is visible in the background, not the subject. ",
        "absent": "",
    }.get(shot.product_visible, "")
    fix = (f"A previous attempt was rejected for this reason: {hint}. Fix exactly that. "
           if hint else "")
    # A hero product shot is a shot OF THE PRODUCT: it is seeded from a deliberately
    # person-free still, so naming a creator in it would fight the seed.
    who = (f"{creator.to_visual_prompt()} "
           if creator is not None and shot.product_visible != "hero" else "")
    guide = f"Art direction: {direction.strip()}. " if (direction or "").strip() else ""
    # On the UGC track the brand's polished visual_style/tone fights the "real photo a
    # customer took" look, so it is dropped here. The studio track keeps it: there the
    # editorial brand identity IS the intended look. (The live run demanded both at once.)
    brand_line = (f"Filmed for {kit.brand_name}. " if style is not None
                  else f"Filmed for {kit.brand_name}. Visual style: {kit.visual_style}. "
                       f"Mood: {kit.tone}. ")

    return (
        f"{shot.subject}\n\n"
        f"{who}"
        f"{camera}. {capture + '. ' if capture else ''}"
        f"{motion}{product}"
        f"{guide}"
        f"{brand_line}"
        f"{craft}"
        f"{fix}"
        f"Avoid the generic-stock / AI look: no plastic or waxy skin, no CGI sheen, no "
        f"cliche gradients, no clutter or random props, nothing posed or "
        f"soulless-corporate."
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
