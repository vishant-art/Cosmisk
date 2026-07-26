"""The deterministic editor (T7.5): filtergraph construction, then real ffmpeg.

Two halves, deliberately separated.

`build_video_filters` / `build_audio_filters` / `encode_args` are PURE. They take a plan
and a geometry dict and return strings. Every branch is testable without a video file,
which is why they are functions and not buried inside a subprocess call.

The rest runs the bundled ffmpeg against synthesized clips. Zero spend, zero network,
and every effect is asserted on the output rather than on the command line, because a
filtergraph that looks right and one that runs are different things.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import editor  # noqa: E402
import sfx  # noqa: E402
from schemas import EditPlan, SfxCue, Shot, Storyboard, UGCStyle  # noqa: E402

META = {"width": 96, "height": 96, "fps": 10.0, "duration": 3.0, "has_audio": False}


def _vf(plan, meta=None):
    return editor.build_video_filters(plan, meta or META)


# --- pure: the video chain -------------------------------------------------------

def test_an_empty_plan_produces_no_filters():
    assert _vf(EditPlan()) == []
    assert EditPlan().is_noop


def test_punch_crops_then_rescales_to_the_original_size():
    out = _vf(EditPlan(punch_to=1.2))
    assert len(out) == 2
    assert out[0].startswith("crop=")
    assert out[1] == "scale=96:96"


def test_punch_escapes_the_comma_inside_min():
    """An unescaped comma inside min() is read by ffmpeg as a filter separator, and the
    graph either fails to parse or silently becomes a different graph."""
    out = _vf(EditPlan(punch_to=1.2))[0]
    assert "\\," in out
    assert "min(t/3\\,1)" in out


def test_punch_dimensions_are_forced_even_for_yuv420p():
    assert "trunc(iw/" in _vf(EditPlan(punch_to=1.3))[0]
    assert "/2)*2" in _vf(EditPlan(punch_to=1.3))[0]


def test_a_static_shot_gets_no_crop():
    assert _vf(EditPlan(punch_to=1.0)) == []


def test_speed_rewrites_pts_and_the_punch_uses_the_new_clock():
    """setpts halves the timeline, so a punch that spanned 3s must now span 1.5s. If the
    punch kept the old duration it would only complete halfway through the clip."""
    out = _vf(EditPlan(speed=2.0, punch_to=1.2))
    assert out[0] == "setpts=PTS/2"
    assert "min(t/1.5\\,1)" in out[1]


def test_style_post_fields_all_reach_the_chain():
    style = UGCStyle(micro_shake=2, grain=0.5, exposure_clip=0.05)
    out = ",".join(_vf(EditPlan(style=style)))
    assert "crop=w=iw-4:h=ih-4" in out
    assert "sin(2*PI*t*1.7)" in out          # deterministic drift, not random
    assert "noise=alls=20:allf=t" in out
    assert "curves=all=" in out


def test_style_prompt_fields_never_reach_the_chain():
    """camera/lighting/framing are wishes handed to the image model. They are not
    ffmpeg filters and must not silently become no-ops here."""
    out = ",".join(_vf(EditPlan(style=UGCStyle(camera="selfie", lighting="window",
                                               framing="imperfect"))))
    assert out == ""


def test_filter_order_is_speed_punch_shake_grain_curves():
    plan = EditPlan(speed=1.5, punch_to=1.2,
                    style=UGCStyle(micro_shake=2, grain=0.4, exposure_clip=0.05))
    out = _vf(plan)
    kinds = [f.split("=")[0] for f in out]
    assert kinds == ["setpts", "crop", "scale", "crop", "scale", "noise", "curves"]


def test_zero_valued_style_fields_add_nothing():
    assert _vf(EditPlan(style=UGCStyle())) == []


def test_punch_is_skipped_when_the_duration_is_unknown():
    """A zero duration would put a division by zero in the crop expression."""
    assert _vf(EditPlan(punch_to=1.3), {**META, "duration": 0.0}) == []


# --- pure: the audio chain and encoder --------------------------------------------

def test_unit_speed_needs_no_audio_filter():
    assert editor.build_audio_filters(EditPlan()) == []


def test_atempo_is_chained_past_its_two_times_limit():
    """ffmpeg clamps atempo to [0.5, 2.0] per instance. A single atempo=3 does not
    error, it just does not do what you asked."""
    assert editor.build_audio_filters(EditPlan(speed=3.0)) == ["atempo=2.0", "atempo=1.5"]
    assert editor.build_audio_filters(EditPlan(speed=4.0)) == ["atempo=2.0", "atempo=2"]


def test_slow_motion_chains_the_other_way():
    assert editor.build_audio_filters(EditPlan(speed=0.4)) == ["atempo=0.5", "atempo=0.8"]


def test_recompress_is_an_encoder_setting_not_a_filter():
    """Social-upload artifacting IS the encoder throwing bits away. Painting a simulation
    of compression with a filter would be a picture of an artifact, not an artifact."""
    plan = EditPlan(style=UGCStyle(recompress=True))
    assert _vf(plan) == []
    assert "34" in editor.encode_args(plan)
    assert "34" not in editor.encode_args(EditPlan())


# --- the storyboard tells the editor where to punch --------------------------------

def _shot(purpose, product="absent"):
    return Shot(purpose=purpose, duration_s=3.0, camera="selfie", subject="s",
                product_visible=product)


def test_the_hook_gets_the_hardest_punch():
    hook = editor.plan_for_shot(_shot("hook")).punch_to
    proof = editor.plan_for_shot(_shot("proof")).punch_to
    assert hook > proof == 1.0


def test_a_hero_product_shot_pushes_a_little_harder():
    plain = editor.plan_for_shot(_shot("demo")).punch_to
    hero = editor.plan_for_shot(_shot("demo", product="hero")).punch_to
    assert hero == pytest.approx(plain + 0.04)


def test_shot_plan_carries_the_style_through():
    style = UGCStyle(grain=0.3)
    assert editor.plan_for_shot(_shot("hook"), style).style.grain == 0.3


def test_sfx_cues_land_exactly_on_the_cuts():
    """We placed the cuts, so nothing has to detect where they are. That is the whole
    dividend of a deterministic editor (cf. T9)."""
    board = Storyboard(shots=[_shot("hook"), _shot("demo"), _shot("cta")],
                       target_seconds=9.0)
    cues = editor.sfx_cues_for(board)
    assert [c.at_s for c in cues] == [0.0, 3.0, 6.0]
    assert cues[0].kind == "punch"
    assert all(c.kind == "whoosh" for c in cues[1:])


def test_no_whoosh_after_the_final_shot():
    board = Storyboard(shots=[_shot("hook")], target_seconds=3.0)
    assert len(editor.sfx_cues_for(board)) == 1


# --- sfx: synthesized, not licensed -------------------------------------------------

def test_every_sfx_kind_synthesizes(tmp_path):
    for kind in sfx.KINDS:
        p = sfx.synthesize(kind, tmp_path / f"{kind}.wav")
        assert Path(p).stat().st_size > 100


def test_sfx_synthesis_is_deterministic(tmp_path):
    """Same kind, same bytes. A licensed pack could not promise that either."""
    a = Path(sfx.synthesize("punch", tmp_path / "a.wav")).read_bytes()
    b = Path(sfx.synthesize("punch", tmp_path / "b.wav")).read_bytes()
    assert a == b


def test_an_unknown_sfx_is_an_error_not_a_silent_no_sound(tmp_path):
    with pytest.raises(ValueError, match="unknown sfx"):
        sfx.synthesize("airhorn", tmp_path / "x.wav")


def test_ensure_materializes_each_kind_once(tmp_path):
    out = sfx.ensure(["punch", "punch", "click"], tmp_path)
    assert set(out) == {"punch", "click"}
    assert len(list(tmp_path.glob("*.wav"))) == 2


# --- real ffmpeg ---------------------------------------------------------------------

def test_apply_plan_runs_the_whole_chain(synth_video, tmp_path):
    out = tmp_path / "edited.mp4"
    plan = EditPlan(punch_to=1.2, speed=1.0,
                    style=UGCStyle(micro_shake=2, grain=0.3, exposure_clip=0.04))
    editor.apply_plan(synth_video, out, plan, log=lambda *_: None)

    before, after = editor.probe(synth_video), editor.probe(out)
    assert after["width"] == before["width"] and after["height"] == before["height"]
    assert after["duration"] == pytest.approx(before["duration"], abs=0.3)


def test_a_noop_plan_stream_copies_instead_of_re_encoding(synth_video, tmp_path):
    """A static shot (no filters, no recompress) must be COPIED, not re-encoded -- no
    quality generation lost. Frame-identical output proves the stream copy fired."""
    import imageio_ffmpeg

    def frames(p):
        gen = imageio_ffmpeg.read_frames(str(p))
        next(gen)
        out = list(gen)
        gen.close()
        return out

    out = tmp_path / "noop.mp4"
    editor.apply_plan(synth_video, out, EditPlan(), log=lambda *_: None)
    assert frames(out) == frames(synth_video)     # bit-identical frames == stream copy


def test_a_recompress_plan_still_re_encodes_despite_no_filters(noisy_video, tmp_path):
    """recompress produces no vf/af but must NOT take the copy fast-path -- its whole job
    is throwing bits away."""
    plain = tmp_path / "p.mp4"
    small = tmp_path / "s.mp4"
    editor.apply_plan(noisy_video, plain, EditPlan(), log=lambda *_: None)         # copy
    editor.apply_plan(noisy_video, small, EditPlan(style=UGCStyle(recompress=True)),
                      log=lambda *_: None)                                          # re-encode
    assert small.stat().st_size < plain.stat().st_size


def test_apply_plan_actually_changes_the_pixels(synth_video, tmp_path):
    """A no-op filtergraph would pass every geometry assertion above."""
    import imageio_ffmpeg

    def first_frame(p):
        gen = imageio_ffmpeg.read_frames(str(p))
        next(gen)
        f = next(iter(gen))
        gen.close()
        return f

    out = tmp_path / "punched.mp4"
    editor.apply_plan(synth_video, out, EditPlan(style=UGCStyle(grain=0.6)),
                      log=lambda *_: None)
    assert first_frame(synth_video) != first_frame(out)


def test_speed_halves_the_duration(synth_video, tmp_path):
    out = tmp_path / "fast.mp4"
    editor.apply_plan(synth_video, out, EditPlan(speed=2.0), log=lambda *_: None)
    assert editor.probe(out)["duration"] == pytest.approx(1.5, abs=0.3)


def test_recompress_throws_bits_away(noisy_video, tmp_path):
    """Asserted on the artifact, not the command line. A solid-colour clip compresses to
    nothing either way, so this needs real texture to measure."""
    plain = tmp_path / "plain.mp4"
    small = tmp_path / "small.mp4"
    editor.apply_plan(noisy_video, plain, EditPlan(), log=lambda *_: None)
    editor.apply_plan(noisy_video, small, EditPlan(style=UGCStyle(recompress=True)),
                      log=lambda *_: None)
    assert small.stat().st_size < plain.stat().st_size


def test_add_sfx_gives_a_silent_clip_an_audio_track(synth_video, tmp_path):
    """Without a silent bed, amix has nothing to mix against and drops the effects with
    no error at all."""
    assert editor.probe(synth_video)["has_audio"] is False
    out = tmp_path / "sfx.mp4"
    editor.add_sfx(synth_video, out, [SfxCue(at_s=0.0, kind="punch"),
                                      SfxCue(at_s=1.0, kind="whoosh")],
                   log=lambda *_: None)
    assert editor.probe(out)["has_audio"] is True


def test_apply_plan_mixes_sfx_in_one_call(synth_video, tmp_path):
    out = tmp_path / "full.mp4"
    editor.apply_plan(synth_video, out, EditPlan(punch_to=1.1,
                                                 sfx=[SfxCue(at_s=0.2, kind="click")]),
                      log=lambda *_: None)
    assert editor.probe(out)["has_audio"] is True


def test_add_sfx_refuses_an_empty_cue_list(synth_video, tmp_path):
    with pytest.raises(ValueError):
        editor.add_sfx(synth_video, tmp_path / "x.mp4", [], log=lambda *_: None)


def _frame_count(path):
    import imageio_ffmpeg
    gen = imageio_ffmpeg.read_frames(str(path))
    next(gen)
    n = sum(1 for _ in gen)
    gen.close()
    return n


@pytest.mark.parametrize("at_s,hold_s", [(1.0, 1.0), (0.5, 0.5), (2.0, 0.9), (0.0, 1.0)])
def test_freeze_frame_adds_exactly_the_held_frames(synth_video, tmp_path, at_s, hold_s):
    """out_frames == in_frames + hold_frames, exactly, at every freeze point.

    The first implementation used time-indexed trims and produced a clip with NO freeze
    in it while ffmpeg exited 0 and printed nothing. `trim=1.0:1.1` on a 10fps clip
    selects zero frames. A duration assertion with a 0.35s tolerance would have let that
    through, so this counts frames.
    """
    out = tmp_path / f"frozen_{at_s}_{hold_s}.mp4"
    editor.freeze_frame(synth_video, out, at_s=at_s, hold_s=hold_s, log=lambda *_: None)
    expected = _frame_count(synth_video) + int(round(hold_s * 10))
    assert _frame_count(out) == expected


def test_a_sub_two_frame_hold_is_not_a_freeze(synth_video, tmp_path):
    with pytest.raises(editor.EditError, match="not a freeze"):
        editor.freeze_frame(synth_video, tmp_path / "f.mp4", at_s=1.0, hold_s=0.05,
                            log=lambda *_: None)


def test_freeze_frame_refuses_to_silently_desync_audio(synth_video, tmp_path):
    """Extending the video without stretching the audio desyncs everything downstream.
    Shipping that silently is worse than refusing."""
    with_audio = tmp_path / "voiced.mp4"
    editor.add_sfx(synth_video, with_audio, [SfxCue(at_s=0.1, kind="click")],
                   log=lambda *_: None)
    with pytest.raises(editor.EditError, match="desync"):
        editor.freeze_frame(with_audio, tmp_path / "f.mp4", at_s=1.0, hold_s=0.5,
                            log=lambda *_: None)


def test_freeze_outside_the_clip_is_an_error(synth_video, tmp_path):
    with pytest.raises(editor.EditError, match="outside the clip"):
        editor.freeze_frame(synth_video, tmp_path / "f.mp4", at_s=99.0, hold_s=0.5,
                            log=lambda *_: None)


def test_crossfade_joins_two_clips(synth_video, other_video, tmp_path):
    out = tmp_path / "joined.mp4"
    editor.crossfade(synth_video, other_video, out, duration=0.4, log=lambda *_: None)
    # 3s + 3s overlapped by 0.4s
    assert editor.probe(out)["duration"] == pytest.approx(5.6, abs=0.35)


def test_crossfade_rejects_an_unknown_transition(synth_video, other_video, tmp_path):
    with pytest.raises(ValueError, match="unknown transition"):
        editor.crossfade(synth_video, other_video, tmp_path / "x.mp4",
                         transition="star_wipe", log=lambda *_: None)


def test_crossfade_refuses_mismatched_geometry(synth_video, tmp_path):
    """xfade will not resample for you; it fails or produces garbage."""
    import imageio_ffmpeg
    import numpy as np
    odd = tmp_path / "odd.mp4"
    w = imageio_ffmpeg.write_frames(str(odd), (32, 32), fps=10, macro_block_size=1)
    w.send(None)
    for _ in range(20):
        w.send(np.zeros((32, 32, 3), np.uint8).tobytes())
    w.close()

    with pytest.raises(editor.EditError, match="differ in size"):
        editor.crossfade(synth_video, odd, tmp_path / "x.mp4", log=lambda *_: None)


def test_crossfade_refuses_a_transition_longer_than_a_clip(synth_video, other_video,
                                                           tmp_path):
    with pytest.raises(editor.EditError, match="longer than a clip"):
        editor.crossfade(synth_video, other_video, tmp_path / "x.mp4", duration=9.0,
                         log=lambda *_: None)


# --- absorbed from video_post -------------------------------------------------------

def test_copy_overlay_burns_at_the_clips_real_size(synth_video, tmp_path, copyset,
                                                   brand_kit):
    from PIL import Image
    out = tmp_path / "overlaid.mp4"
    editor.add_copy_overlay(synth_video, out, copyset, brand_kit, fmt="9:16")
    assert out.exists()
    overlay = out.with_name(out.stem + "_overlay.png")
    assert Image.open(overlay).size == (64, 64)     # the clip's size, not the format's
