"""The story brain: concepts (T5 seam), script and storyboard (T6).

Everything here consumes a CreativeTemplate, which is exactly why it lives in
story_brain rather than brand_brain. Fake LLM client, zero spend.
"""
from __future__ import annotations

import json

import pytest

from ai_layer.creative import storyboard as sb_mod  # noqa: E402
from ai_layer.creative import story_brain  # noqa: E402
from ai_layer.creative.schemas import CreativeTemplate, Script  # noqa: E402


# --- concepts (T5) ----------------------------------------------------------------

def test_concepts_parse_and_cap_at_n(fake_client, brand_kit):
    out, cost = story_brain.generate_concepts(fake_client, brand_kit, "ctx", 3)
    assert len(out) == 3
    assert out[0].ad_copy.headline
    assert cost == 0.0                       # the fake response carries no usage block


class _OneShot:
    """Minimal client returning a fixed JSON string (no concepts)."""
    class _C:
        @staticmethod
        def create(**kw):
            class R:
                choices = [type("X", (), {"message": type("M", (), {"content": '{"concepts": []}'})})]
            return R()
    chat = type("Chat", (), {"completions": _C()})()


def test_concepts_fallback_when_empty(brand_kit):
    out, _ = story_brain.generate_concepts(_OneShot(), brand_kit, "ctx", 2)
    assert len(out) == 2                     # synthesises placeholders rather than nothing
    assert out[0].ad_copy.headline and out[0].ad_copy.cta_label


# --- casting: operator direction -> one concrete person (audit fix) -----------

def test_creator_from_direction_casts_a_person(fake_client, brand_kit):
    creator = story_brain.creator_from_direction(fake_client, "tall blonde woman", kit=brand_kit)
    assert creator.name == "Ava"
    assert "blonde" in creator.appearance
    assert creator.wardrobe and creator.setting


def test_cast_block_injects_the_person():
    from ai_layer.creative.schemas import CreatorKit
    c = CreatorKit(name="Ava", appearance="a tall blonde woman", wardrobe="a pastel dress")
    block = story_brain._cast_block(c)
    assert "a tall blonde woman" in block
    assert "same person" in block.lower()
    assert story_brain._cast_block(None) == ""


def test_concepts_are_cast_with_the_creator(brand_kit):
    """When a creator is supplied, the concept prompt tells the model to use that same person,
    so the static ads match the video's cast (the live run cast a different generic person)."""
    from ai_layer.creative.schemas import CreatorKit
    captured = {}

    class _Cap:
        def __init__(self):
            class _C:
                @staticmethod
                def create(*, model, messages, **kw):
                    captured["user"] = messages[1]["content"]

                    class R:
                        choices = [type("X", (), {"message": type(
                            "M", (), {"content": json.dumps({"concepts": []})})()})()]

                        def model_dump(self):
                            return {"usage": {"cost": 0.0}}
                    return R()
            self.chat = type("Chat", (), {"completions": _C()})()

    creator = CreatorKit(name="Ava", appearance="a tall blonde woman", wardrobe="a pastel dress")
    story_brain.generate_concepts(_Cap(), brand_kit, "ctx", 2, creator=creator)
    assert "a tall blonde woman" in captured["user"]
    assert "same person" in captured["user"].lower()


# --- Phase 2a: hook reliability -----------------------------------------------

def test_hook_guidance_ships_positive_exemplars():
    """Every closed hook type gets a concrete opener to imitate, not just a ban-list."""
    for ht, guidance in story_brain._HOOK_GUIDANCE.items():
        assert "e.g." in guidance, ht


def test_script_prompt_few_shots_the_hook():
    """GOOD/BAD hook exemplars make the 'spoken, not a slogan' rule enforceable."""
    sysp = story_brain._SCRIPT_SYSTEM
    assert "GOOD:" in sysp and "BAD:" in sysp
    assert "not a slogan" in sysp


# --- Phase 2b: operational voice ----------------------------------------------

def test_brand_kit_carries_operational_voice(brand_kit):
    assert brand_kit.banned and brand_kit.always_use
    assert isinstance(brand_kit.tone_scales, dict)


