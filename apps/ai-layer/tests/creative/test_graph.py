"""The creative graph (T12): stop storing ads, start storing CHOICES.

The tests are mostly about what the graph REFUSES to say. A graph that reports "pattern
interrupt appears in 60% of winners" without ever looking at a loser has said nothing at
all -- it is exactly as true, and exactly as meaningless, as "60% of winners ran on a
Tuesday". You cannot estimate an effect from a sample selected on the effect.

And what it does say, it says as a CORRELATION. The only causal claim in the system is a
variant-set finding (outcomes.py), where one axis was changed on purpose.
"""
from __future__ import annotations

import pytest

from ai_layer.creative import graph, story_brain
from ai_layer.creative.schemas import CreativeTemplate, UGCStyle


def _ad(ad_id, cohort, *, hook=None, fmt=None, camera=None, avg_shot=None,
        first_cut=None, wpm=None, cta_at=None, dur=20.0, thumb=None):
    return CreativeTemplate(
        ad_id=ad_id, cohort=cohort, hook_type=hook, ad_format=fmt,
        style=UGCStyle(camera=camera) if camera else None,
        avg_shot_length_s=avg_shot or 0.0, time_to_first_cut_s=first_cut or 0.0,
        words_per_minute=wpm, cta_start_s=cta_at, duration_s=dur, thumb_stop_rate=thumb)


# --- decomposition: only what was measured or classified ------------------------

def test_an_ad_decomposes_into_its_choices():
    t = _ad("a1", "winner", hook="pov", fmt="ugc_testimonial", camera="selfie",
            avg_shot=1.4, first_cut=0.9, wpm=180, cta_at=16.0, dur=20.0)
    atoms = dict(graph.atoms_of(t))
    assert atoms["hook_type"] == "pov"
    assert atoms["ad_format"] == "ugc_testimonial"
    assert atoms["camera"] == "selfie"
    assert atoms["pacing"] == "fast"            # 1.4s avg shot
    assert atoms["first_cut"] == "immediate"    # 0.9s
    assert atoms["speech_pace"] == "fast"       # 180 wpm
    assert atoms["cta_timing"] == "late"        # 16/20 = 80%


def test_a_missing_measurement_yields_no_atom_rather_than_a_default():
    """A defaulted atom is a fabricated one, and it would aggregate as though it were real."""
    atoms = dict(graph.atoms_of(_ad("a1", "winner")))
    assert "hook_type" not in atoms and "speech_pace" not in atoms and "cta_timing" not in atoms


def test_cta_timing_is_a_fraction_not_a_timestamp():
    """10s into a 12s ad is LATE; 10s into a 40s ad is early-ish. An absolute second is not
    comparable across ads of different lengths."""
    late = dict(graph.atoms_of(_ad("a", "winner", cta_at=10.0, dur=12.0)))["cta_timing"]
    early = dict(graph.atoms_of(_ad("b", "winner", cta_at=10.0, dur=40.0)))["cta_timing"]
    assert late == "late" and early == "early"


# --- the contrast IS the statistic ----------------------------------------------

def test_a_winner_only_corpus_says_nothing(monkeypatch):
    """THE central point. Every structural feature of a winner-only corpus is, by
    construction, a feature of a winner."""
    winners = [_ad(f"w{i}", "winner", hook="pov") for i in range(5)]
    g = graph.build_graph("act_1", templates=winners)
    assert g.n_winners == 5 and g.n_losers == 0
    assert g.identifiable is False
    assert g.to_brief() == ""                   # no losers -> no claim, however many winners


def test_the_contrast_between_the_tails_is_what_becomes_a_finding():
    ads = ([_ad(f"w{i}", "winner", hook="pov") for i in range(4)]        # 4/4 winners
           + [_ad(f"l{i}", "loser", hook="question") for i in range(4)])  # 0/4 losers
    g = graph.build_graph("act_1", templates=ads)
    assert g.identifiable is True
    pov = next(a for a in g.atoms if a.value == "pov")
    assert pov.winner_rate == 1.0 and pov.loser_rate == 0.0
    assert pov.lift == 1.0
    brief = g.to_brief()
    assert "hook_type = 'pov'" in brief
    assert "100% of winners vs 0% of losers" in brief
    assert "CORRELATION, not a proven cause" in brief   # never overclaims


