# tests/generation/test_builders.py
"""Golden tests for the deterministic prompt builders (`generation/builders.py`).

These pin exact output strings on purpose: `build_portrait_prompt`,
`build_image_prompt`, `build_video_prompt`, and `build_voice_request` are
pure compilers (planning contracts in, provider request dataclasses out),
so for a fixed input there is exactly one correct output and the test
should say what it is, byte for byte.

The fixture below is a single self-contained "luxury linen blazer" ad --
one CreativeSpec, one CharacterSheet, a 3-shot ShotSpec, and one Product --
built the same way `tests/contracts/test_planning_contracts.py` builds its
fixtures, and grounded in the worked examples from
`docs/Cosmisk Creative Studio Schema Specification v2.md` (identity,
appearance, narrative, camera, composition, creative_direction, voice
strategy, and AI-metadata fields all mirror that doc's own examples).
"""
from __future__ import annotations

import re

from creative_studio.contracts import (
    CharacterSheet,
    CreativeSpec,
    Product,
    Shot,
    ShotSpec,
    Timing,
    new_id,
)
from creative_studio.generation.builders import (
    NEGATIVE_PROMPT,
    ImagePrompt,
    VideoPrompt,
    build_image_prompt,
    build_portrait_prompt,
    build_video_prompt,
    build_voice_request,
)


# ---------------------------------------------------------------------------
# Fixtures -- one coherent "luxury linen blazer" ad, mirroring the schema
# doc's own worked examples field for field.
# ---------------------------------------------------------------------------

def make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        marketing_objective={"objective": "Conversions"},
        product={"productId": "product_1"},
        audience={},
        messaging={
            "cta": "Shop Now",
            "coreMessage": "Premium tailoring made effortless.",
            "hook": "POV: You finally found a suit that actually fits.",
            "supportingPoints": ["Premium linen", "Comfortable", "Luxury finish"],
        },
        creative_direction={
            "style": "Luxury UGC",
            "visualMood": "Warm",
            "lighting": "Soft Natural",
            "cameraStyle": "Handheld",
            "editingStyle": "Minimal",
            "pacing": "Fast",
        },
        platform={"platform": "Instagram", "aspectRatio": "9:16", "maxDuration": 10, "safeMargins": True},
        voice_strategy={
            "tone": "Conversational",
            "energy": "High",
            "voiceGender": "Female",
            "delivery": "Authentic UGC",
        },
        constraints={},
        references={},
    )


def make_sheet() -> CharacterSheet:
    return CharacterSheet(
        id=new_id("character"),
        creative_spec_id="creative_1",
        identity={
            "gender": "Female",
            "approximateAge": 27,
            "ethnicity": "South Asian",
            "role": "Young Professional",
            "occupationStyle": "Corporate",
        },
        appearance={
            "hair": {"color": "Dark Brown", "length": "Shoulder Length", "style": "Straight"},
            "eyes": {"color": "Brown"},
            "skinTone": "Medium",
            "bodyType": "Average",
            "facialFeatures": ["Sharp Jawline", "Defined Eyebrows", "Friendly Smile"],
        },
        wardrobe={},
        personality={"tone": "Warm", "confidence": "High"},
        expressions={},
        speaking_style={"pace": "Measured", "accent": "Neutral Indian"},
        reference_assets={},
        conditioning={},
        references={},
    )


def make_sheet_minimal() -> CharacterSheet:
    """A sheet with no `hair` and no `facialFeatures` -- for
    `test_missing_fields_skip_cleanly`."""
    return CharacterSheet(
        id=new_id("character"),
        creative_spec_id="creative_1",
        identity={"gender": "Male", "approximateAge": 41, "ethnicity": "Northern European"},
        appearance={"skinTone": "Fair", "bodyType": "Athletic"},
        wardrobe={},
        personality={"tone": "Reserved"},
        expressions={},
        speaking_style={"pace": "Measured"},
        reference_assets={},
        conditioning={},
        references={},
    )


def make_product() -> Product:
    return Product(
        id=new_id("product"),
        shopify={
            "shopifyProductId": "shopify_1",
            "handle": "aria-signature-tailoring-no-4",
            "vendor": "Meridian & Co",
            "productType": "Blazer",
            "tags": ["blazer", "linen"],
            "status": "Active",
        },
        commercial={
            "title": "Aria Signature Tailoring No. 4",
            "description": "A tailored linen blazer.",
            "price": "249.00",
            "currency": "USD",
            "availability": "in_stock",
        },
        variants=[],
        collections=[],
        original_assets={"images": [{"r2Uri": "r2://bucket/products/product_1/original.jpg"}]},
        derived_assets={"dominantColors": ["charcoal grey", "navy"]},
        placement_assets={},
        ai_metadata={
            "category": "Blazer",
            "style": "Luxury",
            "material": "Linen",
            "fit": "Slim",
            "season": "Summer",
            "gender": "Womenswear",
        },
        provider_metadata={},
    )


