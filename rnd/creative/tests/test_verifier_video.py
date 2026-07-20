"""The temporal QA gate (T9). Real ffmpeg, real frames, zero spend.

Four of five checks are arithmetic, and they are arithmetic only because the editor
placed the cuts, wrote the captions and knows the shot durations. We are not detecting
our own work; we are asserting it.

The tests that matter most here are the ones about what the gate does when it CANNOT
answer. `inconclusive` is a distinct state from `pass`, and in strict mode it fails.
"We found nothing wrong while looking the other way" is not a verdict.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import config  # noqa: E402
import verifier_video as vv  # noqa: E402
from schemas import Script, ScriptBeat, Shot, Storyboard  # noqa: E402

FPS = 10


# --- fixtures -------------------------------------------------------------------

def _write(path, frames, fps=FPS, size=(96, 96)):
    import imageio_ffmpeg
    w = imageio_ffmpeg.write_frames(str(path), size, fps=fps, macro_block_size=1)
    w.send(None)
    for f in frames:
        w.send(f.tobytes())
    w.close()
    return str(path)


def _tex(seed, size=96):
    return np.random.default_rng(seed).integers(0, 255, (size, size, 3), dtype=np.uint8)


def _hold(frame, seconds, fps=FPS):
    return [frame] * int(seconds * fps)


def _board(*durations, mode="independent", product=None):
    purposes = ["hook"] + ["demo"] * (len(durations) - 2) + ["cta"]
    if len(durations) == 1:
        purposes = ["hook"]
    shots = [Shot(purpose=p, duration_s=d, camera="selfie", subject="s",
                  product_visible=(product[i] if product else "absent"))
             for i, (p, d) in enumerate(zip(purposes, durations))]
    return Storyboard(shots=shots, target_seconds=sum(durations), render_mode=mode)


def _smooth(seed, n=192):
    """Realistic footage: smooth gradients and soft blobs.

    Per-pixel white noise is a pathological input for any difference- or shift-based
    metric. Testing continuity only on noise flattered the perceptual hash into looking
    like it worked, and hid the aliasing bug that a stride-downsampler really has. Every
    continuity fixture is smooth for that reason.
    """
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    img = 60 + 120 * (xx / n) + 40 * np.sin(yy / n * 3.14 * (1 + seed * 0.3))
    for _ in range(3):
        cy, cx, r = rng.uniform(0, n), rng.uniform(0, n), rng.uniform(n * 0.1, n * 0.3)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        img = img + 70 * np.exp(-(d / r) ** 2) * rng.choice([-1, 1])
    img = np.clip(img, 0, 255).astype(np.uint8)
    return np.dstack([img, np.roll(img, 7, 0), np.roll(img, 13, 1)])


@pytest.fixture
def textured_3shot(tmp_path):
    """Three 1.0s shots, each an unrelated scene. Cuts at 1.0s and 2.0s."""
    frames = _hold(_smooth(1), 1.0) + _hold(_smooth(2), 1.0) + _hold(_smooth(3), 1.0)
    return _write(tmp_path / "three.mp4", frames, size=(192, 192))


@pytest.fixture
def smooth_3shot(textured_3shot):
    return textured_3shot


@pytest.fixture
def stalled_3shot(tmp_path):
    """Shot 2 IS shot 1. A cut is nominally planned there, but nothing changed: a
    duplicated render, the failure mode of a retry loop that silently reused a clip."""
    a = _smooth(1)
    frames = _hold(a, 1.0) + _hold(a, 1.0) + _hold(_smooth(3), 1.0)
    return _write(tmp_path / "stalled.mp4", frames, size=(192, 192))


@pytest.fixture
def product_cutout(tmp_path):
    """A smooth RGBA blob with a hard alpha edge, like a BiRefNet cutout."""
    size = 40
    yy, xx = np.mgrid[0:size, 0:size]
    r = np.sqrt((xx - size / 2) ** 2 + (yy - size / 2) ** 2)
    rgb = np.zeros((size, size, 3), np.uint8)
    rgb[..., 0] = np.clip(200 - r * 3, 0, 255)
    rgb[..., 1] = np.clip(120 + xx * 2, 0, 255)
    rgb[..., 2] = 90
    rgba = np.dstack([rgb, ((r < size * 0.45) * 255).astype(np.uint8)])
    p = tmp_path / "cutout.png"
    Image.fromarray(rgba, "RGBA").save(p)
    return str(p)


def _scene(with_product, cutout_path, seed=7):
    rng = np.random.default_rng(seed)
    bg = np.clip(np.tile(np.linspace(40, 190, 96, dtype=np.int16), (96, 1))[..., None]
                 .repeat(3, 2) + rng.integers(-12, 12, (96, 96, 3)), 0, 255).astype(np.uint8)
    if not with_product:
        return bg
    q = np.asarray(Image.open(cutout_path).convert("RGBA"))
    h, w = q.shape[:2]
    y, x = 34, 30
    a = q[..., 3:4] / 255.0
    bg[y:y + h, x:x + w] = (q[..., :3] * a + bg[y:y + h, x:x + w] * (1 - a)).astype(np.uint8)
    return bg


# --- frame similarity -------------------------------------------------------------

def test_identical_frames_correlate_perfectly():
    assert vv.frame_corr(_smooth(1), _smooth(1)) == pytest.approx(1.0, abs=1e-6)


def test_correlation_is_invariant_to_a_re_grade():
    """corr(a, k*a + c) == 1 by construction. That is exactly the invariance the question
    'is this the same footage, re-graded?' requires, and it is why a perceptual hash was
    the wrong tool: dHash keeps the SIGN of each gradient and throws away the magnitude."""
    a = _smooth(1)
    darker = np.clip(a.astype(int) - 60, 0, 255).astype(np.uint8)
    assert vv.frame_corr(a, darker) >= config.QA_STALL_CORR


def test_unrelated_scenes_correlate_weakly():
    assert vv.frame_corr(_smooth(1), _smooth(9)) < config.QA_CONTINUITY_MIN_CORR


def test_a_continuous_pan_sits_between_the_two_thresholds():
    """A shot that moves is neither a duplicate nor a lost thread. The band between the
    thresholds passes, on purpose."""
    a = _smooth(1)
    panned = np.roll(a, 12, axis=1)
    c = vv.frame_corr(a, panned)
    assert config.QA_CONTINUITY_MIN_CORR <= c < config.QA_STALL_CORR


def test_a_flat_frame_has_no_variance_to_correlate():
    """corr returns 0.0, which reads as 'unrelated'. Callers must check frame_std first
    or they will fail a legitimate cut between two solid-colour scenes.

    In float32 this returned -1.0: a uniform frame's centered vector is not exactly zero,
    so `if norm == 0` never fired and the correlation was computed on rounding noise, at
    full confidence. float64 plus a tolerance, not an equality against zero.
    """
    red = np.full((96, 96, 3), (220, 30, 30), np.uint8)
    green = np.full((96, 96, 3), (30, 200, 60), np.uint8)
    assert vv.frame_corr(red, green) == 0.0
    assert vv.frame_corr(red, red) == 0.0          # even against itself: nothing to correlate
    assert vv.frame_std(red) < config.QA_MIN_FRAME_STD
    assert vv.frame_std(_smooth(1)) > config.QA_MIN_FRAME_STD


def test_a_heavily_regraded_duplicate_slips_through_and_we_say_so():
    """KNOWN LIMITATION. +80 luma clips the highlights, so the re-graded copy is no longer
    an affine transform of the original and correlates at ~0.93, under the 0.98 stall
    threshold. A duplicated RENDER is byte-similar and is caught. A duplicate somebody
    deliberately re-graded is not. Recorded here so the gap is a decision, not a surprise."""
    a = _smooth(1)
    brighter = np.clip(a.astype(int) + 80, 0, 255).astype(np.uint8)
    assert vv.frame_corr(a, brighter) < config.QA_STALL_CORR


# --- per-shot checks (what the T9.5 ladder triggers on) -----------------------------

def test_a_frozen_shot_is_caught(tmp_path):
    """A video model handed a still seed will sometimes return the seed, held. It does
    not error. It returns a perfectly good clip in which nothing happens."""
    clip = _write(tmp_path / "frozen.mp4", _hold(_smooth(1), 1.5), size=(192, 192))
    c = vv.check_shot_motion(clip)
    assert not c.passed and not c.inconclusive
    assert "returned its seed, held" in c.detail


def test_a_moving_shot_passes(tmp_path):
    base = _smooth(1)
    frames = [np.roll(base, i * 3, axis=1) for i in range(15)]
    clip = _write(tmp_path / "moving.mp4", frames, size=(192, 192))
    assert vv.check_shot_motion(clip).passed


def test_even_a_very_slow_pan_counts_as_motion(tmp_path):
    """1px per frame. Adjacent frames correlate at 0.998, which is why motion is measured
    against the shot's FIRST frame: an adjacent-frame test calls all real video frozen."""
    base = _smooth(1)
    frames = [np.roll(base, i, axis=1) for i in range(20)]
    clip = _write(tmp_path / "slow.mp4", frames, size=(192, 192))
    assert vv.check_shot_motion(clip).passed


