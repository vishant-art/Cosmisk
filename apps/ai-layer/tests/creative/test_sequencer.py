"""Sequenced render (T7): a Storyboard becomes a timeline.

`video_providers.generate_with_fallback` is the only thing faked, and it writes a REAL
mp4. Everything downstream is real: trim, the editor's filter chain, the per-shot QA gate,
the repair ladder, and the concat. Zero network, zero spend.

The interesting property under test is not "does it produce a file". It is the
pacing/billing conflict: the renderer will not make a clip shorter than four seconds, and
the storyboard wants two.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from ai_layer.creative import config  # noqa: E402
from ai_layer.creative import editor  # noqa: E402
from ai_layer.creative import prompt_builder  # noqa: E402
from ai_layer.creative import sequencer  # noqa: E402
from ai_layer.creative import verifier_video as vv  # noqa: E402
from ai_layer.creative import video_providers  # noqa: E402
from ai_layer.creative.schemas import Script, ScriptBeat, Shot, Storyboard, UGCStyle  # noqa: E402


def _smooth(seed, n=192):
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    img = 60 + 120 * (xx / n) + 40 * np.sin(yy / n * 3.14 * (1 + seed * 0.3))
    for _ in range(3):
        cy, cx, r = rng.uniform(0, n), rng.uniform(0, n), rng.uniform(n * 0.1, n * 0.3)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        img = img + 70 * np.exp(-(d / r) ** 2) * rng.choice([-1, 1])
    img = np.clip(img, 0, 255).astype(np.uint8)
    return np.dstack([img, np.roll(img, 7, 0), np.roll(img, 13, 1)])


def _write(path, frames, fps=10, size=(192, 192)):
    import imageio_ffmpeg
    w = imageio_ffmpeg.write_frames(str(path), size, fps=fps, macro_block_size=1)
    w.send(None)
    for f in frames:
        w.send(f.tobytes())
    w.close()
    return str(path)


def _shot(purpose, dur, product="absent", name=None, motion="a slow pan"):
    return Shot(purpose=purpose, duration_s=dur, camera="selfie",
                subject=name or f"{purpose} scene", product_visible=product, motion=motion)


def _board(*specs, mode="independent"):
    shots = [_shot(p, d, name=f"{p}_{i}") for i, (p, d) in enumerate(specs)]
    return Storyboard(shots=shots, target_seconds=sum(d for _p, d in specs),
                      render_mode=mode)


class _FakeSeedance:
    """Writes a real, moving mp4 of exactly `duration` seconds. Records every call."""
    def __init__(self, frozen_for=()):
        self.calls = []
        self.frozen_for = set(frozen_for)      # subjects that render as a held still

    def __call__(self, prompt, out_path, *, image=None, refs=None, aspect="9:16",
                 duration=10, resolution="720p", fast=False, generate_audio=True, log=print):
        self.calls.append({"prompt": prompt, "duration": duration, "refs": refs,
                           "image": image, "generate_audio": generate_audio})
        seed = abs(hash(prompt)) % 20 + 1
        n = int(duration * 10)
        base = _smooth(seed)
        subject_frozen = any(s in prompt for s in self.frozen_for)
        frames = ([base] * n if subject_frozen
                  else [np.roll(base, i * 3, axis=1) for i in range(n)])
        _write(out_path, frames)
        return {"provider": "seedance", "model": "fake", "path": str(out_path),
                "cost_usd": 0.01 * duration, "audio": False}


@pytest.fixture
def fake_render(monkeypatch):
    f = _FakeSeedance()
    monkeypatch.setattr(video_providers, "generate_with_fallback", f)
    return f


@pytest.fixture
def product_cutout(tmp_path):
    from PIL import Image
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


# --- the pacing / billing conflict ------------------------------------------------

def test_the_renderer_accepts_only_a_discrete_set_of_durations():
    assert config.VIDEO_ALLOWED_DURATIONS == (4, 5, 6, 8, 10, 12, 15)
    for bad in (7, 9, 11, 13, 14):
        assert bad not in config.VIDEO_ALLOWED_DURATIONS


def test_snap_rounds_up_to_a_value_the_api_will_accept():
    assert sequencer.snap_duration(1.2) == 4      # the floor
    assert sequencer.snap_duration(4.0) == 4
    assert sequencer.snap_duration(4.1) == 5
    assert sequencer.snap_duration(6.5) == 8      # NOT 7: the API rejects 7
    assert sequencer.snap_duration(12.5) == 15    # NOT 13 or 14


def test_snap_refuses_a_shot_longer_than_the_renderer_can_make():
    with pytest.raises(sequencer.SequenceError, match="longest clip"):
        sequencer.snap_duration(16.0)


def test_cutting_every_two_seconds_costs_double():
    """The finding. Short-form pacing wants 2s shots; the renderer's floor is 4s."""
    board = _board(("hook", 2.0), ("demo", 2.0), ("cta", 2.0))
    billed, used = sequencer.billed_seconds(board)
    assert used == 6.0
    assert billed == 12.0