def test_kit_prompt_asks_for_the_lexicons():
    from ai_layer.creative import brand_brain
    assert "banned" in brand_brain._KIT_SYSTEM and "always_use" in brand_brain._KIT_SYSTEM
    assert "tone_scales" in brand_brain._KIT_SYSTEM


def test_script_prompt_injects_the_banned_words(brand_kit):
    captured = {}

    class _Cap:
        def __init__(self):
            class _C:
                @staticmethod
                def create(*, model, messages, **kw):
                    captured["user"] = messages[1]["content"]

                    class R:
                        choices = [type("X", (), {"message": type("M", (), {"content": json.dumps(
                            {"beats": [{"purpose": "hook", "text": "okay this changed my week"},
                                       {"purpose": "cta", "text": "go check them out"}]})})()})()]

                        def model_dump(self):
                            return {"usage": {"cost": 0.0}}
                    return R()
            self.chat = type("Chat", (), {"completions": _C()})()

    try:
        story_brain.generate_script(_Cap(), brand_kit, "ctx", seconds=12)
    except Exception:
        pass                                     # the injection is captured before any downstream
    assert "NEVER use these words" in captured["user"]
    assert "revolutionary" in captured["user"]   # from the fake kit's banned list


# --- Phase 2c: concept diversity + reconciliation -----------------------------

def test_concept_prompt_asks_for_awareness_and_obeys_donts():
    sysc = story_brain._CONCEPTS_SYSTEM
    assert "awareness_stage" in sysc
    assert "donts" in sysc and "share more than one keyword" in sysc


def test_ad_concept_accepts_awareness_stage():
    from ai_layer.creative.schemas import AdConcept, CopySet
    c = AdConcept(title="t", scene="s", ad_copy=CopySet(headline="h", cta_label="c", angle="a"),
                  awareness_stage="problem_aware")
    assert c.awareness_stage == "problem_aware"


class _Capturing:
    """Captures the messages sent, so we can assert what the brain was actually told."""
    def __init__(self, payload='{"concepts": []}'):
        self.seen = []
        outer = self

        class _C:
            @staticmethod
            def create(**kw):
                outer.seen.append(kw["messages"])

                class R:
                    choices = [type("X", (), {"message": type("M", (), {
                        "content": payload})})]
                return R()
        self.chat = type("Chat", (), {"completions": _C()})()

    @property
    def system(self):
        return self.seen[0][0]["content"]

    @property
    def user(self):
        return self.seen[0][1]["content"]


def _template(**kw):
    base = dict(ad_id="ad_9", cohort="winner", shot_count=6, duration_s=18.0,
                avg_shot_length_s=3.0, time_to_first_cut_s=1.4,
                hook_type="pattern_interrupt", ad_format="ugc_testimonial",
                spoken_hook="I genuinely did not expect", words_per_minute=168.0)
    return CreativeTemplate(**{**base, **kw})


def test_concepts_are_ungrounded_without_a_template(brand_kit):
    c = _Capturing()
    story_brain.generate_concepts(c, brand_kit, "ctx", 2)
    assert "STRUCTURE OF A REAL" not in c.user
    assert "structure" not in c.system.lower()


def test_template_reaches_the_concept_prompt(brand_kit):
    c = _Capturing()
    story_brain.generate_concepts(c, brand_kit, "ctx", 2, template=_template())
    assert "STRUCTURE OF A REAL WINNER" in c.user
    assert "pattern_interrupt" in c.user
    assert "I genuinely did not expect" in c.user
    assert "6 shots" in c.user
    assert "Reuse what carried the result" in c.system


def test_loser_template_inverts_the_instruction(brand_kit):
    c = _Capturing()
    story_brain.generate_concepts(c, brand_kit, "ctx", 2, template=_template(cohort="loser"))
    assert "STRUCTURE OF A REAL LOSER" in c.user
    assert "do the opposite" in c.system


def test_template_brief_never_states_an_unmeasured_field(brand_kit):
    c = _Capturing()
    story_brain.generate_concepts(c, brand_kit, "ctx", 2,
                                  template=_template(words_per_minute=None, spoken_hook=None))
    assert "words/min" not in c.user
    assert "first words spoken" not in c.user
    assert "pattern_interrupt" in c.user      # what WAS measured still arrives