def test_our_own_micro_shake_does_not_rescue_a_frozen_shot(tmp_path):
    """Cosmetic shake is not motion. If the editor's own UGCStyle could hide a stalled
    render, the gate would be certifying its own decoration."""
    import editor
    from schemas import EditPlan, UGCStyle
    frozen = _write(tmp_path / "f.mp4", _hold(_smooth(1), 2.0), size=(192, 192))
    shaken = tmp_path / "shaken.mp4"
    editor.apply_plan(frozen, shaken, EditPlan(style=UGCStyle(micro_shake=2)),
                      log=lambda *_: None)
    assert not vv.check_shot_motion(shaken).passed


def test_a_punch_in_on_a_still_is_still_a_still(tmp_path):
    import editor
    from schemas import EditPlan
    frozen = _write(tmp_path / "f2.mp4", _hold(_smooth(1), 2.0), size=(192, 192))
    punched = tmp_path / "punched.mp4"
    editor.apply_plan(frozen, punched, EditPlan(punch_to=1.08), log=lambda *_: None)
    assert not vv.check_shot_motion(punched).passed


def test_motion_on_a_flat_shot_is_inconclusive(synth_video):
    """synth_video's shots are solid colours: no variance to correlate."""
    flat = np.full((96, 96, 3), 128, np.uint8)
    import imageio_ffmpeg
    p = Path(synth_video).with_name("flat.mp4")
    w = imageio_ffmpeg.write_frames(str(p), (96, 96), fps=FPS, macro_block_size=1)
    w.send(None)
    for _ in range(15):
        w.send(flat.tobytes())
    w.close()
    c = vv.check_shot_motion(str(p))
    assert c.inconclusive and "too flat" in c.detail


