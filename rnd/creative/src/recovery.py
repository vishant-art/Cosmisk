"""Shot recovery (T9.5): escalating repair, downstream of QA.

The naive design is `render -> failure -> rewrite -> render`. It is wrong, because
**render almost never fails**. Ask Seedance for "girl opens fridge, cat jumps out" and
it will not throw. It will confidently hand you a girl, a fridge, and no cat. Plausible,
well lit, wrong.

Failure is DETECTED, not raised. So recovery hangs off the QA gate:

    render(shot_i) -> verify_shot(shot_i) -> verdict -> repair(shot_i)

Escalate, do not loop. A model that produced a bad shot from a prompt will usually
produce another bad shot from the same prompt, so retrying more than once is paying
twice for the same mistake. Four rungs, in `config.RECOVERY_LADDER`:

    retry     the same prompt (models are stochastic; once is worth it)
    reprompt  the same shot, prompt seeded with the QA hint
    replan    a DIFFERENT shot serving the same beat purpose (story_brain.replan_shot)
    drop      remove the shot, redistribute its seconds (storyboard.drop_shot)

Rung 3 is where `Shot.purpose` earns its keep: you can only regenerate a shot in
isolation if you know what it was for. Rung 4 is what stops one bad beat from burning
the budget, and it is constrained by T6's coverage invariant rather than by this module:
a shot may only be dropped when another shot already serves its beat.

BLAST RADIUS. In `independent` mode a repair is local. In `sequential` mode shot N+1 was
conditioned on shot N's final frame, so repairing N invalidates everything after it. The
trade-off is named on `Storyboard.render_mode` rather than discovered at 2am.

The renderer is INJECTED. `render_board` takes callables, so the whole control loop runs
offline at $0 in tests and T7 supplies the real Seedance call later.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import storyboard as sb_mod  # noqa: E402
from schemas import QACheck, RepairLog, RepairStep, Script, Shot, Storyboard  # noqa: E402


class RecoveryExhausted(RuntimeError):
    """The ladder ran out of rungs and the shot is still bad. Fail closed."""


def next_action(attempt: int) -> str | None:
    """Which rung to try on the `attempt`-th failure. None when the ladder is spent."""
    ladder = config.RECOVERY_LADDER
    return ladder[attempt] if attempt < len(ladder) else None


def blast_radius(board: Storyboard, index: int) -> list[int]:
    """Which shots must be re-rendered after repairing `index`.

    Independent: just the repaired shot. Sequential: it and every shot after it, because
    each was conditioned on its predecessor's final frame and that frame just changed.
    """
    if board.render_mode == "sequential":
        return list(range(index, len(board.shots)))
    return [index]


def _blocking(checks: list[QACheck], *, strict: bool) -> list[QACheck]:
    """Every check that stops this shot from shipping."""
    return [c for c in checks
            if (not c.passed and not c.inconclusive) or (strict and c.inconclusive)]


def _first_failure(checks: list[QACheck], *, strict: bool) -> QACheck | None:
    """The check a repair should answer. Hard failures first; inconclusive only in strict
    mode, and only after every hard failure has been addressed.

    Unrepairable checks are skipped: re-rendering cannot change them, so they must not
    drive the ladder. `render_board` refuses the whole board on them instead.
    """
    blocking = [c for c in _blocking(checks, strict=strict) if c.repairable]
    hard = [c for c in blocking if not c.inconclusive]
    return hard[0] if hard else (blocking[0] if blocking else None)


def render_board(board: Storyboard, *, render, verify, script: Script | None = None,
                 replan=None, strict: bool = True, max_renders: int | None = None,
                 log=print) -> tuple[list[str], Storyboard, RepairLog]:
    """Render every shot, repairing the ones that fail their own QA.

    `render(shot, index, attempt, hint) -> path`   the renderer (Seedance, in prod)
    `verify(path, shot, index) -> list[QACheck]`   verifier_video.verify_shot, in prod
    `replan(shot, reason) -> Shot`                 story_brain.replan_shot, in prod

    Returns (clip paths, the possibly-shortened board, the repair log). Raises
    RecoveryExhausted when a shot cannot be fixed and cannot be dropped, because a
    timeline with a known-bad shot in it is not a timeline we should ship.
    """
    max_renders = config.RECOVERY_MAX_TOTAL_RENDERS if max_renders is None else max_renders
    rlog = RepairLog()
    clips: dict[int, str] = {}
    attempts: dict[int, int] = {}
    hints: dict[int, str] = {}

    i = 0
    while i < len(board.shots):
        if rlog.renders >= max_renders:
            raise RecoveryExhausted(
                f"render budget of {max_renders} exhausted at shot {i}; the renderer is "
                f"failing systematically, not occasionally")

        shot = board.shots[i]
        attempt = attempts.get(i, 0)
        clips[i] = render(shot, i, attempt, hints.get(i))
        rlog.renders += 1

        checks = verify(clips[i], shot, i)

        # A defect no re-render can fix stops the board here, before the ladder spends
        # money proving the point four times. Still fail-closed: we refuse to ship.
        stuck = [c for c in _blocking(checks, strict=strict) if not c.repairable]
        if stuck:
            rlog.exhausted.append(i)
            raise RecoveryExhausted(
                f"shot {i} ({shot.purpose}) has a defect no re-render can fix: "
                f"{stuck[0].detail}")

        failure = _first_failure(checks, strict=strict)
        if failure is None:
            if attempt > 0:
                # Record which rung actually fixed it. Otherwise the log tells you what
                # was tried and never which one worked.
                for step in reversed(rlog.steps):
                    if step.shot_index == i:
                        step.resolved = True
                        break
            i += 1
            continue

        action = next_action(attempt)
        if action is None:
            rlog.exhausted.append(i)
            raise RecoveryExhausted(
                f"shot {i} ({shot.purpose}) failed every rung of the ladder. "
                f"Last defect: {failure.detail}")

        step = RepairStep(shot_index=i, attempt=attempt, action=action,
                          reason=failure.detail)
        log(f"[recovery] shot {i} ({shot.purpose}) failed: {failure.detail}")
        log(f"[recovery]   rung {attempt} -> {action}")

        if action == "retry":
            attempts[i] = attempt + 1

        elif action == "reprompt":
            hints[i] = failure.detail
            attempts[i] = attempt + 1

        elif action == "replan":
            if replan is None:
                # Cannot replan without a brain. Skip the rung rather than pretend it ran.
                log("[recovery]   no replan callable; skipping to the next rung")
                attempts[i] = attempt + 1
                step.action = "replan"
                step.reason = failure.detail + " (skipped: no replan callable)"
                rlog.steps.append(step)
                continue
            replacement = replan(shot, failure.detail)
            if replacement.purpose != shot.purpose:
                raise RecoveryExhausted(
                    f"replan for shot {i} returned a {replacement.purpose!r} shot; "
                    f"that drops the {shot.purpose!r} beat instead of repairing it")
            board = board.model_copy(update={
                "shots": [replacement if j == i else s for j, s in enumerate(board.shots)]})
            hints.pop(i, None)
            attempts[i] = attempt + 1

        elif action == "drop":
            ok, why = sb_mod.can_drop(board, i, script)
            if not ok:
                rlog.exhausted.append(i)
                rlog.steps.append(step)
                raise RecoveryExhausted(
                    f"shot {i} ({shot.purpose}) cannot be repaired and cannot be dropped: "
                    f"{why}. Last defect: {failure.detail}")
            board = sb_mod.drop_shot(board, i, script)
            rlog.dropped.append(i)
            step.resolved = True
            rlog.steps.append(step)
            log(f"[recovery]   dropped shot {i}; {len(board.shots)} shot(s) remain, "
                f"still {board.duration_s:.1f}s")
            # Every later shot shifted down one index, and every duration changed, so
            # nothing rendered so far is still valid past this point.
            clips = {j: p for j, p in clips.items() if j < i}
            attempts = {j: a for j, a in attempts.items() if j < i}
            hints = {j: h for j, h in hints.items() if j < i}
            continue

        rlog.steps.append(step)

    # The repaired shot's successors were conditioned on it. Re-render them.
    return _settle(board, clips, rlog, render=render, verify=verify, strict=strict,
                   max_renders=max_renders, log=log)


def _settle(board, clips, rlog, *, render, verify, strict, max_renders, log):
    """In sequential mode, re-render the tail of any shot whose predecessor changed.

    Runs after the main pass so the ladder never fights itself: a repair mid-board would
    otherwise invalidate shots the loop had already accepted, and the loop would not know.
    """
    if board.render_mode == "sequential" and rlog.steps:
        first_repair = min(s.shot_index for s in rlog.steps)
        for j in blast_radius(board, first_repair)[1:]:
            if j >= len(board.shots):
                continue
            if rlog.renders >= max_renders:
                raise RecoveryExhausted(
                    f"render budget exhausted while re-rendering the tail after a "
                    f"sequential repair at shot {first_repair}")
            log(f"[recovery] sequential: re-rendering shot {j} (its reference changed)")
            clips[j] = render(board.shots[j], j, 0, None)
            rlog.renders += 1
            failure = _first_failure(verify(clips[j], board.shots[j], j), strict=strict)
            if failure is not None:
                rlog.exhausted.append(j)
                raise RecoveryExhausted(
                    f"shot {j} failed after a sequential repair upstream: {failure.detail}")

    ordered = [clips[k] for k in sorted(clips)]
    log(f"[recovery] {len(ordered)} shot(s) rendered in {rlog.renders} render(s); "
        f"{len(rlog.dropped)} dropped, {len(rlog.steps)} repair step(s)")
    return ordered, board, rlog