def test_longer_shots_waste_less():
    board = _board(("hook", 4.0), ("demo", 6.0), ("cta", 5.0))
    billed, used = sequencer.billed_seconds(board)
    assert (billed, used) == (15.0, 15.0)      # 4 + 6 + 5, every value allowed exactly


def test_the_ledger_records_what_we_paid_for_and_what_we_kept(tmp_path, brand_kit,
                                                              fake_render):
    from ai_layer.creative.ledger import Ledger
    import json
    led = Ledger(tmp_path)
    sequencer.render_shot(_shot("hook", 2.0), 0, 0, None, kit=brand_kit,
                          run_dir=tmp_path, led=led, log=lambda *_: None)
    row = json.loads((tmp_path / "ledger.jsonl").read_text("utf-8").splitlines()[0])
    assert row["billed_s"] == 4 and row["used_s"] == 2.0


# --- one shot ---------------------------------------------------------------------

def test_a_shot_is_generated_long_and_trimmed_to_plan(tmp_path, brand_kit, fake_render):
    out = sequencer.render_shot(_shot("hook", 2.0), 0, 0, None, kit=brand_kit,
                                run_dir=tmp_path, log=lambda *_: None)
    assert fake_render.calls[0]["duration"] == 4          # asked the API for 4s
    assert editor.probe(out)["duration"] == pytest.approx(2.0, abs=0.2)   # kept 2s


def test_native_audio_is_off(tmp_path, brand_kit, fake_render):
    """The concat drops audio anyway, and Seedance rejects a clip outright when its
    auto-generated audio trips a content filter."""
    sequencer.render_shot(_shot("hook", 2.0), 0, 0, None, kit=brand_kit,
                          run_dir=tmp_path, log=lambda *_: None)
    assert fake_render.calls[0]["generate_audio"] is False


def test_the_shot_edit_is_applied(tmp_path, brand_kit, fake_render):
    """plan_for_shot punches in on the hook. The rendered clip must come back edited."""
    plain = sequencer.render_shot(_shot("proof", 2.0), 0, 0, None, kit=brand_kit,
                                  run_dir=tmp_path / "a", log=lambda *_: None)
    hooked = sequencer.render_shot(_shot("hook", 2.0), 0, 0, None, kit=brand_kit,
                                   run_dir=tmp_path / "b", log=lambda *_: None)
    assert editor.probe(plain)["duration"] == pytest.approx(2.0, abs=0.2)
    assert editor.probe(hooked)["duration"] == pytest.approx(2.0, abs=0.2)


# --- the prompt -------------------------------------------------------------------

