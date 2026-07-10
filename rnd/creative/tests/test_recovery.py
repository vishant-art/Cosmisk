"""Shot recovery (T9.5): the escalating repair ladder.

The renderer is injected, so the whole control loop runs offline at $0. What is under
test is the CONTROL FLOW, not ffmpeg: which rung fires, in what order, what a repair
invalidates, and what happens when the ladder runs out.

The load-bearing idea: `render` almost never fails. It returns a plausible wrong clip.
So every rung here is triggered by a QA verdict, never by an exception.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import config  # noqa: E402
import recovery  # noqa: E402
import storyboard as sb_mod  # noqa: E402
from schemas import QACheck, Script, ScriptBeat, Shot, Storyboard  # noqa: E402


def _shot(purpose, dur=3.0, product="absent", name=None):
    return Shot(purpose=purpose, duration_s=dur, camera="selfie",
                subject=name or f"{purpose} shot", product_visible=product)


def _board(*purposes, mode="independent", dur=3.0):
    """Every shot gets a unique `subject`, because after a drop the shot at index `i` is
    a DIFFERENT shot. Anything keyed by index is then talking about the wrong one, which
    is a hazard for the real system too and the reason the loop clears its index-keyed
    state on a drop."""
    shots = [_shot(p, dur, name=f"{p}_{i}") for i, p in enumerate(purposes)]
    return Storyboard(shots=shots, target_seconds=dur * len(purposes), render_mode=mode)


def _script(*purposes):
    return Script(beats=[ScriptBeat(purpose=p, text=f"line for {p}") for p in purposes])


def _ok():
    return [QACheck(name="shot_motion", passed=True)]


def _bad(detail="nothing moves"):
    return [QACheck(name="shot_motion", passed=False, detail=detail)]


class _Renderer:
    """Records every call. `fail_until[subject]` = how many renders of THAT shot are bad.

    Keyed by subject, not index. A drop renumbers everything after it, so an index-keyed
    fake would start failing whichever shot slid into the vacated slot.
    """
    def __init__(self, fail_until=None):
        self.calls = []
        self.fail_until = dict(fail_until or {})

    def render(self, shot, index, attempt, hint):
        self.calls.append({"index": index, "attempt": attempt, "hint": hint,
                           "subject": shot.subject, "purpose": shot.purpose})
        return f"clip_{index}_{attempt}.mp4"

    def verify(self, path, shot, index):
        n = sum(1 for c in self.calls if c["subject"] == shot.subject)
        return _bad() if n <= self.fail_until.get(shot.subject, 0) else _ok()


# --- the ladder ------------------------------------------------------------------

def test_the_ladder_is_retry_reprompt_replan_drop():
    assert config.RECOVERY_LADDER == ("retry", "reprompt", "replan", "drop")
    assert [recovery.next_action(i) for i in range(5)] == [
        "retry", "reprompt", "replan", "drop", None]


def test_a_clean_board_renders_once_per_shot():
    r = _Renderer()
    clips, board, rlog = recovery.render_board(_board("hook", "demo", "cta"),
                                               render=r.render, verify=r.verify,
                                               log=lambda *_: None)
    assert len(clips) == 3
    assert rlog.renders == 3
    assert rlog.steps == [] and rlog.clean


def test_a_stochastic_failure_is_fixed_by_a_plain_retry():
    """Rung 0. The same prompt, once. Models are stochastic and one re-roll is cheap."""
    r = _Renderer(fail_until={"demo_1": 1})
    clips, board, rlog = recovery.render_board(_board("hook", "demo", "cta"),
                                               render=r.render, verify=r.verify,
                                               log=lambda *_: None)
    assert rlog.renders == 4
    assert [s.action for s in rlog.steps] == ["retry"]
    assert rlog.steps[0].resolved, "the log must say which rung actually worked"
    assert rlog.clean


def test_the_second_failure_reprompts_with_the_qa_detail():
    """Rung 1. The renderer is handed the exact defect, not a generic 'try again'."""
    r = _Renderer(fail_until={"hook_0": 2})
    recovery.render_board(_board("hook", "cta"), render=r.render, verify=r.verify,
                          log=lambda *_: None)
    shot0 = [c for c in r.calls if c["index"] == 0]
    assert shot0[0]["hint"] is None            # first render: no hint to give
    assert shot0[1]["hint"] is None            # rung 0 retry: same prompt, deliberately
    assert shot0[2]["hint"] == "nothing moves"  # rung 1 reprompt: seeded with the verdict


def test_the_third_failure_replans_a_different_shot_for_the_same_beat():
    """Rung 2. `Shot.purpose` is what makes this possible: you can only regenerate a shot
    in isolation if you know what it was for."""
    r = _Renderer(fail_until={"hook_0": 3})
    seen = []

    def replan(shot, reason):
        seen.append((shot.purpose, reason))
        return shot.model_copy(update={"subject": "a completely different framing"})

    _clips, _b, rlog = recovery.render_board(_board("hook", "cta"), render=r.render,
                                             verify=r.verify, replan=replan,
                                             log=lambda *_: None)
    assert seen == [("hook", "nothing moves")]
    assert [s.action for s in rlog.steps if s.shot_index == 0] == [
        "retry", "reprompt", "replan"]
    subjects = [c["subject"] for c in r.calls if c["index"] == 0]
    assert subjects[-1] == "a completely different framing"


def test_a_replan_that_changes_the_beat_is_not_a_repair():
    """It silently drops the beat, and T6's coverage invariant would only notice later."""
    r = _Renderer(fail_until={"demo_1": 3})

    def bad_replan(shot, reason):
        return shot.model_copy(update={"purpose": "cta"})

    with pytest.raises(recovery.RecoveryExhausted, match="drops the 'demo' beat"):
        recovery.render_board(_board("hook", "demo", "cta"), render=r.render,
                              verify=r.verify, replan=bad_replan, log=lambda *_: None)