# --- voiceover ----------------------------------------------------------------------

def test_vo_script_is_json_parsed(fake_client, brand_kit):
    script, cost = story_brain.generate_vo_script(fake_client, brand_kit, "Timeless craft",
                                                  "Shop now", 10)
    assert "craftsmanship" in script


def test_vo_script_falls_back_to_the_hook_when_the_model_fails(brand_kit):
    class _Bad:
        class _C:
            @staticmethod
            def create(**kw):
                raise RuntimeError("down")
        chat = type("Chat", (), {"completions": _C()})()

    script, _ = story_brain.generate_vo_script(_Bad(), brand_kit, "Heritage weaves", "Buy", 8)
    assert "Heritage weaves" in script


# --- script (T6) ---------------------------------------------------------------------

def test_script_parses_into_ordered_beats(fake_client, brand_kit):
    script, _ = story_brain.generate_script(fake_client, brand_kit, "ctx", seconds=20)
    assert isinstance(script, Script)
    assert script.beats[0].purpose == "hook"
    assert script.purposes() == {"hook", "problem", "demo", "proof", "cta"}


def test_script_spoken_text_is_the_caption_ground_truth(fake_client, brand_kit):
    """The same string the drift gate checks captions against. Joined once, here, so the
    voiceover and the captions cannot disagree about what was said."""
    script, _ = story_brain.generate_script(fake_client, brand_kit, "ctx")
    spoken = script.spoken()
    assert spoken.startswith("I genuinely thought this was a scam.")
    assert spoken.endswith("Shop the new collection.")
    assert "[hook]" not in spoken             # purposes are structure, not speech


def test_script_prompt_carries_the_template(brand_kit):
    c = _Capturing(payload=json.dumps({"beats": [{"purpose": "hook", "text": "hi"}]}))
    story_brain.generate_script(c, brand_kit, "ctx", seconds=15, template=_template())
    assert "STRUCTURE OF A REAL WINNER" in c.user
    assert "Reuse what carried the result" in c.system


def test_script_word_budget_scales_with_length(brand_kit):
    c = _Capturing(payload=json.dumps({"beats": [{"purpose": "hook", "text": "hi"}]}))
    story_brain.generate_script(c, brand_kit, "ctx", seconds=30)
    assert "66 words" in c.system          # 30 * 2.2, ~132 wpm spoken


# --- storyboard (T6) ------------------------------------------------------------------

def test_storyboard_is_fitted_and_validated(fake_client, brand_kit, script):
    board, _ = story_brain.generate_storyboard(fake_client, brand_kit, script, seconds=20,
                                               log=lambda *_: None)
    assert board.duration_s == pytest.approx(20.0)     # model hints summed to 14; rescaled
    assert board.shots[0].purpose == "hook"
    assert board.shots[-1].purpose == "cta"
    assert board.covers(script) == set()


def test_storyboard_retries_once_with_the_violation_as_a_hint(brand_kit, script):
    """A missing beat is a failed plan. We hand the model the exact violation rather than
    silently inventing the shot it forgot."""
    good = {"shots": [
        {"purpose": p, "duration_s": 3, "camera": "selfie", "subject": "s",
         "product_visible": "hero", "motion": "", "dialogue": None}
        for p in ("hook", "problem", "demo", "proof", "cta")]}
    bad = {"shots": good["shots"][:2]}          # drops demo/proof/cta

    payloads = [json.dumps(bad), json.dumps(good)]
    seen = []

    class _C:
        @staticmethod
        def create(**kw):
            seen.append(kw["messages"][1]["content"])

            class R:
                choices = [type("X", (), {"message": type("M", (), {
                    "content": payloads[len(seen) - 1]})})]
            return R()

    client = type("Cl", (), {"chat": type("Ch", (), {"completions": _C()})()})()
    board, _ = story_brain.generate_storyboard(client, brand_kit, script, seconds=20,
                                               log=lambda *_: None)
    assert len(seen) == 2
    assert "YOUR PREVIOUS ATTEMPT WAS REJECTED" in seen[1]
    assert "'cta'" in seen[1] or "cta" in seen[1]
    assert board.covers(script) == set()


