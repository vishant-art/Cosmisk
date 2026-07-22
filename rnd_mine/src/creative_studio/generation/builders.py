"""Deterministic prompt builders: planning contracts in, provider request
dataclasses out.

These are pure compiler functions -- no LLM calls, no I/O, no randomness.
Everything here is a straight, rule-based translation of already-approved
planning artifacts (`CreativeSpec`, `CharacterSheet`, `Shot`, `Product`)
into the exact request shape a generation provider (Flux, Seedance, a TTS
model) expects. Same inputs must always produce byte-identical outputs --
that determinism is what the golden tests in
`tests/generation/test_builders.py` pin down.

Block order and wording for `build_image_prompt` follow
`docs/Prompt Architecture & Planning Layer.md` Sec. 9 (Image Prompt
Builder); `build_video_prompt` follows Sec. 12 (Video Prompt Builder).
`NEGATIVE_PROMPT` is copied verbatim from that doc's Sec. 9 "Negative
Prompt" list.
"""
from __future__ import annotations

from dataclasses import dataclass

from creative_studio.contracts import CharacterSheet, CreativeSpec, Product, Shot

from .adapters.base import video_duration_for

NEGATIVE_PROMPT: str = (
    "low quality, blurry, extra fingers, extra arms, deformed anatomy, "
    "poor lighting, cropped face, duplicate body, watermark, text, logo, "
    "artifacts, incorrect clothing folds"
)

_TERMINAL_PUNCTUATION = (".", "!", "?")


@dataclass(frozen=True)
class ImagePrompt:
    """A Flux-ready image generation request."""

    prompt: str
    negative_prompt: str
    width: int = 1080
    height: int = 1920
    reference_image_urls: tuple[str, ...] = ()


@dataclass(frozen=True)
class VideoPrompt:
    """A Seedance-ready image-to-video generation request."""

    prompt: str
    duration_seconds: int
    image_url: str | None = None


@dataclass(frozen=True)
class VoiceRequest:
    """A TTS narration request."""

    text: str
    voice_id: str = "Wise_Woman"
    speed: float = 1.0
    energy: str | None = None


# ---------------------------------------------------------------------------
# Shared string helpers
# ---------------------------------------------------------------------------

def _gender_noun(gender: str | None) -> str:
    """Map an `identity.gender` value to the noun used in prose prompts.

    Anything other than a recognized "Female"/"Male" value (missing,
    non-binary, unrecognized) falls back to the neutral "person" -- this
    function must always return a usable word, never skip.
    """
    normalized = (gender or "").strip().lower()
    if normalized == "female":
        return "woman"
    if normalized == "male":
        return "man"
    return "person"


def _character_leading(identity: dict) -> str:
    """The "{age}-year-old {ethnicity} {gender_noun}" fragment shared by
    `build_portrait_prompt` and `build_image_prompt`'s Character block.

    Age/ethnicity are dropped cleanly when absent; `gender_noun` always
    contributes a word, so this never returns an empty string.
    """
    age = identity.get("approximateAge")
    ethnicity = identity.get("ethnicity")
    words = [
        f"{age}-year-old" if age is not None else "",
        ethnicity or "",
        _gender_noun(identity.get("gender")),
    ]
    return " ".join(w for w in words if w)


def _hair_clause(appearance: dict) -> str:
    """Build "{length} {color} hair", lowercased, with either half dropped
    cleanly if the source data doesn't have it. Empty when neither is
    present (no bare "hair")."""
    hair = appearance.get("hair") or {}
    words = [str(v).lower() for v in (hair.get("length"), hair.get("color")) if v]
    if not words:
        return ""
    return " ".join(words) + " hair"


def _labelled(value, suffix: str) -> str:
    """Build "{value} {suffix}" when `value` is present, else "" -- the
    building block for the Camera clauses in both the image and video
    prompts."""
    return f"{value} {suffix}" if value else ""