def test_an_atom_common_to_BOTH_tails_is_not_a_finding():
    """If winners and losers both use it, it is not what separates them -- and a graph that
    reported it would be telling you about the account, not about what works."""
    ads = ([_ad(f"w{i}", "winner", camera="selfie") for i in range(4)]
           + [_ad(f"l{i}", "loser", camera="selfie") for i in range(4)])
    g = graph.build_graph("act_1", templates=ads)
    selfie = next(a for a in g.atoms if a.value == "selfie")
    assert selfie.lift == 0.0
    assert g.to_brief() == ""                   # zero lift -> nothing worth saying


def test_an_atom_seen_once_is_not_a_finding():
    """One winner that happened to use a macro shot is not a finding about macro shots."""
    ads = [_ad("w1", "winner", fmt="unboxing")] + [_ad(f"l{i}", "loser") for i in range(3)]
    g = graph.build_graph("act_1", templates=ads)
    assert [a for a in g.atoms if a.value == "unboxing"] == []   # below MIN_ADS_PER_ATOM


def test_a_loser_pattern_is_reported_as_something_to_AVOID():
    ads = ([_ad(f"w{i}", "winner", hook="pov") for i in range(4)]
           + [_ad(f"l{i}", "loser", hook="pov") for i in range(4)]
           + [_ad(f"l{i+9}", "loser", hook="bold_claim") for i in range(4)])
    g = graph.build_graph("act_1", templates=ads)
    bold = next(a for a in g.atoms if a.value == "bold_claim")
    assert bold.lift < 0                        # only losers used it
    assert "LESS common in winners" in g.to_brief()


def test_an_empty_library_is_empty_not_wrong():
    g = graph.build_graph("act_1", templates=[])
    assert g.atoms == [] and g.to_brief() == "" and g.identifiable is False


# --- the graph reaches the brain, and stays weaker than the prior ----------------

def test_the_graph_reaches_the_prompt_labelled_as_correlation():
    ads = ([_ad(f"w{i}", "winner", hook="pov") for i in range(4)]
           + [_ad(f"l{i}", "loser", hook="question") for i in range(4)])
    block = story_brain._graph_block(graph.build_graph("act_1", templates=ads))
    assert "WHAT THIS ACCOUNT'S WINNERS DO DIFFERENTLY" in block
    # it must NOT present itself as proof, because a variant finding IS proof and the model
    # will otherwise weight the two the same
    assert "CORRELATION, not a proven cause" in block


def test_no_graph_injects_nothing():
    assert story_brain._graph_block(None) == ""
    assert story_brain._graph_block(graph.build_graph("act_1", templates=[])) == ""


# --- the library is cached: a teardown is paid for once, forever -----------------

def test_a_known_ad_is_never_torn_down_twice(monkeypatch):
    """A teardown costs an ASR call plus a vision call and is immutable. Paying twice for
    the same ad is paying to be told the same thing."""
    seen = {}

    class _Repo:
        @staticmethod
        def has_teardown(brand_id, ad_id):
            return ad_id == "already"

        @staticmethod
        def save_teardown(brand_id, ad_id, cohort, template_json, thumb):
            seen[ad_id] = cohort
            return True

    import ai_layer.db as db_pkg
    monkeypatch.setattr(db_pkg, "repository", _Repo, raising=False)

    assert graph.already_known("act_1", "already") is True
    assert graph.already_known("act_1", "fresh") is False
    graph.remember("act_1", _ad("fresh", "loser", hook="pov"))
    assert seen == {"fresh": "loser"}           # and losers ARE remembered


def test_no_database_never_breaks_a_run(monkeypatch):
    class _Broken:
        @staticmethod
        def has_teardown(*a, **k):
            raise RuntimeError("neon is down")

        @staticmethod
        def save_teardown(*a, **k):
            raise RuntimeError("neon is down")

    import ai_layer.db as db_pkg
    monkeypatch.setattr(db_pkg, "repository", _Broken, raising=False)
    assert graph.already_known("act_1", "x") is False    # degrades to "not cached"
    assert graph.remember("act_1", _ad("x", "winner")) is False