def test_the_shot_prompt_never_primes_text_or_logo(brand_kit):
    """Same rule as the still prompt. Captions are burned on afterwards, deterministically,
    and priming a video model with 'text' gets you letters you cannot remove."""
    import re
    shot = _shot("demo", 3.0, product="hero", motion="hands twist the lamp")
    p = prompt_builder.build_shot_prompt(shot, brand_kit,
                                         style=UGCStyle(camera="selfie")).lower()
    for word in ("logo", "text", "watermark", "copy", "typography", "caption", "subtitle"):
        assert not re.search(rf"\b{word}\b", p), word


def test_the_shot_prompt_carries_subject_camera_motion_and_product(brand_kit):
    shot = _shot("demo", 3.0, product="hero", name="hands on the lamp",
                 motion="a slow twist")
    p = prompt_builder.build_shot_prompt(shot, brand_kit)
    assert "hands on the lamp" in p
    assert "selfie" in p and "arm's length" in p        # the enum became prose
    assert "a slow twist" in p
    assert "product is the subject" in p


def test_the_qa_hint_is_stated_as_a_defect_to_fix(brand_kit):
    p = prompt_builder.build_shot_prompt(_shot("hook", 2.0), brand_kit,
                                         hint="nothing moves: the renderer returned its seed")
    assert "rejected for this reason" in p and "Fix exactly that" in p


# --- the timeline -------------------------------------------------------------------

def test_a_storyboard_becomes_a_timeline_that_passes_qa(tmp_path, brand_kit, fake_render):
    """The whole stack, end to end: render, trim, edit, verify, concat, verify again."""
    board = _board(("hook", 2.0), ("demo", 3.0), ("cta", 2.0))
    timeline, out, rlog = sequencer.render_storyboard(
        board, kit=brand_kit, run_dir=tmp_path, style=UGCStyle(camera="selfie"),
        log=lambda *_: None)

    assert Path(timeline).exists()
    assert editor.probe(timeline)["duration"] == pytest.approx(7.0, abs=0.35)
    assert rlog.clean and rlog.renders == 3

    report = vv.verify(timeline, out, log=lambda *_: None)
    assert report.approved, report.retry_hint


def test_a_rerun_reuses_the_cached_renders_for_free(tmp_path, brand_kit, fake_render):
    """Phase 9.3: re-running the same storyboard must not re-pay Seedance. The live run
    wasted ~$2.42 regenerating identical shots across two --render invocations."""
    board = _board(("hook", 2.0), ("demo", 3.0), ("cta", 2.0))
    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path, log=lambda *_: None)
    first = len(fake_render.calls)
    assert first == 3

    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path, log=lambda *_: None)
    assert len(fake_render.calls) == first, "a re-run must reuse the cache, not re-render"
    assert list((tmp_path / "renders").glob("gen_*.mp4")), "paid raws kept for reuse"


def test_a_retry_still_re_rolls_despite_the_cache(tmp_path, brand_kit, monkeypatch):
    """The cache must not defeat the stochastic-retry rung: a retry re-rolls the SAME
    prompt and must render fresh, not replay the failed clip."""
    fake = _FakeSeedance()
    calls = {"n": 0}

    def flaky(prompt, out_path, **kw):
        fake.frozen_for = {"demo_1"} if ("demo_1" in prompt and calls["n"] == 0) else set()
        if "demo_1" in prompt and calls["n"] == 0:
            calls["n"] += 1
        return fake(prompt, out_path, **kw)

    monkeypatch.setattr(video_providers, "generate_with_fallback", flaky)
    _timeline, _out, rlog = sequencer.render_storyboard(
        _board(("hook", 2.0), ("demo", 3.0), ("cta", 2.0)), kit=brand_kit,
        run_dir=tmp_path, log=lambda *_: None)
    # hook, demo a0 (frozen), demo a1 (fresh re-roll, moves), cta = 4 real renders
    assert rlog.renders == 4
    assert [s.action for s in rlog.steps] == ["retry"]


def _hero_board():
    return Storyboard(target_seconds=5.0, render_mode="independent", shots=[
        _shot("hook", 2.0, name="hook_0"),
        Shot(purpose="demo", duration_s=3.0, camera="macro", subject="the product",
             product_visible="hero", motion="a slow push in")])


