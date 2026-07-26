"""Storyboard: the deterministic half of T6.

The model proposes shots. This module decides whether they are a storyboard.

Two jobs, both arithmetic, neither delegated to an LLM:

  fit_durations  -- scale the model's duration HINTS so they sum to the target exactly
                    and no shot exceeds the per-clip cap. Integer tenths, not floats,
                    because "sums to 15.0s" must be true rather than nearly true.

  validate       -- every script beat has a shot; the piece opens on a hook; if there
                    is a CTA beat, a CTA shot closes it.

A violation is a FAILED plan, not a storyboard with a note attached. story_brain retries
once with the violation as a hint and then gives up. We never repair coverage by
inventing a shot: a fabricated beat is indistinguishable from a written one at the point
of use, which is the same defect as a VLM emitting `product_first_appears_s = 2.1`.

Duration fitting is safe to do deterministically because it changes no content. Coverage
is not.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
from schemas import Script, Shot, Storyboard  # noqa: E402


class StoryboardError(ValueError):
    """The proposed shots are not a storyboard. Carries a hint the model can act on."""


# --- duration fitting -----------------------------------------------------------

def fit_durations(hints: list[float], *, target: float, max_clip: float | None = None,
                  min_shot: float | None = None) -> list[float]:
    """Scale `hints` to sum EXACTLY to `target`, with every shot in [min_shot, max_clip].

    Works in integer tenths of a second. Float proportional scaling leaves a residue
    that either silently drifts the ad's length or gets dumped on the last shot; both
    are worse than rounding honestly and water-filling the remainder.

    Raises when the target is unreachable, because the fix is a different shot COUNT and
    only the model can make that decision.
    """
    max_clip = config.VIDEO_MAX_CLIP_SECONDS if max_clip is None else max_clip
    min_shot = config.STORY_MIN_SHOT_SECONDS if min_shot is None else min_shot
    if not hints:
        raise StoryboardError("a storyboard needs at least one shot")

    T = int(round(target * 10))
    MX = int(round(max_clip * 10))
    MN = int(round(min_shot * 10))
    n = len(hints)

    if n * MX < T:
        raise StoryboardError(
            f"{n} shot(s) capped at {max_clip}s cannot fill {target}s. Propose more shots.")
    if n * MN > T:
        raise StoryboardError(
            f"{n} shot(s) at a {min_shot}s minimum overflow {target}s. Propose fewer shots.")

    weights = [max(float(h), 0.01) for h in hints]
    total = sum(weights)
    d = [min(MX, max(MN, int(round(w / total * T)))) for w in weights]

    # Water-fill the residue one tenth at a time. Grow the shortest shots and shrink the
    # longest, so rounding never lands entirely on whichever shot happens to be last.
    guard = 0
    while sum(d) != T:
        guard += 1
        if guard > 10_000:                       # unreachable given the bounds above
            raise StoryboardError("could not fit durations to the target")
        short = T - sum(d)
        step = 1 if short > 0 else -1
        movable = [i for i in range(n)
                   if (d[i] < MX if step > 0 else d[i] > MN)]
        if not movable:
            raise StoryboardError("could not fit durations to the target")
        movable.sort(key=lambda i: d[i], reverse=(step < 0))
        for i in movable:
            d[i] += step
            if sum(d) == T:
                break

    return [x / 10 for x in d]


# --- validation -----------------------------------------------------------------

def validate(sb: Storyboard, script: Script, *, max_clip: float | None = None) -> None:
    """Raise StoryboardError with an actionable hint, or return None."""
    max_clip = config.VIDEO_MAX_CLIP_SECONDS if max_clip is None else max_clip

    missing = sb.covers(script)
    if missing:
        raise StoryboardError(
            f"no shot renders these script beats: {sorted(missing)}. "
            f"Add one shot per missing beat.")

    if sb.shots[0].purpose != "hook":
        raise StoryboardError(
            f"shot 1 has purpose {sb.shots[0].purpose!r}; a storyboard opens on the hook.")

    if "cta" in script.purposes() and sb.shots[-1].purpose != "cta":
        raise StoryboardError(
            f"the script has a CTA but the last shot is {sb.shots[-1].purpose!r}; "
            f"close on the CTA.")

    over = [i for i, s in enumerate(sb.shots, 1) if s.duration_s > max_clip + 1e-6]
    if over:
        raise StoryboardError(f"shot(s) {over} exceed the {max_clip}s per-clip cap.")

    if abs(sb.duration_s - sb.target_seconds) > 0.05:
        raise StoryboardError(
            f"shots sum to {sb.duration_s}s, not the {sb.target_seconds}s target.")


def build(shots: list[Shot], script: Script, *, target: float,
          max_clip: float | None = None, render_mode: str = "independent") -> Storyboard:
    """Fit the durations, assemble, validate. The one way a Storyboard comes into being."""
    fitted = fit_durations([s.duration_s for s in shots], target=target, max_clip=max_clip)
    sb = Storyboard(
        shots=[s.model_copy(update={"duration_s": d}) for s, d in zip(shots, fitted)],
        target_seconds=target, render_mode=render_mode)
    validate(sb, script, max_clip=max_clip)
    return sb


# --- dropping a shot (T9.5, rung 4) ----------------------------------------------

def can_drop(sb: Storyboard, index: int, script: Script | None = None) -> tuple[bool, str]:
    """May shot `index` be removed? Returns (allowed, reason).

    The T6 invariants decide this, not the repair loop. A storyboard opens on a hook and
    closes on a CTA, and every script beat must be rendered by at least one shot. So a
    shot may only be dropped when ANOTHER shot already serves its purpose. Dropping the
    only `proof` shot does not produce a shorter ad, it produces an ad with no proof in
    it, and shipping that is worse than shipping a bad proof shot.
    """
    if len(sb.shots) <= 1:
        raise_reason = "a storyboard needs at least one shot"
        return False, raise_reason
    if index == 0:
        return False, "shot 0 renders the hook; a storyboard opens on the hook"
    if index == len(sb.shots) - 1 and sb.shots[index].purpose == "cta":
        return False, "the last shot renders the CTA; a storyboard closes on the CTA"

    purpose = sb.shots[index].purpose
    others = [s for i, s in enumerate(sb.shots) if i != index and s.purpose == purpose]
    if not others:
        needed = script is None or purpose in script.purposes()
        if needed:
            return False, (f"shot {index} is the only one rendering the {purpose!r} beat; "
                           f"dropping it removes the beat, not the defect")
    return True, ""


def drop_shot(sb: Storyboard, index: int, script: Script | None = None,
              *, max_clip: float | None = None) -> Storyboard:
    """Remove a shot and give its seconds to the survivors, keeping the target exact.

    Redistribution reuses `fit_durations`, so the remaining shots keep their relative
    weights and the ad still lands on `target_seconds` to the tenth. Raises rather than
    dropping a beat.
    """
    ok, why = can_drop(sb, index, script)
    if not ok:
        raise StoryboardError(why)

    survivors = [s for i, s in enumerate(sb.shots) if i != index]
    fitted = fit_durations([s.duration_s for s in survivors],
                           target=sb.target_seconds, max_clip=max_clip)
    out = Storyboard(
        shots=[s.model_copy(update={"duration_s": d}) for s, d in zip(survivors, fitted)],
        target_seconds=sb.target_seconds, render_mode=sb.render_mode)
    if script is not None:
        validate(out, script, max_clip=max_clip)
    return out


# --- reporting ------------------------------------------------------------------

def as_shot_list(sb: Storyboard) -> str:
    """A human-readable shot list. This is the deliverable even if we never render it:
    a storyboard you can hand to a real creator has standalone value (OQ3)."""
    lines = [f"{sb.duration_s:.1f}s / {len(sb.shots)} shots / {sb.render_mode}"]
    t = 0.0
    for i, s in enumerate(sb.shots, 1):
        lines.append(
            f"  {i}. [{t:5.1f}-{t + s.duration_s:5.1f}s] {s.purpose:<9} {s.camera:<14} "
            f"product={s.product_visible}")
        lines.append(f"       {s.subject}")
        if s.dialogue:
            lines.append(f'       "{s.dialogue}"')
        t += s.duration_s
    return "\n".join(lines)