def test_the_replan_rung_is_skipped_rather_than_faked_when_there_is_no_brain():
    r = _Renderer(fail_until={"demo_1": 99})
    board = _board("hook", "demo", "demo", "cta")     # a second demo shot makes drop legal
    clips, out, rlog = recovery.render_board(board, render=r.render, verify=r.verify,
                                             replan=None, log=lambda *_: None)
    actions = [s.action for s in rlog.steps if s.shot_index == 1]
    assert actions == ["retry", "reprompt", "replan", "drop"]
    replan_step = next(s for s in rlog.steps if s.action == "replan")
    assert "skipped: no replan callable" in replan_step.reason


# --- rung 4: drop, constrained by T6's coverage invariant ---------------------------

def test_dropping_the_last_shot_of_a_beat_is_refused():
    """A shorter ad is not the goal. An ad with no proof in it is worse than one with a
    bad proof shot, so the ladder runs out rather than removing the beat."""
    r = _Renderer(fail_until={"proof_1": 99})
    with pytest.raises(recovery.RecoveryExhausted, match="removes the beat, not the defect"):
        recovery.render_board(_board("hook", "proof", "cta"), render=r.render,
                              verify=r.verify, script=_script("hook", "proof", "cta"),
                              replan=lambda s, why: s, log=lambda *_: None)


def test_a_redundant_shot_can_be_dropped_and_the_seconds_redistributed():
    r = _Renderer(fail_until={"demo_1": 99})
    board = _board("hook", "demo", "demo", "cta", dur=3.0)   # 12.0s
    clips, out, rlog = recovery.render_board(board, render=r.render, verify=r.verify,
                                             script=_script("hook", "demo", "cta"),
                                             replan=lambda s, why: s, log=lambda *_: None)
    assert rlog.dropped == [1]
    assert len(out.shots) == 3
    assert out.duration_s == pytest.approx(12.0)     # the ad is still 12 seconds
    assert out.purposes() == {"hook", "demo", "cta"}  # the beat survives
    assert len(clips) == 3


def test_after_a_drop_the_shot_at_that_index_is_a_different_shot():
    """A drop renumbers everything after it. The loop must throw away its index-keyed
    attempt counters and hints, or the survivor that slides into the vacated slot
    inherits the dead shot's ladder position and gets dropped on its first failure.

    This is also why the fake renderer keys failures by subject: an index-keyed one
    starts failing whoever moved into the slot, which looks exactly like a code bug.
    """
    r = _Renderer(fail_until={"demo_1": 99, "demo_2": 1})
    board = _board("hook", "demo", "demo", "cta")
    clips, out, rlog = recovery.render_board(board, render=r.render, verify=r.verify,
                                             script=_script("hook", "demo", "cta"),
                                             replan=lambda s, why: s, log=lambda *_: None)
    assert rlog.dropped == [1]
    # demo_2 slid into index 1, failed once, and got a FRESH ladder starting at retry
    after_drop = [c for c in r.calls if c["subject"] == "demo_2"]
    assert [c["attempt"] for c in after_drop] == [0, 1]
    assert out.shots[1].subject == "demo_2"


def test_the_hook_shot_can_never_be_dropped():
    ok, why = sb_mod.can_drop(_board("hook", "hook", "cta"), 0)
    assert not ok and "opens on the hook" in why


def test_the_cta_shot_can_never_be_dropped():
    ok, why = sb_mod.can_drop(_board("hook", "cta", "cta"), 2)
    assert not ok and "closes on the CTA" in why


def test_drop_shot_keeps_the_target_exact():
    board = _board("hook", "demo", "demo", "cta", dur=2.5)    # 10.0s
    out = sb_mod.drop_shot(board, 2, _script("hook", "demo", "cta"))
    assert len(out.shots) == 3
    assert out.duration_s == pytest.approx(10.0)


def test_drop_shot_refuses_to_remove_a_beat():
    board = _board("hook", "proof", "cta")
    with pytest.raises(sb_mod.StoryboardError, match="removes the beat"):
        sb_mod.drop_shot(board, 1, _script("hook", "proof", "cta"))