def _fake_product_shot(record):
    from PIL import Image

    def _f(scene, out, *, primary="flux", refs=None, negative=None, aspect="9:16",
           log=print, **kw):
        record.append({"scene": scene, "primary": primary, "refs": refs,
                       "negative": negative})
        Image.new("RGB", (64, 64), "tan").save(out)
        return {"provider": "product", "model": "bria", "path": str(out), "cost_usd": 0.04}
    return _f


def test_gen_key_distinguishes_a_seeded_render():
    """A seed is part of what determines the output, so it must be in the cache key."""
    unseeded = sequencer._gen_key("p", None, 4, "720p", "9:16", 0, seed=None)
    seeded = sequencer._gen_key("p", None, 4, "720p", "9:16", 0, seed="/x/seed.png")
    assert unseeded != seeded


def test_a_hero_shot_is_i2v_seeded_from_a_person_free_product_still(
        tmp_path, brand_kit, fake_render, monkeypatch, product_cutout):
    """The product-in-video fix: a hero-product shot is i2v-seeded from a product-ONLY still,
    so the product actually appears in the render and no person reaches a reference (no ref2v
    content-filter rejection). The still is FLUX-regenerated with the person hard-excluded in
    prompt AND negative, so an apparel model in the source photo is not carried into the ad."""
    from ai_layer.creative import image_providers
    from ai_layer.creative.schemas import QACheck
    seeded = []
    monkeypatch.setattr(image_providers, "generate_with_fallback", _fake_product_shot(seeded))
    monkeypatch.setattr(vv, "verify_shot", lambda *a, **k: [QACheck(name="ok", passed=True)])

    sequencer.render_storyboard(_hero_board(), kit=brand_kit, run_dir=tmp_path,
                                cutout_path=product_cutout, product_desc="a linen tote bag",
                                log=lambda *_: None)

    assert len(seeded) == 1, "one product seed for the one hero shot"
    assert seeded[0]["primary"] == "flux" and seeded[0]["refs"] == [product_cutout]
    assert "a linen tote bag" in seeded[0]["scene"]          # anchored to the real item
    assert "ON ITS OWN" in seeded[0]["scene"]                # product-only by construction
    assert "person" in seeded[0]["negative"] and "model" in seeded[0]["negative"]
    assert any(c["image"] for c in fake_render.calls), "hero shot must be i2v-seeded"
    assert not any(c["refs"] for c in fake_render.calls), "no person-frame ref2v"
    assert (tmp_path / "product_seeds").exists()


def test_a_shot_that_does_not_feature_the_product_is_not_seeded(
        tmp_path, brand_kit, fake_render, monkeypatch, product_cutout):
    from ai_layer.creative import image_providers
    called = []
    monkeypatch.setattr(image_providers, "generate_with_fallback",
                        lambda *a, **k: called.append(1))
    sequencer.render_storyboard(_board(("hook", 2.0), ("cta", 2.0)), kit=brand_kit,
                                run_dir=tmp_path, cutout_path=product_cutout,
                                log=lambda *_: None)
    assert called == [], "no product seed for absent/background-product shots"
    assert all(c["image"] is None for c in fake_render.calls)


def test_the_product_seed_is_cached_across_reruns(
        tmp_path, brand_kit, fake_render, monkeypatch, product_cutout):
    from ai_layer.creative import image_providers
    from ai_layer.creative.schemas import QACheck
    seeded = []
    monkeypatch.setattr(image_providers, "generate_with_fallback", _fake_product_shot(seeded))
    monkeypatch.setattr(vv, "verify_shot", lambda *a, **k: [QACheck(name="ok", passed=True)])
    board = _hero_board()
    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path,
                                cutout_path=product_cutout, log=lambda *_: None)
    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path,
                                cutout_path=product_cutout, log=lambda *_: None)
    assert len(seeded) == 1, "the product seed must be reused on a re-run, not re-paid"