def make_shot(n: int, purpose: str, dur: float, **fields) -> Shot:
    return Shot(shot_number=n, purpose=purpose, duration=dur, **fields)


def make_shot_spec() -> ShotSpec:
    shot1 = make_shot(
        1, "Hook", 3,
        narrative={
            "summary": "Character notices the perfectly fitting blazer for the first time.",
            "goal": "Capture attention",
            "viewerEmotion": "Curiosity",
        },
        camera={"shotType": "Medium", "angle": "Eye Level", "movement": "Handheld", "focus": "Character", "lens": "35mm"},
        character={"expression": "Excited", "pose": "Standing", "gaze": "Camera", "action": "adjusts blazer sleeve while glancing at the mirror"},
        product={"visibility": "High", "placement": "Worn", "focus": "Upper Body", "replacementRequired": True},
        dialogue={"spokenText": "I wasn't expecting this suit to fit this well.", "subtitle": "Premium tailoring made effortless."},
        audio={},
        composition={"subjectPosition": "Center", "productVisibility": "Primary", "background": "Modern office"},
        constraints={},
    )
    shot2 = make_shot(
        2, "Product", 4,
        narrative={
            "summary": "Character showcases the blazer's tailored silhouette while moving through a sunlit office corridor.",
            "goal": "Build desire",
            "viewerEmotion": "Confidence",
        },
        camera={"shotType": "Wide", "angle": "Low", "movement": "Slow push-in", "focus": "Product", "lens": "50mm"},
        character={"expression": "Confident", "pose": "Walking", "gaze": "Product", "action": "adjusts the cuff and studies the fit in a nearby mirror"},
        product={"visibility": "High", "placement": "Worn", "focus": "Full Body"},
        dialogue={"spokenText": "Every stitch feels intentional", "subtitle": "Precision tailoring, zero compromise."},
        audio={},
        composition={"subjectPosition": "Center-left", "productVisibility": "Primary", "background": "Sunlit modern office corridor"},
        constraints={},
    )
    shot3 = make_shot(
        3, "CTA", 3,
        narrative={
            "summary": "Character smiles warmly at the camera beside a clean product display.",
            "goal": "Drive action",
            "viewerEmotion": "Trust",
        },
        camera={"shotType": "Close-up", "angle": "Eye Level", "movement": "Static", "focus": "Character", "lens": "24mm"},
        character={"expression": "Warm", "pose": "Standing", "gaze": "Camera", "action": "smiles and gestures toward the display"},
        product={"visibility": "Medium", "placement": "Displayed", "focus": "Full Body"},
        dialogue={"spokenText": "You'll feel it the moment you put it on!", "subtitle": "Shop the collection today."},
        audio={},
        composition={"subjectPosition": "Center", "productVisibility": "Secondary", "background": "Clean studio backdrop"},
        constraints={},
    )
    return ShotSpec(
        id=new_id("shotspec"),
        creative_spec_id="creative_1",
        character_id="character_1",
        story_structure={},
        timing=Timing(total_duration=10, shot_durations=[3, 4, 3]),
        global_style={"aspectRatio": "9:16", "fps": 30, "lighting": "Soft Natural", "editingStyle": "Minimal", "cameraStyle": "Handheld"},
        shots=[shot1, shot2, shot3],
        transition_rules={},
        rendering_rules={},
        references={},
    )


def make_shot_minimal() -> Shot:
    """A shot with no `camera.lens` -- for `test_missing_fields_skip_cleanly`."""
    return make_shot(
        1, "Hook", 3,
        narrative={"summary": "Character presents the piece plainly."},
        camera={"shotType": "Medium", "angle": "Eye Level", "movement": "Static"},
        character={"expression": "Calm", "gaze": "Camera", "action": "stands still"},
        product={"visibility": "Medium"},
        dialogue={"spokenText": "Simple and clean."},
        composition={"background": "Plain backdrop"},
    )


# ---------------------------------------------------------------------------
# NEGATIVE_PROMPT
# ---------------------------------------------------------------------------

def test_negative_prompt_contains_forbidden_terms():
    assert "logo" in NEGATIVE_PROMPT
    assert "watermark" in NEGATIVE_PROMPT
    assert "text" in NEGATIVE_PROMPT


# ---------------------------------------------------------------------------
# build_portrait_prompt
# ---------------------------------------------------------------------------

def test_portrait_prompt_golden():
    sheet = make_sheet()

    assert build_portrait_prompt(sheet) == (
        "Professional portrait photograph of a 27-year-old South Asian woman, "
        "with shoulder length dark brown hair, medium skin tone, sharp jawline, "
        "defined eyebrows, friendly smile, photographed against a neutral studio "
        "background with soft diffused lighting, natural expression, photorealistic"
    )