# --- blast radius -------------------------------------------------------------------

def test_an_independent_repair_stays_local():
    board = _board("hook", "demo", "cta", mode="independent")
    assert recovery.blast_radius(board, 1) == [1]


def test_a_sequential_repair_cascades_forward():
    """Shot N+1 was conditioned on shot N's final frame. That frame just changed."""
    board = _board("hook", "demo", "cta", mode="sequential")
    assert recovery.blast_radius(board, 1) == [1, 2]


def test_sequential_mode_re_renders_the_tail_after_a_repair():
    r = _Renderer(fail_until={"hook_0": 1})
    board = _board("hook", "demo", "cta", mode="sequential")
    clips, out, rlog = recovery.render_board(board, render=r.render, verify=r.verify,
                                             log=lambda *_: None)
    # 2 renders of shot 0 (one failed), 1 each of shots 1 and 2, then 1 and 2 again
    assert rlog.renders == 6
    assert [c["index"] for c in r.calls] == [0, 0, 1, 2, 1, 2]


def test_independent_mode_does_not_re_render_the_tail():
    r = _Renderer(fail_until={"hook_0": 1})
    board = _board("hook", "demo", "cta", mode="independent")
    clips, out, rlog = recovery.render_board(board, render=r.render, verify=r.verify,
                                             log=lambda *_: None)
    assert rlog.renders == 4
    assert [c["index"] for c in r.calls] == [0, 0, 1, 2]


def test_render_mode_defaults_to_independent_so_repairs_stay_cheap():
    assert _board("hook", "cta").render_mode == "independent"


# --- budgets and fail-closed ----------------------------------------------------------

def test_a_systematically_broken_renderer_costs_a_bounded_amount():
    """Without a global ceiling this is N shots x 4 rungs of real Seedance spend."""
    r = _Renderer(fail_until={"hook_0": 999})
    with pytest.raises(recovery.RecoveryExhausted, match="failing systematically"):
        recovery.render_board(_board("hook", "cta"), render=r.render, verify=r.verify,
                              replan=lambda s, why: s, max_renders=3, log=lambda *_: None)


def test_an_unfixable_shot_raises_rather_than_shipping():
    """A timeline with a known-bad shot in it is not a timeline we should ship."""
    r = _Renderer(fail_until={"hook_0": 999})
    with pytest.raises(recovery.RecoveryExhausted):
        recovery.render_board(_board("hook", "cta"), render=r.render, verify=r.verify,
                              replan=lambda s, why: s, log=lambda *_: None)


def test_an_inconclusive_check_triggers_repair_in_strict_mode():
    """Fail-closed all the way down. A shot we could not verify is a shot we did not
    verify, and re-rendering it is the cheapest way to try again."""
    calls = []

    def render(shot, index, attempt, hint):
        calls.append(attempt)
        return "c.mp4"

    def verify(path, shot, index):
        if len(calls) == 1:
            return [QACheck(name="product_presence", passed=False, inconclusive=True,
                            detail="no cutout to match")]
        return _ok()

    _clips, _b, rlog = recovery.render_board(_board("hook", "cta"), render=render,
                                             verify=verify, log=lambda *_: None)
    assert [s.action for s in rlog.steps] == ["retry"]


def test_lenient_mode_lets_an_inconclusive_check_through():
    def render(shot, index, attempt, hint):
        return "c.mp4"

    def verify(path, shot, index):
        return [QACheck(name="product_presence", passed=False, inconclusive=True,
                        detail="no cutout")]

    clips, _b, rlog = recovery.render_board(_board("hook", "cta"), render=render,
                                            verify=verify, strict=False,
                                            log=lambda *_: None)
    assert rlog.steps == [] and len(clips) == 2


def test_hard_failures_are_repaired_before_inconclusive_ones():
    def verify(path, shot, index):
        return [QACheck(name="product_presence", passed=False, inconclusive=True,
                        detail="inconclusive one"),
                QACheck(name="shot_motion", passed=False, detail="hard one")]
    assert recovery._first_failure(verify(None, None, 0), strict=True).detail == "hard one"


# --- the log is the runtime record, the storyboard is the plan --------------------------

def test_repairs_are_logged_not_written_back_into_the_storyboard():
    """A Shot.repair_attempts counter would make storyboard.json depend on how many times
    a render happened to fail, and the plan would stop being reproducible. The plan is
    what we meant; the log is what happened."""
    r = _Renderer(fail_until={"demo_1": 1})
    board = _board("hook", "demo", "cta")
    _clips, out, rlog = recovery.render_board(board, render=r.render, verify=r.verify,
                                              log=lambda *_: None)
    assert not hasattr(out.shots[1], "repair_attempts")
    assert out.shots[1] == board.shots[1]           # the plan is untouched
    assert rlog.steps[0].shot_index == 1            # the log carries the history