def test_verify_shot_checks_duration_motion_and_product(tmp_path, product_cutout):
    from schemas import Shot
    base = _scene(True, product_cutout)
    frames = [np.roll(base, i, axis=1) for i in range(20)]     # 2.0s, moving
    clip = _write(tmp_path / "shot.mp4", frames)
    shot = Shot(purpose="demo", duration_s=2.0, camera="macro", subject="s",
                product_visible="hero")
    checks = vv.verify_shot(clip, shot, 1, cutout_path=product_cutout)
    assert {c.name for c in checks} == {"shot_duration", "shot_motion", "product_presence"}
    assert all(c.passed for c in checks), [c.detail for c in checks]
    assert all(c.shot_index == 1 for c in checks)


def test_verify_shot_is_inconclusive_about_a_hero_product_with_no_cutout(tmp_path):
    from schemas import Shot
    base = _smooth(1)
    frames = [np.roll(base, i * 3, axis=1) for i in range(20)]
    clip = _write(tmp_path / "s.mp4", frames, size=(192, 192))
    shot = Shot(purpose="demo", duration_s=2.0, camera="macro", subject="s",
                product_visible="hero")
    prod = [c for c in vv.verify_shot(clip, shot, 0) if c.name == "product_presence"]
    assert prod[0].inconclusive and not prod[0].passed


def test_verify_shot_skips_the_product_check_when_none_was_promised(tmp_path):
    from schemas import Shot
    base = _smooth(1)
    frames = [np.roll(base, i * 3, axis=1) for i in range(20)]
    clip = _write(tmp_path / "s2.mp4", frames, size=(192, 192))
    shot = Shot(purpose="hook", duration_s=2.0, camera="selfie", subject="s",
                product_visible="absent")
    assert {c.name for c in vv.verify_shot(clip, shot, 0)} == {"shot_duration", "shot_motion"}


