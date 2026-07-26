"""The closed loop (T11): what we made -> what it did -> what we learn.

The plumbing is easy and the STATISTICS are the point, so most of these tests are about
refusing to learn the wrong thing. A prior that confidently reports a winner off 40
impressions is worse than no prior at all: it is a fabricated belief, indistinguishable at
the point of use from a measured one, and the brain will act on it.

The store is faked (an in-memory list monkeypatched onto the `_repo()` seam), so nothing
touches rnd's library.json files.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "src"))  # rnd/src (Meta layer)
import config  # noqa: E402
import outcomes  # noqa: E402
import story_brain  # noqa: E402
from schemas import CreativePrior  # noqa: E402


# --- a fake variants store ------------------------------------------------------

class _FakeRepo:
    def __init__(self, rows=None):
        self.rows = list(rows or [])
        self.recorded = []

    def load_variants(self, brand_id=None, *, published_only=False):
        rows = [r for r in self.rows if brand_id is None or r["brand_id"] == brand_id]
        if published_only:
            rows = [r for r in rows if r.get("meta_ad_id")]
        return rows

    def record_outcome(self, variant_id, metrics):
        self.recorded.append((variant_id, metrics))
        for r in self.rows:
            if r["variant_id"] == variant_id:
                r.update(metrics)
                return True
        return False


def _row(value, *, rate=None, impressions=0, base="run1", axis="hook_type",
         ad_id=None, brand="act_1"):
    return {"variant_id": f"{base}__{axis}__{value}", "brand_id": brand, "base_id": base,
            "axis": axis, "value": value, "kind": "structural", "artifact_path": None,
            "meta_ad_id": ad_id, "thumb_stop_rate": rate, "thruplay_rate": None,
            "impressions": impressions, "spend": 0.0, "roas": None, "harvested_at": None}


@pytest.fixture
def repo(monkeypatch):
    r = _FakeRepo()
    monkeypatch.setattr(outcomes, "_repo", lambda: r)
    return r


# --- the statistics -------------------------------------------------------------

def test_two_proportion_z_is_scaled_by_the_denominator():
    """The same 3-point gap is noise on 100 impressions and overwhelming on 100,000. A test
    that ignores the denominator is not a test."""
    small = outcomes.two_proportion_z(0.12, 100, 0.09, 100)
    large = outcomes.two_proportion_z(0.12, 100_000, 0.09, 100_000)
    assert abs(small) < config.PRIOR_Z          # same gap, not significant
    assert abs(large) > config.PRIOR_Z          # ...significant at scale
    assert abs(large) > abs(small)


def test_z_is_zero_when_there_is_no_data():
    assert outcomes.two_proportion_z(0.1, 0, 0.2, 0) == 0.0
    assert outcomes.two_proportion_z(0.0, 10, 0.0, 10) == 0.0


# --- the prior refuses to overclaim ---------------------------------------------

def test_an_arm_below_the_impression_floor_is_not_reported_at_all(repo):
    """A proportion over 40 impressions is noise with a decimal point."""
    repo.rows = [_row("pov", rate=0.30, impressions=40, ad_id="a1"),
                 _row("question", rate=0.05, impressions=40, ad_id="a2")]
    prior = outcomes.build_prior("act_1")
    assert prior.n_observed == 2               # we SAW them...
    assert prior.arms == []                     # ...but neither may speak
    assert prior.findings == []
    assert prior.to_brief() == ""               # and the brain is told nothing


def test_a_real_difference_at_scale_becomes_a_finding(repo):
    repo.rows = [_row("pov", rate=0.14, impressions=50_000, ad_id="a1"),
                 _row("question", rate=0.09, impressions=50_000, ad_id="a2")]
    prior = outcomes.build_prior("act_1")
    assert len(prior.findings) == 1
    f = prior.findings[0]
    assert f.winner == "pov" and f.loser == "question"
    assert f.significant is True
    assert f.lift == pytest.approx(0.05)
    brief = prior.to_brief()
    assert "'pov' beat 'question'" in brief and "Prefer 'pov'" in brief


def test_a_small_difference_at_scale_is_UNDECIDED_not_a_winner(repo):
    """The failure this whole module exists to prevent: shipping a preference we did not
    actually measure."""
    repo.rows = [_row("pov", rate=0.101, impressions=1_200, ad_id="a1"),
                 _row("question", rate=0.099, impressions=1_200, ad_id="a2")]
    prior = outcomes.build_prior("act_1")
    assert len(prior.findings) == 1
    assert prior.findings[0].significant is False
    brief = prior.to_brief()
    assert "UNDECIDED" in brief
    assert "Do not treat this as a preference" in brief
    assert "Prefer" not in brief                # no preference is asserted
    assert "Nothing has reached significance yet" in brief


def test_a_one_armed_experiment_is_an_anecdote_not_a_comparison(repo):
    repo.rows = [_row("pov", rate=0.20, impressions=50_000, ad_id="a1")]
    prior = outcomes.build_prior("act_1")
    assert prior.arms and prior.findings == []   # reported as an arm, never as a finding


def test_comparisons_never_cross_variant_sets(repo):
    """Two ads from DIFFERENT runs differ for a hundred reasons. Only a variant set -- same
    base, same account, one axis changed on purpose -- licenses a causal claim."""
    repo.rows = [_row("pov", rate=0.20, impressions=50_000, base="run1", ad_id="a1"),
                 _row("question", rate=0.05, impressions=50_000, base="run2", ad_id="a2")]
    prior = outcomes.build_prior("act_1")
    assert prior.findings == []                 # different base_id -> not an experiment
    assert len(prior.arms) == 2


def test_unpublished_and_unharvested_variants_are_counted_but_never_learned_from(repo):
    repo.rows = [_row("pov", ad_id=None),                            # never shipped
                 _row("question", ad_id="a2"),                       # shipped, no metrics yet
                 _row("bold_claim", rate=0.12, impressions=9_000, ad_id="a3")]
    prior = outcomes.build_prior("act_1")
    assert prior.n_total == 3
    assert prior.n_published == 2
    assert prior.n_observed == 1


def test_a_brand_new_account_has_nothing_to_say(repo):
    prior = outcomes.build_prior("act_new")
    assert prior.to_brief() == ""
    assert prior.n_total == 0


# --- harvest --------------------------------------------------------------------

def test_harvest_only_touches_published_variants(repo, monkeypatch):
    """An ad we never shipped has no outcome, and inventing one would poison the prior."""
    repo.rows = [_row("pov", ad_id="ad_1"), _row("question", ad_id=None)]

    import meta_creatives
    monkeypatch.setattr(meta_creatives, "fetch_ad_insights", lambda *a, **k: [
        {"ad_id": "ad_1", "impressions": "20000", "spend": "100",
         "video_3_sec_watched_actions": [{"value": "2400"}]},
    ])

    stats = outcomes.harvest("act_1", "act_1", "tok", log=lambda *_: None)
    assert stats["published"] == 1 and stats["harvested"] == 1
    assert len(repo.recorded) == 1
    vid, metrics = repo.recorded[0]
    assert vid == "run1__hook_type__pov"
    assert metrics["thumb_stop_rate"] == pytest.approx(2400 / 20000)


def test_a_published_ad_with_no_insights_yet_is_reported_not_invented(repo, monkeypatch):
    repo.rows = [_row("pov", ad_id="ad_未serving")]
    import meta_creatives
    monkeypatch.setattr(meta_creatives, "fetch_ad_insights", lambda *a, **k: [])

    stats = outcomes.harvest("act_1", "act_1", "tok", log=lambda *_: None)
    assert stats["harvested"] == 0
    assert stats["missing"] == ["ad_未serving"]
    assert repo.recorded == []                  # nothing written; no zero invented


# --- the loop actually closes: the prior reaches the brain -----------------------

def test_the_prior_reaches_every_generation_prompt():
    """The payoff. A finding that cleared the bar must appear in the brief the brain reads,
    at the same seam the teardown uses."""
    prior = CreativePrior(brand_id="act_1", n_observed=2)
    from schemas import AxisFinding
    prior.findings = [AxisFinding(base_id="run1", axis="hook_type", winner="pov",
                                  loser="question", winner_rate=0.14, loser_rate=0.09,
                                  lift=0.05, significant=True, impressions=100_000)]
    block = story_brain._prior_block(prior)
    assert "WHAT HAS ACTUALLY WORKED" in block
    assert "'pov' beat 'question'" in block


def test_an_empty_prior_injects_nothing():
    """A young account gets no prior, not a fabricated one."""
    assert story_brain._prior_block(None) == ""
    assert story_brain._prior_block(CreativePrior(brand_id="act_1")) == ""