# ---------------------------------------------------------------------------
# build_image_prompt
# ---------------------------------------------------------------------------

def test_image_prompt_golden_shot2():
    spec = make_spec()
    sheet = make_sheet()
    product = make_product()
    shot2 = make_shot_spec().shots[1]

    result = build_image_prompt(shot2, sheet, spec, product)

    assert isinstance(result, ImagePrompt)
    assert result.prompt == (
        "Character showcases the blazer's tailored silhouette while moving through "
        "a sunlit office corridor. Adjusts the cuff and studies the fit in a nearby "
        "mirror. 27-year-old South Asian woman, shoulder length dark brown hair, "
        "confident expression. Wide shot, Low angle, Slow push-in camera, 50mm lens. "
        "Sunlit modern office corridor. Soft Natural lighting. Luxury UGC, social "
        "media advertisement aesthetic. subject positioned Center-left. wearing a "
        "plain generic blazer in charcoal grey. ultra realistic, high detail, "
        "professional photography, cinematic, sharp focus"
    )
    assert result.negative_prompt == NEGATIVE_PROMPT
    assert result.width == 1080
    assert result.height == 1920
    assert result.reference_image_urls == ()

    # Placeholder garment text is category + colour only -- never brand/title/vendor.
    assert product.commercial["title"] not in result.prompt
    assert product.shopify["vendor"] not in result.prompt
    assert "Aria" not in result.prompt
    assert "Meridian" not in result.prompt


# ---------------------------------------------------------------------------
# build_video_prompt
# ---------------------------------------------------------------------------

def test_video_prompt_golden_shot1():
    sheet = make_sheet()
    shot1 = make_shot_spec().shots[0]

    result = build_video_prompt(shot1, sheet)

    assert isinstance(result, VideoPrompt)
    assert result.prompt == (
        "Character adjusts blazer sleeve while glancing at the mirror. maintains "
        "eye contact with camera. Handheld camera movement, Medium shot. conveys "
        "curiosity mood"
    )
    assert result.duration_seconds == 4
    assert result.image_url is None


# ---------------------------------------------------------------------------
# build_voice_request
# ---------------------------------------------------------------------------

def test_voice_request_joins_dialogue():
    spec = make_spec()
    sheet = make_sheet()
    shots = make_shot_spec().shots

    result = build_voice_request(shots, spec, sheet)

    assert result.text == (
        "I wasn't expecting this suit to fit this well. Every stitch feels "
        "intentional. You'll feel it the moment you put it on!"
    )
    assert result.voice_id == "Wise_Woman"
    assert result.speed == 1.0
    assert result.energy == "High"


# ---------------------------------------------------------------------------
# Determinism
# ---------------------------------------------------------------------------

def test_determinism():
    spec = make_spec()
    sheet = make_sheet()
    product = make_product()
    shot2 = make_shot_spec().shots[1]
    shot1 = make_shot_spec().shots[0]

    assert build_image_prompt(shot2, sheet, spec, product) == build_image_prompt(shot2, sheet, spec, product)
    assert build_video_prompt(shot1, sheet) == build_video_prompt(shot1, sheet)


# ---------------------------------------------------------------------------
# Missing fields skip cleanly
# ---------------------------------------------------------------------------

def test_missing_fields_skip_cleanly():
    spec = make_spec()
    sheet_min = make_sheet_minimal()
    product = make_product()
    shot_min = make_shot_minimal()

    portrait = build_portrait_prompt(sheet_min)
    image = build_image_prompt(shot_min, sheet_min, spec, product)
    video = build_video_prompt(shot_min, sheet_min)

    for text in (portrait, image.prompt, video.prompt):
        assert "None" not in text
        assert "  " not in text
        assert not re.search(r",\s*,", text)


def test_scene_summary_without_punctuation_gets_seam():
    """Regression test: when narrative.summary lacks trailing punctuation,
    the seam between summary and action uses ". " uniformly, not a bare space.
    This prevents run-ons like "blazer Adjusts" and ensures "blazer. Adjusts".
    """
    spec = make_spec()
    sheet = make_sheet()
    product = make_product()

    # Shot with summary lacking trailing punctuation
    shot = make_shot(
        1, "Hook", 3,
        narrative={"summary": "Character notices the blazer"},  # No period
        camera={"shotType": "Medium", "angle": "Eye Level"},
        character={"expression": "Interested", "action": "adjusts the cuff"},
        product={"visibility": "High", "placement": "Worn"},
        dialogue={"spokenText": "Nice fit."},
        composition={"background": "Modern office"},
    )

    result = build_image_prompt(shot, sheet, spec, product)

    # Assert the seam is ". " not bare space
    assert "Character notices the blazer. Adjusts the cuff" in result.prompt
    assert "blazer Adjusts" not in result.prompt
