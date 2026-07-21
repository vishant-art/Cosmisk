# tests/contracts/test_planning_contracts.py
import pytest
from pydantic import ValidationError
from creative_studio.contracts.base import new_id
from creative_studio.contracts.creative_spec import CreativeSpec
from creative_studio.contracts.character_sheet import CharacterSheet
from creative_studio.contracts.shot_spec import ShotSpec, Shot, Timing

def make_spec(**over):
    d = dict(id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        marketing_objective={"objective": "Conversions"}, product={"productId": "product_1"},
        audience={}, messaging={"cta": "Shop Now"}, creative_direction={},
        platform={"platform": "Instagram", "aspectRatio": "9:16", "maxDuration": 10},
        voice_strategy={}, constraints={"showBrandLogo": True}, references={})
    d.update(over); return d

def test_logo_always_forced_false():
    assert CreativeSpec(**make_spec()).constraints["showBrandLogo"] is False

def test_preference_required():
    with pytest.raises(ValidationError):
        CreativeSpec(**make_spec(generation_context={"language": "English"}))

def make_shot(n, purpose, dur):
    return Shot(shot_number=n, purpose=purpose, duration=dur,
                narrative={"summary": "s"}, camera={"shotType": "Medium"},
                character={"expression": "Smile"}, product={"visibility": "High"},
                dialogue={"spokenText": "hello"}, audio={}, composition={}, constraints={})

def make_shotspec(durs=(3, 4, 3), purposes=("Hook", "Product", "CTA")):
    shots = [make_shot(i + 1, p, d) for i, (p, d) in enumerate(zip(purposes, durs))]
    return ShotSpec(id=new_id("shotspec"), creative_spec_id="creative_1", character_id="character_1",
                    story_structure={}, timing=Timing(total_duration=sum(durs), shot_durations=list(durs)),
                    global_style={"aspectRatio": "9:16"}, shots=shots,
                    transition_rules={}, rendering_rules={}, references={})

def test_shotspec_valid(): make_shotspec()

def test_shotspec_rejects_wrong_order():
    with pytest.raises(ValidationError):
        make_shotspec(purposes=("Product", "Hook", "CTA"))

def test_shotspec_rejects_bad_total():
    with pytest.raises(ValidationError):
        make_shotspec(durs=(5, 5, 5))


# --- Additional scope: CreativeSpec required-field rejections ---

def test_creativespec_missing_product_id_rejected():
    with pytest.raises(ValidationError):
        CreativeSpec(**make_spec(product={}))

def test_creativespec_missing_cta_rejected():
    with pytest.raises(ValidationError):
        CreativeSpec(**make_spec(messaging={}))


# --- Additional scope: CharacterSheet portrait-completion rules ---

def make_character(**over):
    d = dict(id=new_id("character"), creative_spec_id="creative_1",
              identity={"name": "Ava"}, appearance={"age": "25-30"}, wardrobe={},
              personality={"tone": "Warm"}, expressions={}, speaking_style={"pace": "Measured"},
              reference_assets={}, conditioning={}, references={})
    d.update(over); return d

def test_character_sheet_draft_without_portrait_ok():
    sheet = CharacterSheet(**make_character())
    assert sheet.status == "draft"

def test_character_sheet_completed_without_portrait_rejected():
    with pytest.raises(ValidationError):
        CharacterSheet(**make_character(status="completed"))

def test_character_sheet_completed_with_portrait_ok():
    sheet = CharacterSheet(**make_character(
        status="completed",
        reference_assets={"primaryPortrait": {"r2Uri": "r2://b/portrait.png"}}))
    assert sheet.status == "completed"
