"""The brain turns the summary into a validated kit + concepts (fake LLM client).

Includes the T5 seam: concepts conditioned on a real ad's measured structure.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import brand_brain  # noqa: E402


def test_generate_brand_kit(fake_client):
    kit, cost = brand_brain.generate_brand_kit(fake_client, "ACCOUNT: Test")
    assert kit.brand_name == "Lumen"
    assert len(kit.palette) == 3
    assert cost == 0.0                       # fake client returns no usage.cost


def test_generate_concepts_count(fake_client, brand_kit):
    out, cost = brand_brain.generate_concepts(fake_client, brand_kit, "ctx", 3)
    assert len(out) == 3
    assert out[0].title == "Morning Glow"
    assert cost == 0.0


def test_generate_concepts_carry_copy(fake_client, brand_kit):
    out, _ = brand_brain.generate_concepts(fake_client, brand_kit, "ctx", 2)
    assert out[0].ad_copy.headline           # first-class copy, not buried in prose
    assert out[0].ad_copy.cta_label
    assert out[0].ad_copy.angle


def test_grounding_builds_multimodal_message_and_still_parses(fake_client, tmp_path):
    from PIL import Image
    w = tmp_path / "winner.png"
    Image.new("RGB", (8, 8), "white").save(w)
    # vision message is a list of parts (text + image), and the kit still validates
    parts = brand_brain._vision_user("ACCOUNT: X", [str(w)], "ground it")
    assert parts[0]["type"] == "text"
    assert any(p["type"] == "image_url" for p in parts)
    kit, _ = brand_brain.generate_brand_kit(fake_client, "ACCOUNT: X", ground_images=[str(w)])
    assert kit.brand_name == "Lumen"


def test_generate_vo_script(fake_client, brand_kit):
    script, cost = brand_brain.generate_vo_script(fake_client, brand_kit,
                                                  "Timeless craftsmanship", "Shop now", 10)
    assert "collection" in script.lower()          # from the fake VO router branch
    assert cost == 0.0


def test_generate_vo_script_falls_back_to_hook(brand_kit):
    class _Bad:
        class _C:
            @staticmethod
            def create(**kw):
                raise RuntimeError("llm down")
        chat = type("Chat", (), {"completions": _C()})()
    script, _ = brand_brain.generate_vo_script(_Bad(), brand_kit, "Heritage weaves", "Buy", 8)
    assert "Heritage weaves" in script             # graceful fallback to the hook


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
    out, _ = brand_brain.generate_concepts(_OneShot(), brand_kit, "ctx", 2)
    assert len(out) == 2          # synthesises placeholders rather than returning nothing
    assert out[0].ad_copy.headline   # even placeholders carry valid copy
    assert out[0].ad_copy.cta_label


# --- T5: the seam ---------------------------------------------------------------

class _Capturing:
    """Captures the messages sent, so we can assert what the brain was actually told."""
    def __init__(self):
        self.seen = []
        outer = self

        class _C:
            @staticmethod
            def create(**kw):
                outer.seen.append(kw["messages"])

                class R:
                    choices = [type("X", (), {"message": type("M", (), {
                        "content": '{"concepts": []}'})})]
                return R()
        self.chat = type("Chat", (), {"completions": _C()})()

    @property
    def system(self):
        return self.seen[0][0]["content"]

    @property
    def user(self):
        return self.seen[0][1]["content"]


def _template(**kw):
    from schemas import CreativeTemplate
    base = dict(ad_id="ad_9", cohort="winner", shot_count=6, duration_s=18.0,
                avg_shot_length_s=3.0, time_to_first_cut_s=1.4,
                hook_type="pattern_interrupt", ad_format="ugc_testimonial",
                spoken_hook="I genuinely did not expect", words_per_minute=168.0)
    return CreativeTemplate(**{**base, **kw})


def test_concepts_are_ungrounded_without_a_template(brand_kit):
    """The behaviour we are leaving behind: the brain decides the hook, the headline,
    the CTA and the scene having never seen a winning ad."""
    c = _Capturing()
    brand_brain.generate_concepts(c, brand_kit, "ctx", 2)
    assert "STRUCTURE OF A REAL" not in c.user
    assert "structure" not in c.system.lower()


def test_template_reaches_the_concept_prompt(brand_kit):
    c = _Capturing()
    brand_brain.generate_concepts(c, brand_kit, "ctx", 2, template=_template())
    assert "STRUCTURE OF A REAL WINNER" in c.user
    assert "pattern_interrupt" in c.user
    assert "I genuinely did not expect" in c.user
    assert "6 shots" in c.user
    assert "Reuse what carried the result" in c.system


def test_loser_template_inverts_the_instruction(brand_kit):
    c = _Capturing()
    brand_brain.generate_concepts(c, brand_kit, "ctx", 2,
                                  template=_template(cohort="loser"))
    assert "STRUCTURE OF A REAL LOSER" in c.user
    assert "do the opposite" in c.system


def test_template_brief_never_states_an_unmeasured_field(brand_kit):
    """A template whose ASR failed must not silently hand the brain a plausible pace."""
    c = _Capturing()
    brand_brain.generate_concepts(c, brand_kit, "ctx", 2,
                                  template=_template(words_per_minute=None,
                                                     spoken_hook=None))
    assert "words/min" not in c.user
    assert "first words spoken" not in c.user
    assert "pattern_interrupt" in c.user      # what WAS measured still arrives
