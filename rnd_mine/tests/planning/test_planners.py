# tests/planning/test_planners.py
"""Unit tests for the Task 14 planning chain: context builder + three planners.

`FakeLLM` stands in for `PlannerLLM.complete_json`: it records each
`(system, user, model_cls)` call and returns one pre-seeded, already-valid
payload instance per call, in order -- no network calls happen here.
`PromptRegistry` is used for real (it only reads local YAML from disk), so
these tests also exercise the actual prompt templates end-to-end.

The one live test (`test_plan_creative_spec_live`) is the sole exception: it
makes a real OpenRouter call and is gated on `CS_LIVE_SMOKE=1` plus a
configured OpenRouter key, unlike the free/read-only live tests elsewhere in
this suite (R2, Postgres, Shopify) -- a real LLM call costs real money, so it
must never run by default.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import pytest

from creative_studio.config import get_settings
from creative_studio.contracts import (
    BrandContext,
    Campaign,
    CreativeSpec,
    Product,
    Shot,
    Timing,
    new_id,
)
from creative_studio.planning.context_builder import build_context
from creative_studio.planning.character_generator import _CharacterPayload, plan_character_sheet
from creative_studio.planning.creative_intelligence import _CreativeSpecPayload, plan_creative_spec
from creative_studio.planning.story_planner import _ShotSpecPayload, plan_shot_spec
from creative_studio.prompts.registry import PromptRegistry

SHOPIFY_FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "src" / "creative_studio" / "ingestion" / "fixtures" / "shopify_products.json"
)


# ---------------------------------------------------------------------------
# Minimal-but-valid contract fixtures. These are built directly against the
# contracts (not the ingestion fixtures) so the FakeLLM-driven tests stay
# fast and self-contained; the real ingestion fixtures are reserved for the
# live smoke test at the bottom of this file.
# ---------------------------------------------------------------------------

def _brand(**over) -> BrandContext:
    data = dict(
        id=new_id("brand"),
        business={"brandName": "Acme Ethnic Wear", "industry": "Fashion & Apparel"},
        branding={"positioning": "Premium Indian ethnic menswear", "toneOfVoice": "Warm, confident"},
        audience={"primaryAgeRange": "24-40", "gender": "male"},
        creative_guidelines={"preferredStyles": ["Festive UGC"]},
        historical_insights={},
        platform_connections={"shopify": {"connected": True}},
        source="ingestion",
    )
    data.update(over)
    return BrandContext(**data)


def _product(**over) -> Product:
    data = dict(
        id=new_id("product"),
        commercial={"title": "Royal Silk Kurta", "price": "89.99", "currency": "USD"},
        original_assets={
            "images": [{"sourceUrl": "https://example.com/a.jpg", "r2Uri": "r2://bucket/a.jpg", "featured": True}]
        },
        ai_metadata={"styleTags": ["festive", "silk"]},
        collections=["Festive Collection"],
        variants=[{"variantId": "v1", "sku": "SKU1"}],
        source="shopify",
    )
    data.update(over)
    return Product(**data)


def _campaign(name: str = "Diwali Push", **over) -> Campaign:
    data = dict(
        id=new_id("campaign"),
        campaign_info={"campaignName": name, "objective": "Conversions"},
        platforms={"meta": True},
        performance={"ctr": 5.4, "conversions": 968},
        creative_summary={"primaryHook": "Festive glow, tailored fit"},
        learnings={"winningHooks": ["Festive glow, tailored fit"]},
        source="meta",
    )
    data.update(over)
    return Campaign(**data)


def _creative_spec_payload(**over) -> _CreativeSpecPayload:
    data = dict(
        marketing_objective={
            "objective": "Conversions",
            "primaryGoal": "Drive festive sales",
            "secondaryGoal": "Brand awareness",
            "successMetric": "CTR",
        },
        product={"productId": "PLACEHOLDER", "reason": "Bestselling festive kurta", "priority": "Primary"},
        audience={
            "persona": "Festive shopper",
            "ageRange": "24-40",
            "painPoints": ["Hard to find a well-tailored kurta"],
            "motivations": ["Look sharp for festive occasions"],
        },
        messaging={
            "coreMessage": "Festive fit, made for you",
            "hook": "Your festive look starts here",
            "supportingPoints": ["Premium silk", "Tailored fit"],
            "cta": "Shop Now",
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
        voice_strategy={"tone": "Conversational", "energy": "High", "voiceGender": "Male", "delivery": "Authentic UGC"},
        constraints={"maxShots": 3, "productMustAppear": True, "showBrandLogo": False, "avoidTextHeavyFrames": True},
    )
    data.update(over)
    return _CreativeSpecPayload(**data)


def _character_payload(**over) -> _CharacterPayload:
    data = dict(
        identity={
            "gender": "Male",
            "approximateAge": 29,
            "ethnicity": "South Asian",
            "role": "Young Professional",
            "occupationStyle": "Corporate",
        },
        appearance={
            "hair": {"color": "Black", "length": "Short", "style": "Neat"},
            "eyes": {"color": "Brown"},
            "skinTone": "Warm tan",
            "bodyType": "Athletic",
            "facialFeatures": ["Well-groomed beard"],
        },
        wardrobe={"style": "Minimal Premium", "accessories": ["Watch"], "footwear": "Loafers", "avoid": ["Logos"]},
        personality={
            "traits": ["Confident", "Warm"],
            "energy": "High",
            "cameraComfort": "Natural",
            "overallPresence": "Premium UGC Creator",
        },
        expressions={"default": "Smile", "allowed": ["Smile", "Laugh"], "avoid": ["Frown"]},
        speaking_style={
            "pace": "Conversational",
            "tone": "Friendly",
            "energy": "High",
            "delivery": "Authentic UGC",
            "accent": "Neutral Indian English",
        },
    )
    data.update(over)
    return _CharacterPayload(**data)


def _shot(shot_number: int, purpose: str, duration: float, spoken_text: str) -> Shot:
    return Shot(
        shot_number=shot_number,
        purpose=purpose,
        duration=duration,
        narrative={"summary": "s", "goal": "g", "viewerEmotion": "e"},
        camera={"shotType": "Medium", "angle": "Eye-level", "movement": "Handheld", "focus": "Character", "lens": "35mm"},
        character={"expression": "Smile", "pose": "Relaxed", "gaze": "Camera", "action": "Talking"},
        product={"visibility": "Medium", "placement": "Hand", "focus": "Soft", "replacementRequired": True},
        dialogue={"spokenText": spoken_text, "subtitle": spoken_text},
        composition={"subjectPosition": "Center", "productVisibility": "Medium", "background": "Home"},
        constraints={"mustShowFace": True, "mustShowProduct": True, "allowTextOverlay": False},
    )


def _shot_spec_payload(**over) -> _ShotSpecPayload:
    data = dict(
        story_structure={"sequence": ["Hook", "Product", "CTA"], "throughLine": "From doubt to festive confidence."},
        timing=Timing(total_duration=10, shot_durations=[3, 4, 3]),
        global_style={
            "aspectRatio": "9:16",
            "fps": 30,
            "lighting": "Soft Natural",
            "cameraStyle": "Handheld",
            "editingStyle": "Minimal",
        },
        shots=[
            _shot(1, "Hook", 3, "Struggling to find the perfect fit?"),
            _shot(2, "Product", 4, "This festive kurta changes everything for you."),
            _shot(3, "CTA", 3, "Shop the collection now."),
        ],
        transition_rules={"transition12": "Match Cut", "transition23": "Quick Dissolve"},
        rendering_rules={"safeMargins": True, "captionAreaReserved": True, "maxMotion": "Medium"},
    )
    data.update(over)
    return _ShotSpecPayload(**data)


class FakeLLM:
    """Duck-typed stand-in for `PlannerLLM`: records calls, replays canned payloads."""

    def __init__(self, payloads):
        self._payloads = list(payloads)
        self.calls: list[tuple[str, str, type]] = []

    async def complete_json(self, system, user, model_cls, max_retries=2, temperature=0.4):
        self.calls.append((system, user, model_cls))
        return self._payloads.pop(0)


# ---------------------------------------------------------------------------
# build_context
# ---------------------------------------------------------------------------

def test_context_builder_budget():
    brand = _brand()
    product = _product()
    campaigns = [_campaign(name=f"Campaign {i}") for i in range(1, 6)]
    preference = "Make it feel festive and premium"

    full = build_context(brand, product, campaigns, preference, max_chars=10**9)
    assert "## BRAND" in full
    assert "## PRODUCT" in full
    assert "## CAMPAIGN HISTORY" in full
    assert "## USER CREATIVE PREFERENCE" in full
    assert preference in full

    # Budget that fits exactly the first campaign but not a second one.
    one_campaign_text = build_context(brand, product, campaigns[:1], preference, max_chars=10**9)
    two_campaign_text = build_context(brand, product, campaigns[:2], preference, max_chars=10**9)
    assert len(two_campaign_text) > len(one_campaign_text), "fixture too small: widen campaign payload"

    mid_budget = len(one_campaign_text) + 10
    assert mid_budget < len(two_campaign_text), "fixture too small: widen campaign payload"

    result_mid = build_context(brand, product, campaigns, preference, max_chars=mid_budget)

    assert len(result_mid) <= mid_budget
    assert "...[truncated]" not in result_mid
    assert "Campaign 1" in result_mid
    assert "Campaign 2" not in result_mid
    assert "Campaign 5" not in result_mid

    # Budget too small even for zero campaigns: hard truncation kicks in.
    zero_campaign_text = build_context(brand, product, [], preference, max_chars=10**9)
    tiny_budget = len(zero_campaign_text) - 20
    assert tiny_budget > 15, "fixture too small: widen brand/product payload"

    result_tiny = build_context(brand, product, campaigns, preference, max_chars=tiny_budget)

    assert result_tiny.endswith("...[truncated]")
    assert len(result_tiny) <= tiny_budget
    assert len(result_tiny) == tiny_budget or "...[truncated]" in result_tiny

    # Deterministic: same inputs, same output.
    result_tiny_again = build_context(brand, product, campaigns, preference, max_chars=tiny_budget)
    assert result_tiny == result_tiny_again


def test_context_builder_hard_floor():
    """Verify hard truncation never exceeds max_chars, even for tiny budgets < suffix length."""
    brand = _brand()
    product = _product()
    campaigns = [_campaign(name=f"Campaign {i}") for i in range(1, 6)]
    preference = "Make it feel festive and premium"

    # Test with max_chars=10: smaller than the 14-char suffix.
    result = build_context(brand, product, campaigns, preference, max_chars=10)

    assert len(result) <= 10
    assert "...[truncated]" in result or len(result) == 10


async def test_prompt_render_receives_context():
    brand = _brand()
    product = _product()
    campaigns = [_campaign()]
    llm = FakeLLM([_creative_spec_payload(product={"productId": product.id, "reason": "x", "priority": "Primary"})])
    registry = PromptRegistry()

    await plan_creative_spec(
        llm, registry, brand, product, campaigns, preference="unmistakable festive preference text"
    )

    assert len(llm.calls) == 1
    _system, user, _model_cls = llm.calls[0]
    assert "## BRAND" in user
    assert "unmistakable festive preference text" in user
    assert product.id in user


# ---------------------------------------------------------------------------
# plan_creative_spec
# ---------------------------------------------------------------------------

async def test_creative_spec_assembly():
    brand = _brand()
    product = _product()
    campaigns = [_campaign()]
    payload = _creative_spec_payload(
        product={"productId": product.id, "reason": "Bestselling festive kurta", "priority": "Primary"},
        constraints={"maxShots": 3, "productMustAppear": True, "showBrandLogo": True, "avoidTextHeavyFrames": True},
    )
    llm = FakeLLM([payload])
    registry = PromptRegistry()

    spec = await plan_creative_spec(
        llm,
        registry,
        brand,
        product,
        campaigns,
        preference="Make it feel festive and premium",
        platform="Instagram",
        language="English",
    )

    assert isinstance(spec, CreativeSpec)
    assert spec.status == "completed"
    assert spec.source == "planner"
    assert spec.generation_context["creativePreference"] == "Make it feel festive and premium"
    assert spec.generation_context["requestedPlatform"] == "Instagram"
    assert spec.generation_context["language"] == "English"
    assert spec.references["brandId"] == brand.id
    assert spec.references["productId"] == product.id
    assert spec.references["campaignIds"] == [c.id for c in campaigns]
    assert spec.references["promptId"] == "creative_intelligence"
    assert spec.references["promptVersion"] == 1
    # Contract forces this False regardless of what the LLM payload said.
    assert spec.constraints["showBrandLogo"] is False
    assert len(llm.calls) == 1
    assert llm.calls[0][2] is _CreativeSpecPayload


async def test_product_id_enforced(caplog):
    brand = _brand()
    product = _product()
    payload = _creative_spec_payload(product={"productId": "wrong-product-id", "reason": "x", "priority": "Primary"})
    llm = FakeLLM([payload])
    registry = PromptRegistry()

    with caplog.at_level(logging.WARNING, logger="creative_studio.planning"):
        spec = await plan_creative_spec(llm, registry, brand, product, [], preference="festive and premium")

    assert spec.product["productId"] == product.id
    assert any(record.levelno == logging.WARNING for record in caplog.records)


# ---------------------------------------------------------------------------
# Lineage: CreativeSpec -> CharacterSheet -> ShotSpec
# ---------------------------------------------------------------------------

async def test_lineage_chain():
    brand = _brand()
    product = _product()
    campaigns = [_campaign()]
    registry = PromptRegistry()

    creative_llm = FakeLLM(
        [_creative_spec_payload(product={"productId": product.id, "reason": "x", "priority": "Primary"})]
    )
    spec = await plan_creative_spec(creative_llm, registry, brand, product, campaigns, preference="festive, premium")

    character_llm = FakeLLM([_character_payload()])
    sheet = await plan_character_sheet(character_llm, registry, spec, brand)

    assert sheet.creative_spec_id == spec.id
    assert sheet.status == "draft"
    assert sheet.source == "planner"
    assert sheet.references["creativeSpecId"] == spec.id
    assert sheet.references["brandId"] == brand.id
    assert sheet.references["promptId"] == "character_generator"
    assert sheet.references["promptVersion"] == 1

    shot_llm = FakeLLM([_shot_spec_payload()])
    shot_spec = await plan_shot_spec(shot_llm, registry, spec, sheet)

    assert shot_spec.creative_spec_id == spec.id
    assert shot_spec.character_id == sheet.id
    assert shot_spec.source == "planner"
    assert shot_spec.references["creativeSpecId"] == spec.id
    assert shot_spec.references["characterId"] == sheet.id
    assert shot_spec.references["promptId"] == "story_planner"
    assert shot_spec.references["promptVersion"] == 1

    # ShotSpec's own contract validator is what proves this really validates:
    # 3 shots, Hook/Product/CTA order, numbers 1-3, durations matching timing.
    assert [s.purpose for s in shot_spec.shots] == ["Hook", "Product", "CTA"]
    assert [s.shot_number for s in shot_spec.shots] == [1, 2, 3]
    assert shot_spec.timing.shot_durations == [3, 4, 3]


# ---------------------------------------------------------------------------
# Live smoke: one real OpenRouter call via plan_creative_spec, built from the
# committed ingestion fixtures. Opt-in only (paid): requires BOTH
# CS_LIVE_SMOKE=1 and a configured OpenRouter key. Run once manually; never
# exercised by the default test run.
# ---------------------------------------------------------------------------

def _resolve_openrouter_key() -> str:
    try:
        return get_settings().openrouter_api_key
    except Exception:
        return os.environ.get("OPENROUTER_API_KEY", "")


def _load_fixture_product() -> dict:
    with open(SHOPIFY_FIXTURE_PATH, "r", encoding="utf-8") as f:
        products = json.load(f)
    assert isinstance(products, list) and products, "shopify fixture must be a non-empty list"
    return products[0]


skip_unless_live_smoke = pytest.mark.skipif(
    os.environ.get("CS_LIVE_SMOKE") != "1" or not _resolve_openrouter_key(),
    reason="set CS_LIVE_SMOKE=1 and configure an OpenRouter API key to run this paid live planning smoke test",
)


@skip_unless_live_smoke
async def test_plan_creative_spec_live():
    from creative_studio.ingestion import meta
    from creative_studio.ingestion.brand_profile import build_brand_context, load_brand_profile
    from creative_studio.ingestion.shopify import normalize_product
    from creative_studio.planning.llm import PlannerLLM

    profile = load_brand_profile()
    shop_meta = {
        "name": "Pratap Sons",
        "url": "https://pratapsons.com",
        "industry": "Fashion & Apparel",
        "description": "Premium ethnic wear",
    }
    brand = build_brand_context(shop_meta, profile, {"shopify": {"connected": True}})

    product = normalize_product(_load_fixture_product())

    raw_campaigns = meta.load_fixture()
    campaigns = [meta.normalize_campaign(raw, product_ids=[product.id]) for raw in raw_campaigns]

    llm = PlannerLLM(get_settings())
    registry = PromptRegistry()

    spec = await plan_creative_spec(
        llm, registry, brand, product, campaigns, preference="Make it feel warm, festive, and premium"
    )

    assert isinstance(spec, CreativeSpec)
    assert spec.product["productId"] == product.id
    assert spec.messaging["cta"]
    assert spec.constraints["showBrandLogo"] is False