# --- product presence -------------------------------------------------------------

def test_product_is_found_when_it_is_there(product_cutout):
    score = vv.product_score(_scene(True, product_cutout), product_cutout)
    assert score >= config.QA_PRODUCT_MIN_SCORE


def test_product_is_not_found_when_it_is_absent(product_cutout):
    """The same background, minus the product. Correlating LUMINANCE scored this at 0.90,
    because a smooth template correlates with any smooth background. Correlating gradient
    magnitude, and masking by the cutout's alpha, drops it to ~0.18."""
    score = vv.product_score(_scene(False, product_cutout), product_cutout)
    assert score < config.QA_PRODUCT_MIN_SCORE


def test_an_unrelated_scene_does_not_match(product_cutout):
    assert vv.product_score(_tex(4), product_cutout) < config.QA_PRODUCT_MIN_SCORE


def test_a_flat_frame_matches_nothing(product_cutout):
    assert vv.product_score(np.full((96, 96, 3), 128, np.uint8), product_cutout) == 0.0


# --- shot durations ---------------------------------------------------------------

def test_shot_durations_are_asserted_against_the_plan(textured_3shot, tmp_path):
    parts = []
    for i, tex in enumerate((1, 2, 3)):
        parts.append(_write(tmp_path / f"s{i}.mp4", _hold(_tex(tex), 1.0)))
    checks = vv.check_shot_durations(parts, _board(1.0, 1.0, 1.0))
    assert all(c.passed for c in checks)
    assert [c.shot_index for c in checks] == [0, 1, 2]


def test_a_short_shot_is_attributed_to_that_shot(tmp_path):
    parts = [_write(tmp_path / "a.mp4", _hold(_tex(1), 1.0)),
             _write(tmp_path / "b.mp4", _hold(_tex(2), 0.4))]
    checks = vv.check_shot_durations(parts, _board(1.0, 1.0))
    assert checks[0].passed and not checks[1].passed
    assert checks[1].shot_index == 1


def test_a_missing_shot_clip_fails_the_count(tmp_path):
    parts = [_write(tmp_path / "a.mp4", _hold(_tex(1), 1.0))]
    checks = vv.check_shot_durations(parts, _board(1.0, 1.0, 1.0))
    assert len(checks) == 1 and not checks[0].passed
    assert "1 clip(s) for 3 shot(s)" in checks[0].detail


# --- cut alignment ------------------------------------------------------------------

def test_cuts_land_where_the_storyboard_put_them(textured_3shot):
    check = vv.check_cut_alignment(textured_3shot, _board(1.0, 1.0, 1.0))
    assert check.passed, check.detail


def test_a_drifted_cut_is_caught(textured_3shot):
    """The clip cuts at 1.0s and 2.0s. A board claiming 0.4s and 2.0s should not pass."""
    check = vv.check_cut_alignment(textured_3shot, _board(0.4, 1.6, 1.0))
    assert not check.passed
    assert "planned" in check.detail


def test_a_planned_cut_with_no_boundary_is_caught(textured_3shot):
    """The clip cuts at 1.0s and 2.0s; a board planning a single cut at 1.5s has no real
    boundary there. A MISSING planned boundary (a stalled render, a wrong assembly) is the
    failure that matters, and it still fails."""
    check = vv.check_cut_alignment(textured_3shot, _board(1.5, 1.5))
    assert not check.passed
    assert "no detected boundary" in check.detail


def test_surplus_detected_cuts_from_effects_are_tolerated(textured_3shot):
    """The UGC editor's punch-in / micro-shake / grain spike the frame-diff detector into
    extra 'cuts'. As long as every PLANNED cut has a real boundary, surplus detections do
    NOT fail the gate: requiring an exact count false-failed clean assemblies (22 vs 2)."""
    # board plans ONE cut at 1.0s; the clip really has boundaries at 1.0s AND 2.0s.
    check = vv.check_cut_alignment(textured_3shot, _board(1.0, 2.0))
    assert check.passed, check.detail
    assert "surplus" in check.detail


# --- continuity -----------------------------------------------------------------------