def test_intermediates_go_to_scratch_paid_renders_are_kept(tmp_path, brand_kit, fake_render):
    """Phase 9.4: only the paid raws (renders/) and the timeline stay; the $0 per-shot
    cuts/edits live in .work."""
    board = _board(("hook", 2.0), ("cta", 2.0))
    timeline, _out, _rlog = sequencer.render_storyboard(
        board, kit=brand_kit, run_dir=tmp_path, log=lambda *_: None)
    assert list((tmp_path / "renders").glob("gen_*.mp4"))          # paid, kept
    assert not list(tmp_path.glob("shot_*_cut.mp4"))               # not in the run root
    assert not list(tmp_path.glob("shot_*_a*.mp4"))
    assert list((tmp_path / ".work").glob("shot_*"))               # scratch holds them
    assert Path(timeline).name == "timeline.mp4"


def test_the_cuts_land_where_the_storyboard_put_them(tmp_path, brand_kit, fake_render):
    board = _board(("hook", 2.0), ("demo", 3.0), ("cta", 2.0))
    timeline, out, _rlog = sequencer.render_storyboard(board, kit=brand_kit,
                                                       run_dir=tmp_path,
                                                       log=lambda *_: None)
    assert vv.check_cut_alignment(timeline, out).passed


def test_a_frozen_shot_is_caught_and_repaired(tmp_path, brand_kit, monkeypatch):
    """A renderer that returns its still seed. The ladder retries; the second render moves."""
    calls = {"n": 0}
    fake = _FakeSeedance()

    def flaky(prompt, out_path, **kw):
        if "demo_1" in prompt and calls["n"] == 0:
            calls["n"] += 1
            fake.frozen_for = {"demo_1"}
        else:
            fake.frozen_for = set()
        return fake(prompt, out_path, **kw)

    monkeypatch.setattr(video_providers, "generate_with_fallback", flaky)
    board = _board(("hook", 2.0), ("demo", 3.0), ("cta", 2.0))
    timeline, out, rlog = sequencer.render_storyboard(board, kit=brand_kit,
                                                      run_dir=tmp_path,
                                                      log=lambda *_: None)
    assert rlog.renders == 4
    assert [s.action for s in rlog.steps] == ["retry"]
    assert rlog.steps[0].resolved and rlog.clean
    assert vv.verify(timeline, out, log=lambda *_: None).approved


# --- continuity: the ref2v branch that had never been called --------------------------

def test_sequential_mode_conditions_each_shot_on_the_previous_frame(tmp_path, brand_kit,
                                                                    fake_render):
    """video_providers._seedance has dispatched to reference-to-video since day one and
    nothing has ever reached that branch."""
    board = _board(("hook", 2.0), ("demo", 3.0), ("cta", 2.0), mode="sequential")
    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path,
                                log=lambda *_: None)
    refs = [c["refs"] for c in fake_render.calls]
    assert refs[0] is None                                  # nothing precedes the hook
    assert refs[1] and refs[1][0].endswith("shot_00_last.png")
    assert refs[2] and refs[2][0].endswith("shot_01_last.png")


def test_independent_mode_passes_no_references(tmp_path, brand_kit, fake_render):
    board = _board(("hook", 2.0), ("demo", 3.0), mode="independent")
    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path,
                                log=lambda *_: None)
    assert all(c["refs"] is None for c in fake_render.calls)


def test_the_product_cutout_rides_along_as_a_second_reference(tmp_path, brand_kit,
                                                              fake_render, product_cutout):
    board = _board(("hook", 2.0), ("demo", 3.0), mode="sequential")
    sequencer.render_storyboard(board, kit=brand_kit, run_dir=tmp_path,
                                cutout_path=product_cutout, log=lambda *_: None)
    assert len(fake_render.calls[1]["refs"]) == 2


