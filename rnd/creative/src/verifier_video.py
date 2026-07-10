"""The temporal QA gate (T9): fail-closed verification of a video ad.

This is the only thing on the roadmap a competitor could not ship next quarter.

Everyone else puts a human here. UGCify renders clip one and waits. AdFlow Co-Pilot
"waits for your input before building anything." Topview lets you regenerate storyboard
frames one at a time. That is not a UX flourish, it is a collective admission that
verifying a temporal artifact is unsolved, so they outsource it to the user.

It is tractable for us for one reason: the editor PLACED the cuts, wrote the captions,
and knows the shot durations. We are not detecting our own work, we are asserting it.
Four of the five checks are therefore arithmetic:

  caption/audio agreement  string comparison against the script we wrote
  shot-length adherence    probe each clip, compare to the Storyboard
  cut alignment            detected cuts vs the boundaries we placed
  cut continuity           perceptual hash distance across each boundary
  everything else          a VLM on a contact sheet, answering a CLOSED set of issues

FAIL-CLOSED means a check that could not run is not a check that passed. `inconclusive`
is a distinct state, and in strict mode it fails the gate. "We found nothing wrong while
looking the other way" is not a verdict.

`verifier.py` does the same job for one static frame. This is that, over time.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import captions as captions_mod  # noqa: E402
import config  # noqa: E402
import editor  # noqa: E402
import ledger  # noqa: E402
import taxonomy  # noqa: E402
import teardown  # noqa: E402
from schemas import QACheck, QAReport, Script, Shot, Storyboard  # noqa: E402


# --- frame similarity -----------------------------------------------------------
#
# A perceptual hash was the obvious choice here and it does not work. Measured on
# realistic footage, a duplicate shot re-graded brighter and a completely unrelated
# scene both scored a dHash distance of 9/64. The classes overlap at every hash size,
# because dHash throws away magnitude and keeps only the sign of each gradient.
#
# Zero-mean normalized correlation is affine-intensity invariant BY CONSTRUCTION:
# corr(a, k*a + c) == 1 for any k > 0. That is precisely the invariance the question
# "is this the same footage, re-graded?" requires.

def frame_std(frame) -> float:
    """Luminance standard deviation. Zero on a flat frame, where correlation is undefined."""
    import numpy as np
    return float(frame.astype("float32").mean(axis=2).std())


# A uniform frame's centered vector is not exactly zero in floating point. In float32
# the residual rounding noise has a norm around 1e-4, so `if nx == 0` never fires and
# the correlation is computed on the noise, returning a confident +-1.0. That would make
# a legitimate cut between two flat scenes read as "unrelated" and fail in sequential
# mode. Compute in float64 and compare against a tolerance, not against zero.
_CORR_EPS = 1e-6


def frame_corr(a, b) -> float:
    """Zero-mean normalized correlation of two same-size frames, in [-1, 1].

    1.0 means the same image, possibly rescaled and offset in intensity. A flat frame
    has no variance to correlate and returns 0.0; callers must check `frame_std` first,
    or they will read "no variance" as "unrelated".
    """
    import numpy as np
    x = a.astype("float64").mean(axis=2).ravel()
    y = b.astype("float64").mean(axis=2).ravel()
    x = x - x.mean()
    y = y - y.mean()
    nx, ny = float(np.linalg.norm(x)), float(np.linalg.norm(y))
    if nx < _CORR_EPS or ny < _CORR_EPS:
        return 0.0
    return float((x * y).sum() / (nx * ny))


# --- product presence (masked NCC on gradient magnitude) ------------------------

def _gradmag(a):
    """Edge energy. The signal that survives compositing and that a smooth background
    does not have."""
    import numpy as np
    gx, gy = np.zeros_like(a), np.zeros_like(a)
    gx[:, 1:] = np.abs(np.diff(a, axis=1))
    gy[1:, :] = np.abs(np.diff(a, axis=0))
    return np.sqrt(gx * gx + gy * gy)


def masked_ncc(frame, template, mask) -> float:
    """Best zero-mean normalized cross-correlation of `template` in `frame`, in [0, 1],
    computed only over the pixels `mask` selects.

    The mask is the cutout's alpha. Its transparent surround is background by definition,
    and correlating against it would score the background twice.
    """
    import numpy as np
    H, W = frame.shape
    h, w = template.shape
    m = mask > 0.5
    if h > H or w > W or m.sum() < 8:
        return 0.0

    t = template[m]
    t = t - t.mean()
    tn = float(np.sqrt((t * t).sum()))
    if tn == 0:
        return 0.0

    best = 0.0
    for y in range(0, H - h + 1):
        for x in range(0, W - w + 1):
            win = frame[y:y + h, x:x + w][m]
            wm = win - win.mean()
            denom = float(np.sqrt((wm * wm).sum())) * tn
            if denom > 0:
                best = max(best, float((wm * t).sum()) / denom)
    return max(best, 0.0)


def product_score(frame, cutout_path, *, width: int | None = None) -> float:
    """Best match of the product cutout against one frame, over several template scales.

    Correlates GRADIENT MAGNITUDE, not luminance. A smooth product template correlates
    with any smooth background: measured at 0.90 for a product that is not there. Its
    edge structure does not. Swapping the feature took the absent case from 0.90 to 0.18
    while the present case stayed at 0.61.

    Honest about its limits. This finds a product COMPOSITED from the cutout (the Bria
    product-shot path) with a ~3.4x margin. It is weak against a product the image model
    re-drew from a reference, because then the pixels genuinely differ. That is why the
    check reports `inconclusive` rather than `fail` when it has no cutout to match.
    """
    import numpy as np
    from PIL import Image

    width = config.QA_PRODUCT_FRAME_WIDTH if width is None else width
    f_img = Image.fromarray(frame.astype("uint8")).convert("L").resize(
        (width, width), Image.Resampling.LANCZOS)
    F = _gradmag(np.asarray(f_img, dtype=np.float32))

    cut = Image.open(cutout_path).convert("RGBA")
    best = 0.0
    for frac in config.QA_PRODUCT_SCALES:
        tw = max(6, int(width * frac))
        arr = np.asarray(cut.resize((tw, tw), Image.Resampling.LANCZOS), dtype=np.float32)
        T = _gradmag(arr[..., :3].mean(axis=2))
        mask = arr[..., 3] / 255.0
        if mask.max() == 0:                     # an opaque cutout: match the whole tile
            mask = np.ones_like(mask)
        best = max(best, masked_ncc(F, T, mask))
    return best


# --- the checks -----------------------------------------------------------------

def check_caption_audio(clip, script: str, *, transcribe=None, work_dir=None,
                        led=None) -> QACheck:
    """ASR the FINAL mux and diff it against the script we wrote.

    Deliberately transcribes the artifact that ships, not the voiceover we generated.
    A mux that dropped the audio track, or laid down the wrong one, is exactly the
    failure that a check against our own source file would never see.
    """
    clip = Path(clip)
    work_dir = Path(work_dir) if work_dir else clip.parent
    if not editor.probe(clip)["has_audio"]:
        return QACheck(name="caption_audio", passed=False, inconclusive=True,
                       repairable=False,
                       detail="the shipped clip has no audio track to verify against")

    if transcribe is None:
        import video_providers
        transcribe = video_providers.transcribe_words

    wav = teardown.extract_audio(clip, work_dir / f"{clip.stem}_qa.wav")
    if not wav:
        return QACheck(name="caption_audio", passed=False, inconclusive=True,
                       repairable=False,
                       detail="could not demux audio from the shipped clip")

    words, cost = transcribe(wav)
    if led is not None:
        led.record("qa_asr", "fal", config.ASR_MODEL, cost)
    d = captions_mod.drift(script, words)
    ok = d <= config.CAPTION_MAX_DRIFT
    return QACheck(name="caption_audio", passed=ok, cost_usd=cost,
                   detail=f"drift {d:.3f} over {len(words)} word(s) "
                          f"(limit {config.CAPTION_MAX_DRIFT})")


def check_shot_durations(shot_paths: list, board: Storyboard, *,
                         tol: float | None = None) -> list[QACheck]:
    """Probe each rendered shot and compare it to the plan. Pure assertion."""
    tol = config.QA_SHOT_DURATION_TOL_S if tol is None else tol
    if len(shot_paths) != len(board.shots):
        return [QACheck(name="shot_count", passed=False,
                        detail=f"{len(shot_paths)} clip(s) for {len(board.shots)} shot(s)")]

    out = []
    for i, (p, shot) in enumerate(zip(shot_paths, board.shots)):
        actual = editor.probe(p)["duration"]
        delta = abs(actual - shot.duration_s)
        out.append(QACheck(
            name="shot_duration", passed=delta <= tol, shot_index=i,
            detail=f"shot {i} ({shot.purpose}): {actual:.2f}s vs planned "
                   f"{shot.duration_s:.2f}s (tol {tol}s)"))
    return out


def check_shot_motion(clip, *, shot_index: int | None = None) -> QACheck:
    """Does anything move in this shot?

    A video model handed a still seed will sometimes return the seed, held. It does not
    error; it returns a perfectly good clip in which nothing happens.

    Measured against the shot's FIRST frame, not against each frame's predecessor.
    Consecutive frames of any real footage correlate above 0.98 (a 1px-per-frame pan
    measures 0.998 adjacent), so an adjacent-frame test calls all real video frozen.
    Against the first frame, a pan drifts to 0.79 while a held frame stays at 1.00.

    Two consequences worth stating, both correct. Our own `micro_shake` scores 0.997 and
    does NOT rescue a stalled render: cosmetic shake is not motion. Our own punch-in
    scores 1.000 on a still, because a punch-in on a still is still a still.

    A flat shot has no variance to correlate, so it is inconclusive rather than frozen.
    """
    frames = [f for _t, f in teardown.sample_frames(clip, grid=32)]
    if len(frames) < 2:
        return QACheck(name="shot_motion", passed=False, inconclusive=True,
                       shot_index=shot_index,
                       detail="fewer than two sampled frames; cannot see motion")
    if any(frame_std(f) < config.QA_MIN_FRAME_STD for f in frames):
        return QACheck(name="shot_motion", passed=False, inconclusive=True,
                       shot_index=shot_index,
                       detail="a frame is too flat to correlate")

    drift = min(frame_corr(frames[0], f) for f in frames[1:])
    if drift >= config.QA_FROZEN_CORR:
        return QACheck(name="shot_motion", passed=False, shot_index=shot_index,
                       detail=f"nothing moves: every frame correlates >= {drift:.3f} with "
                              f"the first. The renderer returned its seed, held.")
    return QACheck(name="shot_motion", passed=True, shot_index=shot_index,
                   detail=f"drift from the first frame: {drift:.3f}")


def verify_shot(clip, shot: Shot, index: int, *, cutout_path=None,
                tol: float | None = None) -> list[QACheck]:
    """Everything we can assert about ONE rendered shot, before it joins a timeline.

    This is what the repair ladder (T9.5) triggers on. Catching a bad shot here costs
    one re-render; catching it after the concat costs the whole timeline.
    """
    tol = config.QA_SHOT_DURATION_TOL_S if tol is None else tol
    checks: list[QACheck] = []

    actual = editor.probe(clip)["duration"]
    delta = abs(actual - shot.duration_s)
    checks.append(QACheck(
        name="shot_duration", passed=delta <= tol, shot_index=index,
        detail=f"{actual:.2f}s vs planned {shot.duration_s:.2f}s (tol {tol}s)"))

    checks.append(check_shot_motion(clip, shot_index=index))

    if shot.product_visible == "hero":
        if not cutout_path or not Path(cutout_path).exists():
            checks.append(QACheck(
                name="product_presence", passed=False, inconclusive=True,
                repairable=False, shot_index=index,
                detail="shot promises a hero product but there is no cutout to match it "
                       "against. Re-rendering cannot fix a missing input: supply a product "
                       "image, replan the shot with product_visible != 'hero', or run "
                       "lenient."))
        else:
            frames = [f for _t, f in teardown.sample_frames(
                clip, sample_fps=config.QA_PRODUCT_SAMPLE_FPS, grid=128)]
            best = max((product_score(f, cutout_path) for f in frames), default=0.0)
            checks.append(QACheck(
                name="product_presence", passed=best >= config.QA_PRODUCT_MIN_SCORE,
                shot_index=index,
                detail=f"best match {best:.2f} (min {config.QA_PRODUCT_MIN_SCORE})"))
    return checks


def _planned_cuts(board: Storyboard) -> list[float]:
    t, cuts = 0.0, []
    for shot in board.shots[:-1]:
        t += shot.duration_s
        cuts.append(round(t, 3))
    return cuts


def check_cut_alignment(clip, board: Storyboard, *, tol: float | None = None) -> QACheck:
    """Do the cuts land where the storyboard put them?

    Defense in depth on the concat: we know where the boundaries should be, so a
    detector that disagrees means the assembly is wrong, not that the detector is
    clever. Detection is the fallback, the plan is the truth.
    """
    tol = config.QA_CUT_TOL_S if tol is None else tol
    planned = _planned_cuts(board)
    shots, _duration, _stats = teardown.detect_shots(clip)
    detected = [s.start_s for s in shots[1:]]

    if len(detected) != len(planned):
        return QACheck(name="cut_alignment", passed=False,
                       detail=f"detected {len(detected)} cut(s), planned {len(planned)}")
    for i, (d, p) in enumerate(zip(detected, planned)):
        if abs(d - p) > tol:
            return QACheck(name="cut_alignment", passed=False, shot_index=i + 1,
                           detail=f"cut {i + 1} at {d:.2f}s, planned {p:.2f}s (tol {tol}s)")
    return QACheck(name="cut_alignment", passed=True,
                   detail=f"{len(planned)} cut(s) within {tol}s of plan")


def check_continuity(clip, board: Storyboard) -> list[QACheck]:
    """Frame correlation across each cut boundary, tested in BOTH directions.

    Too HIGH and nothing changed: a duplicated shot, or a render that stalled. That is a
    failure in either render mode. Correlation catches this where a hash cannot, because
    it is invariant to a re-grade rather than merely robust to one.

    Too LOW is only a failure in `sequential` mode, where shot N+1 was conditioned on
    shot N's final frame and should therefore resemble it. In `independent` mode a big
    jump across a cut is the intended effect, and flagging it would be flagging the
    storyboard for doing its job.

    Known limitation, stated rather than hidden: a duplicate shot that was heavily
    re-graded (+80 luma, which clips highlights) correlates at 0.934 and slips under the
    0.98 stall threshold. A duplicated RENDER is byte-similar and is caught; a duplicate
    someone deliberately re-graded is not. Between those two thresholds is an ambiguous
    band that passes, on purpose.
    """
    import numpy as np
    frames = list(teardown.sample_frames(clip, grid=32))
    if not frames:
        return [QACheck(name="continuity", passed=False, inconclusive=True,
                        detail="no frames could be read from the clip")]

    times = np.array([t for t, _ in frames])
    out: list[QACheck] = []
    for i, cut in enumerate(_planned_cuts(board)):
        before = int(np.searchsorted(times, cut) - 1)
        after = int(np.searchsorted(times, cut))
        if before < 0 or after >= len(frames):
            out.append(QACheck(name="continuity", passed=False, inconclusive=True,
                               shot_index=i + 1,
                               detail=f"cut at {cut:.2f}s falls outside the sampled frames"))
            continue

        fa, fb = frames[before][1], frames[after][1]
        if (frame_std(fa) < config.QA_MIN_FRAME_STD
                or frame_std(fb) < config.QA_MIN_FRAME_STD):
            # A flat frame has no variance, so correlation is undefined and would read
            # as 0.0, i.e. "unrelated". Two different solid-colour scenes are a perfectly
            # legitimate cut. We cannot measure this one, so we say so.
            out.append(QACheck(name="continuity", passed=False, inconclusive=True,
                               shot_index=i + 1,
                               detail=f"cut {i + 1}: a frame is too flat to correlate "
                                      f"(std below {config.QA_MIN_FRAME_STD})"))
            continue

        c = frame_corr(fa, fb)
        if c >= config.QA_STALL_CORR:
            out.append(QACheck(name="continuity", passed=False, shot_index=i + 1,
                               detail=f"cut {i + 1}: correlation {c:.3f} >= "
                                      f"{config.QA_STALL_CORR}; nothing changed across "
                                      f"the cut (duplicate or stalled shot)"))
        elif (board.render_mode == "sequential"
              and c < config.QA_CONTINUITY_MIN_CORR):
            out.append(QACheck(name="continuity", passed=False, shot_index=i + 1,
                               detail=f"cut {i + 1}: correlation {c:.3f} < "
                                      f"{config.QA_CONTINUITY_MIN_CORR} in sequential "
                                      f"mode; shot {i + 1} does not follow from shot {i}"))
        else:
            out.append(QACheck(name="continuity", passed=True, shot_index=i + 1,
                               detail=f"cut {i + 1}: correlation {c:.3f}"))
    return out


def check_product_presence(clip, board: Storyboard, cutout_path=None) -> list[QACheck]:
    """Does the product appear in the shots that promised it?

    The storyboard already declared `product_visible` per shot. This asserts against
    that declaration rather than asking an open question, which is why it can gate.

    With no cutout to match, the answer is INCONCLUSIVE, not pass. A shot that promised
    a hero product and cannot be checked has not been checked.
    """
    import numpy as np
    wanted = [i for i, s in enumerate(board.shots) if s.product_visible == "hero"]
    if not wanted:
        return [QACheck(name="product_presence", passed=True,
                        detail="no shot promised a hero product")]
    if not cutout_path or not Path(cutout_path).exists():
        return [QACheck(name="product_presence", passed=False, inconclusive=True,
                        repairable=False, shot_index=i,
                        detail=f"shot {i} promises a hero product but there is no cutout "
                               f"to match it against")
                for i in wanted]

    frames = list(teardown.sample_frames(clip, sample_fps=2, grid=128))
    if not frames:
        return [QACheck(name="product_presence", passed=False, inconclusive=True,
                        detail="no frames could be read from the clip")]
    times = np.array([t for t, _ in frames])

    starts, t = [], 0.0
    for s in board.shots:
        starts.append((t, t + s.duration_s))
        t += s.duration_s

    out = []
    for i in wanted:
        lo, hi = starts[i]
        idx = [j for j in range(len(frames)) if lo <= times[j] < hi]
        if not idx:
            out.append(QACheck(name="product_presence", passed=False, inconclusive=True,
                               shot_index=i,
                               detail=f"shot {i} has no sampled frames to inspect"))
            continue
        best = max(product_score(frames[j][1], cutout_path) for j in idx)
        out.append(QACheck(
            name="product_presence", passed=best >= config.QA_PRODUCT_MIN_SCORE,
            shot_index=i,
            detail=f"shot {i}: best match {best:.2f} "
                   f"(min {config.QA_PRODUCT_MIN_SCORE})"))
    return out


# --- the VLM critic (closed set) --------------------------------------------------

_CRITIC_SYSTEM = (
    "You are a quality gate for a finished short-form video ad. You are shown a CONTACT "
    "SHEET: keyframes tiled left-to-right, top-to-bottom, in chronological order.\n"
    "Report only DEFECTS you can SEE. Return STRICT JSON:\n"
    '{"issues": [str], "note": str}\n'
    "Each issue MUST be chosen verbatim from this list: {issues}\n"
    "Return [\"none\"] when the frames are clean. Do NOT invent an issue code. Do NOT "
    "estimate any timing, duration, ratio or count: those are measured elsewhere and "
    "your guess would silently overwrite a real measurement. `note` is one short "
    "sentence for a human, never a substitute for an issue code."
)

_HARMLESS = {"none"}


def vlm_critique(client, clip, *, led=None) -> QACheck:
    """One vision call on a contact sheet, not on the video.

    Same trick the static critic uses, at the same price: the questions worth asking a
    model ("did it draw six fingers", "are the captions legible") are all answerable
    from the shot openings. Sending the whole clip would cost more and buy nothing.
    """
    _shots, _dur, stats = teardown.detect_shots(clip)
    sheet = teardown._contact_sheet(stats["keyframes"])

    import base64
    system = _CRITIC_SYSTEM.replace("{issues}", ", ".join(taxonomy.values(taxonomy.QaIssue)))
    resp = client.chat.completions.create(
        model=config.VISION_MODEL,
        temperature=config.CLASSIFY_TEMPERATURE,
        response_format={"type": "json_object"},
        extra_body={"usage": {"include": True}},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": [
                {"type": "text", "text": "Inspect this ad for visible defects."},
                {"type": "image_url", "image_url": {
                    "url": f"data:image/png;base64,{base64.b64encode(sheet).decode()}"}},
            ]},
        ],
    )
    text = (resp.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):text.rfind("}") + 1]
    raw = json.loads(text)
    cost = ledger.response_cost(resp)
    if led is not None:
        led.record("qa_vlm", "openrouter", config.VISION_MODEL, cost)

    issues = [taxonomy.coerce(taxonomy.QaIssue, i, field="issue")
              for i in (raw.get("issues") or ["none"])]
    real = sorted(set(issues) - _HARMLESS)
    return QACheck(name="vlm_critic", passed=not real, cost_usd=cost,
                   detail=(f"issues: {', '.join(real)}" if real else "clean")
                          + (f" -- {raw.get('note', '')}".rstrip(" -") if raw.get("note") else ""))


# --- the gate ---------------------------------------------------------------------

def verify(clip, board: Storyboard, script: Script | str | None = None, *,
           client=None, cutout_path=None, shot_paths=None, transcribe=None,
           strict: bool = True, led=None, work_dir=None, log=print) -> QAReport:
    """Run every applicable check and return a fail-closed verdict.

    `strict` (the default) fails the gate on an INCONCLUSIVE check. A shot that promised
    a hero product and could not be checked has not been checked, and shipping it is a
    decision, not an oversight. Pass `strict=False` to make that decision explicitly.
    """
    checks: list[QACheck] = []

    if shot_paths:
        checks += check_shot_durations(shot_paths, board)
    checks.append(check_cut_alignment(clip, board))
    checks += check_continuity(clip, board)
    checks += check_product_presence(clip, board, cutout_path)

    if script is not None:
        text = script.spoken() if isinstance(script, Script) else str(script)
        checks.append(check_caption_audio(clip, text, transcribe=transcribe,
                                          work_dir=work_dir, led=led))
    if client is not None:
        checks.append(vlm_critique(client, clip, led=led))

    hard = [c for c in checks if not c.passed and not c.inconclusive]
    soft = [c for c in checks if c.inconclusive]
    failed = bool(hard) or (strict and bool(soft))

    hint = None
    if failed:
        reasons = [c.detail for c in (hard + (soft if strict else []))]
        hint = "; ".join(reasons[:4])

    report = QAReport(checks=checks, verdict="fail" if failed else "pass",
                      retry_hint=hint,
                      cost_usd=round(sum(c.cost_usd for c in checks), 6))
    log(f"[qa] {report.verdict}: {len(hard)} failure(s), {len(soft)} inconclusive, "
        f"{len(checks)} check(s), ${report.cost_usd:.4f}")
    if report.failed_shots():
        log(f"[qa] shots needing repair (T9.5): {report.failed_shots()}")
    return report