def test_a_hard_cut_is_fine_in_independent_mode(textured_3shot):
    checks = vv.check_continuity(textured_3shot, _board(1.0, 1.0, 1.0, mode="independent"))
    assert all(c.passed for c in checks), [c.detail for c in checks]


def test_a_lost_thread_is_caught_in_sequential_mode(textured_3shot):
    """Sequential render conditions shot N+1 on shot N's last frame, so the shots should
    resemble each other. Unrelated textures mean the model ignored the reference."""
    checks = vv.check_continuity(textured_3shot, _board(1.0, 1.0, 1.0, mode="sequential"))
    assert not all(c.passed for c in checks)
    assert any("does not follow from" in c.detail for c in checks)


def test_a_stalled_shot_is_caught_in_either_mode(stalled_3shot):
    """Shot 2 IS shot 1. The failure mode of a retry loop that silently reused a clip."""
    for mode in ("independent", "sequential"):
        checks = vv.check_continuity(stalled_3shot, _board(1.0, 1.0, 1.0, mode=mode))
        stall = [c for c in checks if "nothing changed" in c.detail]
        assert stall, f"{mode}: {[c.detail for c in checks]}"
        assert stall[0].shot_index == 1


def test_a_flat_cut_is_inconclusive_not_a_false_alarm(synth_video):
    """synth_video is three SOLID colours. Those are legitimate cuts, but a flat frame has
    no variance to correlate, so the honest answer is 'cannot tell', not 'stalled shot'."""
    checks = vv.check_continuity(synth_video, _board(1.0, 1.0, 1.0))
    assert all(c.inconclusive for c in checks)
    assert all("too flat to correlate" in c.detail for c in checks)


# --- caption / audio agreement ---------------------------------------------------------

SCRIPT = "I genuinely did not expect this"


def _asr(text=SCRIPT, cost=0.0001):
    def _t(audio, **kw):
        return ([{"text": w, "start": i * 0.3, "end": i * 0.3 + 0.25}
                 for i, w in enumerate(text.split())], cost)
    return _t


def test_a_clip_with_no_audio_cannot_be_verified(textured_3shot):
    """Not a pass. The gate could not run, and a check that could not run has not run."""
    c = vv.check_caption_audio(textured_3shot, SCRIPT, transcribe=_asr())
    assert c.inconclusive and not c.passed
    assert "no audio track" in c.detail


def test_matching_audio_passes(textured_3shot, tmp_path):
    import editor
    from schemas import SfxCue
    voiced = tmp_path / "voiced.mp4"
    editor.add_sfx(textured_3shot, voiced, [SfxCue(at_s=0.1, kind="click")],
                   log=lambda *_: None)
    c = vv.check_caption_audio(voiced, SCRIPT, transcribe=_asr(), work_dir=tmp_path)
    assert c.passed and "drift 0.000" in c.detail


def test_the_shipped_clips_audio_is_what_gets_transcribed(textured_3shot, tmp_path):
    """Deliberately ASR the artifact that ships, not the voiceover we generated. A mux
    that laid down the wrong track is exactly the failure a check against our own source
    file would never see."""
    import editor
    from schemas import SfxCue
    voiced = tmp_path / "voiced.mp4"
    editor.add_sfx(textured_3shot, voiced, [SfxCue(at_s=0.1, kind="click")],
                   log=lambda *_: None)
    c = vv.check_caption_audio(voiced, SCRIPT, transcribe=_asr("completely different words"),
                               work_dir=tmp_path)
    assert not c.passed and not c.inconclusive


# --- the VLM critic ------------------------------------------------------------------

class _Vision:
    def __init__(self, payload, cost=0.0003):
        content = json.dumps(payload)
        outer = self

        class _C:
            @staticmethod
            def create(**kw):
                class R:
                    choices = [type("X", (), {"message": type("M", (), {"content": content})()})()]

                    def model_dump(self):
                        return {"usage": {"cost": outer._cost}}
                return R()
        self._cost = cost
        self.chat = type("Chat", (), {"completions": _C()})()


def test_caption_band_crop_returns_a_full_res_frame(textured_3shot):
    """Full-res caption-band crop for the legibility question (the 48px sheet can't show text)."""
    crop = vv._caption_band_crop(textured_3shot, 1.0)
    assert crop is not None and crop[:8] == b"\x89PNG\r\n\x1a\n"


