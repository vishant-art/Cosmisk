"""Storyboard: the deterministic half of T6.

Duration fitting is arithmetic and is tested as arithmetic. Coverage is an invariant and
is tested as an invariant. Neither asks a model anything, which is the point: the model
proposes shots, this module decides whether they are a storyboard.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import storyboard as sb  # noqa: E402
from schemas import Script, ScriptBeat, Shot, Storyboard  # noqa: E402


def _shot(purpose, dur=3.0, camera="selfie", product="hero"):
    return Shot(purpose=purpose, duration_s=dur, camera=camera,
                subject="a subject", product_visible=product)


def _script(*purposes):
    return Script(beats=[ScriptBeat(purpose=p, text=f"line for {p}") for p in purposes])


# --- duration fitting: exact, not nearly exact ----------------------------------

def test_durations_sum_to_the_target_exactly():
    out = sb.fit_durations([1, 1, 1], target=10.0, max_clip=15, min_shot=1.0)
    assert sum(out) == pytest.approx(10.0, abs=1e-9)


def test_proportions_are_preserved():
    out = sb.fit_durations([1, 2, 3], target=12.0, max_clip=15, min_shot=0.5)
    assert out == [2.0, 4.0, 6.0]


def test_awkward_targets_still_land_exactly():
    """3 shots into 10s does not divide. Float scaling leaves a residue that either
    drifts the ad's length or gets dumped on the last shot. Integer tenths do not."""
    out = sb.fit_durations([1, 1, 1], target=10.0, max_clip=15, min_shot=1.0)
    assert sum(out) == pytest.approx(10.0, abs=1e-9)
    assert len(set(out)) <= 2                     # the residue is spread, not stacked
    # one tenth apart at most. (compared in tenths: 3.4 - 3.3 is 0.100000000000000053)
    assert round(max(out) * 10) - round(min(out) * 10) <= 1


def test_no_shot_exceeds_the_per_clip_cap():
    out = sb.fit_durations([100, 1, 1], target=20.0, max_clip=8.0, min_shot=1.0)
    assert max(out) <= 8.0
    assert sum(out) == pytest.approx(20.0, abs=1e-9)


def test_no_shot_falls_below_the_minimum():
    out = sb.fit_durations([100, 1, 1], target=20.0, max_clip=18.0, min_shot=1.5)
    assert min(out) >= 1.5
    assert sum(out) == pytest.approx(20.0, abs=1e-9)


def test_too_few_shots_for_the_target_is_a_shot_count_problem():
    """Not fixable by rescaling. Only the model can decide to add a shot, so we say so."""
    with pytest.raises(sb.StoryboardError, match="Propose more shots"):
        sb.fit_durations([5, 5], target=40.0, max_clip=8.0, min_shot=1.0)


def test_too_many_shots_for_the_target_is_also_a_shot_count_problem():
    with pytest.raises(sb.StoryboardError, match="Propose fewer shots"):
        sb.fit_durations([1] * 10, target=5.0, max_clip=8.0, min_shot=1.0)


def test_zero_and_negative_hints_do_not_crash_the_scaler():
    out = sb.fit_durations([0, -3, 5], target=9.0, max_clip=8.0, min_shot=1.0)
    assert sum(out) == pytest.approx(9.0, abs=1e-9)
    assert min(out) >= 1.0


def test_no_shots_is_not_a_storyboard():
    with pytest.raises(sb.StoryboardError):
        sb.fit_durations([], target=10.0)


def test_the_fitter_holds_under_randomized_inputs():
    """The invariant is 'sums to target, in bounds', for every shot count, cap, floor and
    set of hints the model could plausibly return. Table-driven cases test what I thought
    of; this tests what I didn't."""
    import random
    rng = random.Random(7)
    checked = 0
    for _ in range(2000):
        n = rng.randint(1, 12)
        max_clip = rng.choice([8.0, 10.0, 15.0])
        min_shot = rng.choice([0.5, 1.2, 2.0])
        target = round(rng.uniform(n * min_shot, n * max_clip), 1)
        hints = [rng.choice([0, -1, 0.1, 1, 5, 100]) for _ in range(n)]

        out = sb.fit_durations(hints, target=target, max_clip=max_clip, min_shot=min_shot)
        assert sum(out) == pytest.approx(target, abs=1e-9)
        assert min(out) >= min_shot - 1e-9
        assert max(out) <= max_clip + 1e-9
        assert len(out) == n
        checked += 1
    assert checked == 2000