def test_storyboard_gives_up_rather_than_inventing_a_shot(brand_kit, script):
    bad = json.dumps({"shots": [
        {"purpose": "hook", "duration_s": 3, "camera": "selfie", "subject": "s",
         "product_visible": "hero", "motion": "", "dialogue": None}]})

    class _C:
        @staticmethod
        def create(**kw):
            class R:
                choices = [type("X", (), {"message": type("M", (), {"content": bad})})]
            return R()

    client = type("Cl", (), {"chat": type("Ch", (), {"completions": _C()})()})()
    with pytest.raises(sb_mod.StoryboardError):
        story_brain.generate_storyboard(client, brand_kit, script, seconds=20, retries=1,
                                        log=lambda *_: None)


def test_an_off_taxonomy_camera_is_a_failed_plan(brand_kit, script):
    bad = json.dumps({"shots": [
        {"purpose": "hook", "duration_s": 3, "camera": "drone_orbit", "subject": "s",
         "product_visible": "hero", "motion": "", "dialogue": None}]})

    class _C:
        @staticmethod
        def create(**kw):
            class R:
                choices = [type("X", (), {"message": type("M", (), {"content": bad})})]
            return R()

    client = type("Cl", (), {"chat": type("Ch", (), {"completions": _C()})()})()
    with pytest.raises(sb_mod.StoryboardError, match="shot 1 is invalid"):
        story_brain.generate_storyboard(client, brand_kit, script, retries=0,
                                        log=lambda *_: None)


# --- shot repair (T9.5, rung 3) -------------------------------------------------------

def _replan_client(payload):
    return _Capturing(payload=json.dumps(payload))


_GOOD_SHOT = {"purpose": "demo", "duration_s": 9.0, "camera": "macro",
              "subject": "a different framing of the same demo", "product_visible": "hero",
              "motion": "twist", "dialogue": "you just twist it"}


def _failed_shot():
    from ai_layer.creative.schemas import Shot
    return Shot(purpose="demo", duration_s=4.0, camera="selfie", subject="old framing",
                product_visible="hero", motion="", dialogue="you just twist it")


def test_replan_returns_a_different_shot_for_the_same_beat(brand_kit):
    c = _replan_client(_GOOD_SHOT)
    out, _cost = story_brain.replan_shot(c, brand_kit, _failed_shot(),
                                         reason="nothing moves")
    assert out.purpose == "demo"
    assert out.subject != "old framing"
    assert "nothing moves" in c.user
    assert "MUST equal the failed shot's purpose" in c.system


def test_replan_preserves_the_planned_duration(brand_kit):
    """The model returned 9.0s. The storyboard already fitted this shot to 4.0s and the
    ad still has to land on its target."""
    c = _replan_client(_GOOD_SHOT)
    out, _ = story_brain.replan_shot(c, brand_kit, _failed_shot(), reason="x")
    assert out.duration_s == 4.0


def test_a_replacement_serving_a_different_beat_is_rejected(brand_kit):
    """It silently drops the beat. T6's coverage invariant would only notice much later."""
    c = _replan_client({**_GOOD_SHOT, "purpose": "cta"})
    with pytest.raises(story_brain.ShotRepairError, match="drops a beat"):
        story_brain.replan_shot(c, brand_kit, _failed_shot(), reason="x")


def test_an_off_taxonomy_replacement_is_rejected(brand_kit):
    c = _replan_client({**_GOOD_SHOT, "camera": "drone_orbit"})
    with pytest.raises(story_brain.ShotRepairError, match="invalid"):
        story_brain.replan_shot(c, brand_kit, _failed_shot(), reason="x")


def test_storyboard_prompt_lists_the_closed_sets(brand_kit, script):
    c = _Capturing(payload=json.dumps({"shots": []}))
    with pytest.raises(sb_mod.StoryboardError):
        story_brain.generate_storyboard(c, brand_kit, script, retries=0, log=lambda *_: None)
    assert "hook, problem, agitate, demo, proof, objection, cta" in c.system
    assert "selfie" in c.system and "macro" in c.system
    assert "hero, background, absent" in c.system