def test_motion_strip_returns_consecutive_frames(textured_3shot):
    """Consecutive-frame strip so the critic can judge motion (frozen / morphing / drift)."""
    strip = vv._motion_strip(textured_3shot, 0.5)
    assert strip is not None and strip[:8] == b"\x89PNG\r\n\x1a\n"


def test_a_clean_sheet_passes(textured_3shot):
    c = vv.vlm_critique(_Vision({"issues": ["none"], "note": "looks fine"}), textured_3shot)
    assert c.passed and c.cost_usd == pytest.approx(0.0003)


def test_a_real_issue_fails(textured_3shot):
    c = vv.vlm_critique(_Vision({"issues": ["extra_limb", "text_garbled"]}), textured_3shot)
    assert not c.passed
    assert "extra_limb" in c.detail and "text_garbled" in c.detail


def test_the_critic_cannot_invent_an_issue(textured_3shot):
    """Closed set, same as the teardown's. 'the pacing feels slightly off in the middle
    third' is unfalsifiable and cannot gate anything."""
    import taxonomy
    with pytest.raises(taxonomy.TaxonomyError):
        vv.vlm_critique(_Vision({"issues": ["vibes_are_off"]}), textured_3shot)


# --- the gate ---------------------------------------------------------------------------

def _script():
    return Script(beats=[ScriptBeat(purpose="hook", text=SCRIPT)])


def test_verify_passes_a_clean_timeline(textured_3shot):
    r = vv.verify(textured_3shot, _board(1.0, 1.0, 1.0), log=lambda *_: None)
    assert r.approved
    assert r.retry_hint is None


def test_shot_boundary_checks_run_on_the_pre_caption_clip(textured_3shot, monkeypatch):
    """Burned-in per-word captions change every ~0.5s and a frame-diff cut detector reads
    each change as a cut, so cut alignment and continuity run on `cuts_clip` (the pre-caption
    timeline) while product/caption/vlm still judge the shipped `clip`."""
    from schemas import QACheck
    ok = QACheck(name="ok", passed=True)
    seen = {}

    def spy_cut(clip, board, **kw):
        seen["cut"] = clip
        return ok

    def spy_cont(clip, board, **kw):
        seen["cont"] = clip
        return [ok]

    monkeypatch.setattr(vv, "check_cut_alignment", spy_cut)
    monkeypatch.setattr(vv, "check_continuity", spy_cont)
    vv.verify(textured_3shot, _board(1.0, 1.0, 1.0), cuts_clip="/pre/timeline.mp4",
              log=lambda *_: None)
    assert seen["cut"] == "/pre/timeline.mp4" and seen["cont"] == "/pre/timeline.mp4"


def test_shot_boundary_checks_default_to_the_shipped_clip(textured_3shot, monkeypatch):
    from schemas import QACheck
    ok = QACheck(name="ok", passed=True)
    seen = {}

    def spy_cut(clip, board, **kw):
        seen["cut"] = clip
        return ok

    def spy_cont(clip, board, **kw):
        seen["cont"] = clip
        return [ok]

    monkeypatch.setattr(vv, "check_cut_alignment", spy_cut)
    monkeypatch.setattr(vv, "check_continuity", spy_cont)
    vv.verify(textured_3shot, _board(1.0, 1.0, 1.0), log=lambda *_: None)
    assert seen["cut"] == textured_3shot and seen["cont"] == textured_3shot


def test_verify_fails_closed_on_an_inconclusive_check(textured_3shot, tmp_path):
    """A shot promised a hero product and there is no cutout to check it against. Strict
    mode calls that a failure, because it is a thing we did not verify."""
    board = _board(1.0, 1.0, 1.0, product=["absent", "hero", "absent"])
    r = vv.verify(textured_3shot, board, log=lambda *_: None)
    assert not r.approved
    assert r.inconclusive()
    assert "no cutout" in r.retry_hint


def test_strict_false_is_an_explicit_decision_to_ship_unverified(textured_3shot):
    board = _board(1.0, 1.0, 1.0, product=["absent", "hero", "absent"])
    r = vv.verify(textured_3shot, board, strict=False, log=lambda *_: None)
    assert r.approved
    assert r.inconclusive(), "the check is still recorded as inconclusive, not as a pass"