def _join_clauses(clauses: list[str], sep: str = ", ") -> str:
    """Join only the non-empty clauses -- how every block below skips a
    missing field without leaving a stray separator or double comma."""
    return sep.join(clause for clause in clauses if clause)


def _upper_first(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text


def _lower_first(text: str) -> str:
    return text[:1].lower() + text[1:] if text else text


def _strip_terminal(text: str) -> str:
    """Drop one trailing '.', '!' or '?' so blocks can be joined with '. '
    below without ever doubling punctuation at the seam."""
    text = text.strip()
    if text.endswith(_TERMINAL_PUNCTUATION):
        return text[:-1]
    return text


def _assemble(blocks: list[str]) -> str:
    """Turn an ordered block list into the final prompt string: drop empty
    blocks, strip each remaining block's trailing terminal punctuation,
    and join what's left with '. '."""
    cleaned = [_strip_terminal(block) for block in blocks if block]
    return ". ".join(block for block in cleaned if block)


# ---------------------------------------------------------------------------
# Portrait
# ---------------------------------------------------------------------------

def build_portrait_prompt(sheet: CharacterSheet) -> str:
    """A single deterministic sentence describing `sheet` for the portrait
    generation step (doc Sec. 10). Every clause -- hair, skin tone, facial
    features -- is optional and dropped cleanly when its source field is
    absent, never leaving "None", a double space, or a double comma
    behind (see `test_missing_fields_skip_cleanly`).
    """
    identity = sheet.identity
    appearance = sheet.appearance

    leading = "a " + _character_leading(identity)

    hair = _hair_clause(appearance)
    hair_clause = f"with {hair}" if hair else ""

    skin_tone = appearance.get("skinTone")
    skin_clause = f"{skin_tone.lower()} skin tone" if skin_tone else ""

    features = appearance.get("facialFeatures") or []
    features_clause = ", ".join(str(f).lower() for f in features) if features else ""

    clauses = _join_clauses([hair_clause, skin_clause, features_clause])

    sentence = f"Professional portrait photograph of {leading}"
    if clauses:
        sentence += f", {clauses}"
    sentence += (
        ", photographed against a neutral studio background with soft "
        "diffused lighting, natural expression, photorealistic"
    )
    return sentence


# ---------------------------------------------------------------------------
# Image prompt
# ---------------------------------------------------------------------------

def build_image_prompt(shot: Shot, sheet: CharacterSheet, spec: CreativeSpec, product: Product) -> ImagePrompt:
    """Compile one `Shot` into a Flux-ready `ImagePrompt` (doc Sec. 9).

    Blocks are assembled in a fixed order -- Scene, Character, Camera,
    Environment, Lighting, Style, Composition, Placeholder, Quality -- and
    any block with nothing to say is dropped rather than emitted empty.

    The Placeholder block never contains the product's brand, title, or
    vendor: it is built only from `product.ai_metadata.category` (a
    generic descriptor, e.g. "blazer") and the first dominant colour, per
    the architecture's "generate a realistic placeholder garment, replace
    it with the real product later" design.
    """
    narrative = shot.narrative
    camera = shot.camera
    character = shot.character
    composition = shot.composition
    direction = spec.creative_direction

    # Scene: what's happening, from the narrative summary plus the
    # character's action (capitalized so it reads as its own sentence).
    # Pass as separate entries to _assemble so the standard ". " seam
    # handles punctuation uniformly, preventing run-ons when summary
    # lacks trailing punctuation.
    summary = narrative.get("summary") or ""
    action = character.get("action") or ""

    # Character: identity + hair (shared with the portrait builder) plus
    # this shot's own expression -- never the advertised garment.
    leading = _character_leading(sheet.identity)
    hair = _hair_clause(sheet.appearance)
    expression = character.get("expression")
    expression_clause = f"{expression.lower()} expression" if expression else ""
    character_block = _join_clauses([leading, hair, expression_clause])

    # Camera: entirely from shot.camera, present parts only.
    camera_block = _join_clauses([
        _labelled(camera.get("shotType"), "shot"),
        _labelled(camera.get("angle"), "angle"),
        _labelled(camera.get("movement"), "camera"),
        _labelled(camera.get("lens"), "lens"),
    ])

    # Environment: from shot composition.
    environment = composition.get("background") or ""

    # Lighting: from the creative direction, only when specified.
    lighting = direction.get("lighting")
    lighting_block = f"{lighting} lighting" if lighting else ""

    # Style: from the creative direction, only when specified.
    style = direction.get("style")
    style_block = f"{style}, social media advertisement aesthetic" if style else ""

    # Composition: subject placement, only when specified.
    subject_position = composition.get("subjectPosition")
    composition_block = f"subject positioned {subject_position}" if subject_position else ""

    # Product Placeholder: category + colour only, fallback "garment",
    # NEVER brand/title/vendor text.
    category = str(product.ai_metadata.get("category") or "garment").lower()
    placeholder = f"wearing a plain generic {category}"
    dominant_colors = product.derived_assets.get("dominantColors") or []
    if dominant_colors:
        placeholder += f" in {dominant_colors[0]}"

    # Quality: fixed tokens, always present.
    quality = "ultra realistic, high detail, professional photography, cinematic, sharp focus"

    prompt = _assemble([
        summary, _upper_first(action), character_block, camera_block, environment,
        lighting_block, style_block, composition_block, placeholder, quality,
    ])

    return ImagePrompt(prompt=prompt, negative_prompt=NEGATIVE_PROMPT)


# ---------------------------------------------------------------------------
# Video prompt
# ---------------------------------------------------------------------------

def build_video_prompt(shot: Shot, sheet: CharacterSheet) -> VideoPrompt:
    """Compile one `Shot` into a Seedance-ready `VideoPrompt` (doc Sec. 12).

    `sheet` is accepted for signature symmetry with `build_image_prompt`
    (and to leave room for the doc's "reference portrait injection"
    continuity step once that's wired) but isn't consumed by the
    deterministic text below -- today's video prompt is built entirely
    from `shot`.
    """
    character = shot.character
    camera = shot.camera
    narrative = shot.narrative

    action = character.get("action") or ""
    motion = f"Character {_lower_first(action)}" if action else ""

    gaze = "maintains eye contact with camera" if character.get("gaze") == "Camera" else ""

    camera_block = _join_clauses([
        _labelled(camera.get("movement"), "camera movement"),
        _labelled(camera.get("shotType"), "shot"),
    ])

    emotion = narrative.get("viewerEmotion")
    mood = f"conveys {emotion.lower()} mood" if emotion else ""

    prompt = _assemble([motion, gaze, camera_block, mood])

    return VideoPrompt(prompt=prompt, duration_seconds=video_duration_for(shot.duration))


# ---------------------------------------------------------------------------
# Voice request
# ---------------------------------------------------------------------------

def _normalize_sentence(text: str) -> str:
    """Strip whitespace and guarantee a trailing '.', '!' or '?'."""
    stripped = text.strip()
    if not stripped or stripped.endswith(_TERMINAL_PUNCTUATION):
        return stripped
    return stripped + "."


def build_voice_request(shots: list[Shot], spec: CreativeSpec, sheet: CharacterSheet) -> VoiceRequest:
    """Join every shot's dialogue into one narration script (doc Sec. 13).

    No rewriting: each `spokenText` is used verbatim (only whitespace-
    trimmed and punctuation-normalized) and concatenated in shot order.
    `sheet` is accepted for signature symmetry (future voice-persona
    wiring) but isn't consumed here -- voice parameters come only from
    `spec.voice_strategy`.
    """
    sentences = (_normalize_sentence(shot.dialogue.get("spokenText", "")) for shot in shots)
    text = " ".join(sentence for sentence in sentences if sentence)

    return VoiceRequest(
        text=text,
        voice_id="Wise_Woman",
        speed=1.0,
        energy=spec.voice_strategy.get("energy"),
    )