def test_last_frame_is_the_final_frame(tmp_path):
    frames = [np.full((192, 192, 3), i * 10, np.uint8) for i in range(1, 6)]
    clip = _write(tmp_path / "c.mp4", frames)
    png = editor.last_frame(clip, tmp_path / "last.png")
    from PIL import Image
    arr = np.asarray(Image.open(png))
    assert abs(int(arr.mean()) - 50) < 12      # the 5th frame, not the 1st


# --- concat -----------------------------------------------------------------------

def test_concat_drops_audio_on_purpose(tmp_path, fake_render):
    """One voiceover runs across the whole timeline. Splicing per-shot native audio at
    every cut produces exactly the seams the cuts were meant to hide."""
    from ai_layer.creative.schemas import SfxCue
    a = _write(tmp_path / "a.mp4", [_smooth(1)] * 10)
    voiced = tmp_path / "voiced.mp4"
    editor.add_sfx(a, voiced, [SfxCue(at_s=0.1, kind="click")], log=lambda *_: None)
    out = editor.concat([voiced, voiced], tmp_path / "joined.mp4", log=lambda *_: None)
    assert editor.probe(out)["has_audio"] is False


def test_concat_refuses_mismatched_geometry(tmp_path):
    a = _write(tmp_path / "a.mp4", [_smooth(1)] * 10)
    b = _write(tmp_path / "b.mp4", [np.zeros((96, 96, 3), np.uint8)] * 10, size=(96, 96))
    with pytest.raises(editor.EditError, match="will not resample"):
        editor.concat([a, b], tmp_path / "x.mp4", log=lambda *_: None)


def test_concat_refuses_an_empty_list(tmp_path):
    with pytest.raises(ValueError):
        editor.concat([], tmp_path / "x.mp4", log=lambda *_: None)


def test_concat_length_is_the_sum_of_its_parts(tmp_path):
    a = _write(tmp_path / "a.mp4", [_smooth(1)] * 20)      # 2.0s
    b = _write(tmp_path / "b.mp4", [_smooth(2)] * 30)      # 3.0s
    out = editor.concat([a, b], tmp_path / "j.mp4", log=lambda *_: None)
    assert editor.probe(out)["duration"] == pytest.approx(5.0, abs=0.25)


# --- trim --------------------------------------------------------------------------

def test_trim_cuts_to_the_requested_length(tmp_path):
    clip = _write(tmp_path / "c.mp4", [_smooth(1)] * 40)   # 4.0s
    out = editor.trim(clip, tmp_path / "t.mp4", duration=2.4, log=lambda *_: None)
    assert editor.probe(out)["duration"] == pytest.approx(2.4, abs=0.2)


def test_trim_refuses_to_cut_past_the_end(tmp_path):
    clip = _write(tmp_path / "c.mp4", [_smooth(1)] * 20)   # 2.0s
    with pytest.raises(editor.EditError, match="cannot trim"):
        editor.trim(clip, tmp_path / "t.mp4", duration=5.0, log=lambda *_: None)


# --- single pass (UGC-D1, v2b) --------------------------------------------------------

def test_single_pass_refuses_a_board_longer_than_the_renderer(tmp_path, brand_kit):
    board = _board(("hook", 8.0), ("demo", 8.0), ("cta", 6.0))     # 22s
    with pytest.raises(sequencer.SequenceError, match="caps at"):
        sequencer.render_single_pass(board, kit=brand_kit, run_dir=tmp_path,
                                     log=lambda *_: None)


def test_single_pass_renders_the_whole_board_as_one_clip(tmp_path, brand_kit, fake_render):
    board = _board(("hook", 2.0), ("demo", 3.0), ("cta", 2.0))     # 7s, fits under 15
    out = sequencer.render_single_pass(board, kit=brand_kit, run_dir=tmp_path,
                                       log=lambda *_: None)
    assert len(fake_render.calls) == 1
    assert fake_render.calls[0]["duration"] == 8            # snapped up from 7
    assert editor.probe(out)["duration"] == pytest.approx(7.0, abs=0.25)
    assert all(s.subject in fake_render.calls[0]["prompt"] for s in board.shots)