def test_verify_names_the_shots_a_repair_pass_should_target(stalled_3shot):
    r = vv.verify(stalled_3shot, _board(1.0, 1.0, 1.0), log=lambda *_: None)
    assert not r.approved
    assert r.failed_shots() == [1]          # T9.5 gets an exact target


def test_verify_sums_the_cost_of_every_check(textured_3shot, tmp_path):
    import editor
    from schemas import SfxCue
    voiced = tmp_path / "v.mp4"
    editor.add_sfx(textured_3shot, voiced, [SfxCue(at_s=0.1, kind="click")],
                   log=lambda *_: None)
    r = vv.verify(voiced, _board(1.0, 1.0, 1.0), _script(),
                  client=_Vision({"issues": ["none"]}), transcribe=_asr(),
                  work_dir=tmp_path, log=lambda *_: None)
    assert r.cost_usd == pytest.approx(0.0001 + 0.0003)


def test_a_failing_product_check_is_attributed_to_its_shot(tmp_path, product_cutout):
    frames = (_hold(_scene(True, product_cutout), 1.0)
              + _hold(_scene(False, product_cutout, seed=11), 1.0))
    clip = _write(tmp_path / "prod.mp4", frames)
    board = _board(1.0, 1.0, product=["hero", "hero"])
    checks = vv.check_product_presence(clip, board, product_cutout)
    by_shot = {c.shot_index: c for c in checks}
    assert by_shot[0].passed, by_shot[0].detail
    assert not by_shot[1].passed, by_shot[1].detail


def test_no_hero_shot_means_nothing_to_check(textured_3shot):
    checks = vv.check_product_presence(textured_3shot, _board(1.0, 1.0, 1.0), None)
    assert len(checks) == 1 and checks[0].passed
    assert "no shot promised" in checks[0].detail


# --- the gate must not reject our own editor's output --------------------------------

def test_the_gate_accepts_the_editors_own_ugc_style(smooth_3shot, tmp_path):
    """A gate that rejects its own pipeline's default output is worse than no gate.

    Grain and micro-shake raise the inter-frame difference. With a STRIDE downsampler,
    heavy grain made the detector report a cut on every single frame. Block-mean
    averaging suppresses it, which is why _read_small averages rather than samples.
    """
    import editor
    from schemas import EditPlan, UGCStyle

    styled = tmp_path / "styled.mp4"
    editor.apply_plan(smooth_3shot, styled,
                      EditPlan(style=UGCStyle(**{k: v for k, v in config.UGC_STYLE_DEFAULT.items()
                                                 if k in ("micro_shake", "grain",
                                                          "exposure_clip", "recompress")})),
                      log=lambda *_: None)
    r = vv.verify(styled, _board(1.0, 1.0, 1.0), log=lambda *_: None)
    assert r.approved, r.retry_hint


def test_heavy_grain_does_not_manufacture_cuts(smooth_3shot, tmp_path):
    import editor
    from schemas import EditPlan, UGCStyle

    grainy = tmp_path / "grainy.mp4"
    editor.apply_plan(smooth_3shot, grainy, EditPlan(style=UGCStyle(grain=0.8)),
                      log=lambda *_: None)
    check = vv.check_cut_alignment(grainy, _board(1.0, 1.0, 1.0))
    assert check.passed, check.detail


def test_the_gate_catches_an_unplanned_speed_ramp(smooth_3shot, tmp_path):
    """The editor sped the clip up and nobody told the storyboard. The cuts move."""
    import editor
    from schemas import EditPlan

    fast = tmp_path / "fast.mp4"
    editor.apply_plan(smooth_3shot, fast, EditPlan(speed=1.5), log=lambda *_: None)
    r = vv.verify(fast, _board(1.0, 1.0, 1.0), log=lambda *_: None)
    assert not r.approved
    assert "planned" in r.retry_hint


def test_the_gate_catches_a_freeze_that_pushed_the_cuts(smooth_3shot, tmp_path):
    import editor
    frozen = tmp_path / "frozen.mp4"
    editor.freeze_frame(smooth_3shot, frozen, at_s=1.5, hold_s=0.6, log=lambda *_: None)
    r = vv.verify(frozen, _board(1.0, 1.0, 1.0), log=lambda *_: None)
    assert not r.approved