# --- coverage: every beat gets a shot -------------------------------------------

def test_every_script_beat_must_have_a_shot():
    script = _script("hook", "demo", "cta")
    board = Storyboard(shots=[_shot("hook"), _shot("cta")], target_seconds=6.0)
    with pytest.raises(sb.StoryboardError, match=r"\['demo'\]"):
        sb.validate(board, script)


def test_a_whole_storyboard_reports_no_missing_beats():
    script = _script("hook", "cta")
    board = Storyboard(shots=[_shot("hook"), _shot("cta")], target_seconds=6.0)
    assert board.covers(script) == set()
    sb.validate(board, script)


def test_extra_shots_beyond_the_script_are_allowed():
    """Two shots can render one beat. The invariant is coverage, not a bijection."""
    script = _script("hook", "cta")
    board = Storyboard(shots=[_shot("hook"), _shot("hook"), _shot("cta")],
                       target_seconds=9.0)
    sb.validate(board, script)


# --- structural invariants -------------------------------------------------------

def test_a_storyboard_opens_on_the_hook():
    script = _script("hook", "cta")
    board = Storyboard(shots=[_shot("cta"), _shot("hook")], target_seconds=6.0)
    with pytest.raises(sb.StoryboardError, match="opens on the hook"):
        sb.validate(board, script)


def test_a_script_must_open_on_a_hook():
    """Enforced on the Script itself: the first two seconds earn the next two."""
    with pytest.raises(Exception, match="open on a hook"):
        Script(beats=[ScriptBeat(purpose="demo", text="here it is")])


def test_a_cta_script_closes_on_a_cta_shot():
    script = _script("hook", "cta")
    board = Storyboard(shots=[_shot("hook"), _shot("cta"), _shot("hook")],
                       target_seconds=9.0)
    with pytest.raises(sb.StoryboardError, match="close on the CTA"):
        sb.validate(board, script)


def test_a_script_without_a_cta_need_not_close_on_one():
    script = _script("hook", "proof")
    board = Storyboard(shots=[_shot("hook"), _shot("proof")], target_seconds=6.0)
    sb.validate(board, script)


def test_durations_over_the_cap_are_rejected():
    script = _script("hook")
    board = Storyboard(shots=[_shot("hook", dur=30.0)], target_seconds=30.0)
    with pytest.raises(sb.StoryboardError, match="per-clip cap"):
        sb.validate(board, script, max_clip=15.0)


def test_shots_must_sum_to_the_target():
    script = _script("hook")
    board = Storyboard(shots=[_shot("hook", dur=3.0)], target_seconds=10.0)
    with pytest.raises(sb.StoryboardError, match="not the 10.0s target"):
        sb.validate(board, script)


# --- build: fit + assemble + validate ---------------------------------------------

def test_build_fits_durations_then_validates():
    script = _script("hook", "demo", "cta")
    shots = [_shot("hook", 1), _shot("demo", 1), _shot("cta", 1)]
    board = sb.build(shots, script, target=15.0, max_clip=8.0)
    assert board.duration_s == pytest.approx(15.0)
    assert board.target_seconds == 15.0
    assert all(s.duration_s <= 8.0 for s in board.shots)


def test_build_refuses_an_uncovered_beat_after_fitting():
    """Fitting durations is safe because it changes no content. Repairing coverage would
    invent a beat, and a fabricated beat is indistinguishable from a written one."""
    script = _script("hook", "proof", "cta")
    with pytest.raises(sb.StoryboardError, match="proof"):
        sb.build([_shot("hook"), _shot("cta")], script, target=10.0)


def test_render_mode_defaults_to_independent():
    """T9.5 blast radius: sequential gives continuity but makes a repair cascade
    forward. Stay local until the continuity check is trustworthy."""
    board = sb.build([_shot("hook")], _script("hook"), target=5.0)
    assert board.render_mode == "independent"


# --- the deliverable ---------------------------------------------------------------

def test_shot_list_is_human_readable():
    script = _script("hook", "cta")
    board = sb.build([_shot("hook", 2), _shot("cta", 2)], script, target=8.0)
    text = sb.as_shot_list(board)
    assert "8.0s / 2 shots / independent" in text
    assert "hook" in text and "cta" in text
    assert "a subject" in text
