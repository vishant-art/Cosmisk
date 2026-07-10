"""The Editor: real ffmpeg, real frames, zero spend.

These tests run the bundled ffmpeg binary against the synthesized fixture clip from
conftest. That is the point: caption burn-in is a deterministic post-process, so it can
be asserted end to end without a network, an API key, or a single generated frame. This
is what "the compositor, on the time axis" buys you.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import captions  # noqa: E402
import editor  # noqa: E402
from schemas import CaptionCue, CaptionWord  # noqa: E402


def _cues(spans):
    words = [CaptionWord(text=t, start=s, end=e) for t, s, e in spans]
    return captions.plan_cues(words)


def test_probe_reads_the_clips_real_geometry(synth_video):
    meta = editor.probe(synth_video)
    assert meta["width"] == 64 and meta["height"] == 64
    assert meta["fps"] == pytest.approx(10.0, abs=0.5)
    assert meta["duration"] == pytest.approx(3.0, abs=0.3)


def test_burn_captions_produces_a_playable_clip_of_the_same_length(synth_video, tmp_path):
    out = tmp_path / "captioned.mp4"
    editor.burn_captions(synth_video, out, _cues([("hello", 0.2, 0.8),
                                                  ("world", 0.9, 1.5)]),
                         fps=10, log=lambda *_: None)
    assert out.exists() and out.stat().st_size > 0

    before, after = editor.probe(synth_video), editor.probe(out)
    assert after["width"] == before["width"] and after["height"] == before["height"]
    assert after["duration"] == pytest.approx(before["duration"], abs=0.25)


def test_captions_survive_past_the_end_of_speech(synth_video, tmp_path):
    """The caption sequence is shorter than the clip whenever speech ends first. Without
    eof_action=repeat, ffmpeg truncates the VIDEO to the length of the overlay, which
    silently ships a 1.5-second ad."""
    out = tmp_path / "short_speech.mp4"
    editor.burn_captions(synth_video, out, _cues([("brief", 0.1, 0.4)]),
                         fps=10, log=lambda *_: None)
    assert editor.probe(out)["duration"] == pytest.approx(3.0, abs=0.3)


def test_burned_clip_actually_differs_from_the_source(synth_video, tmp_path):
    """A no-op overlay would pass every other test in this file."""
    import imageio_ffmpeg

    def _first_frame(path):
        gen = imageio_ffmpeg.read_frames(str(path))
        next(gen)
        frame = next(iter(gen))
        gen.close()
        return frame

    out = tmp_path / "diff.mp4"
    # a cue that is on screen at t=0 so the very first frame carries caption pixels
    editor.burn_captions(synth_video, out, _cues([("BIG", 0.0, 1.0)]),
                         fps=10, log=lambda *_: None)
    assert _first_frame(synth_video) != _first_frame(out)


def test_frames_are_cleaned_up_by_default(synth_video, tmp_path):
    out = tmp_path / "clean.mp4"
    editor.burn_captions(synth_video, out, _cues([("x", 0.1, 0.5)]), fps=10,
                         log=lambda *_: None)
    assert not (tmp_path / "clean_capframes").exists()


def test_frames_are_kept_when_asked(synth_video, tmp_path):
    out = tmp_path / "keep.mp4"
    editor.burn_captions(synth_video, out, _cues([("x", 0.1, 0.5)]), fps=10,
                         keep_frames=True, log=lambda *_: None)
    assert list((tmp_path / "keep_capframes").glob("cap_*.png"))


def test_burn_refuses_an_empty_cue_list(synth_video, tmp_path):
    with pytest.raises(ValueError):
        editor.burn_captions(synth_video, tmp_path / "n.mp4", [], log=lambda *_: None)


def test_ffmpeg_failure_surfaces_its_stderr(tmp_path):
    missing = tmp_path / "does_not_exist.mp4"
    with pytest.raises(Exception):
        editor.burn_captions(missing, tmp_path / "o.mp4",
                             _cues([("x", 0.0, 0.4)]), log=lambda *_: None)


# --- caption_clip: ASR seam, drift gate, ledger ---------------------------------

SCRIPT = "I genuinely did not expect this"


def _fake_transcribe(script=SCRIPT, cost=0.0001):
    def _t(audio_path, **kw):
        words = [{"text": w, "start": i * 0.3, "end": i * 0.3 + 0.25}
                 for i, w in enumerate(script.split())]
        return words, cost
    return _t


class _Led:
    def __init__(self):
        self.rows = []

    def record(self, op, provider, model, cost, **meta):
        self.rows.append((op, provider, model, cost))


def test_caption_clip_transcribes_burns_and_bills(synth_video, tmp_path, brand_kit):
    led = _Led()
    out, drift = editor.caption_clip(synth_video, tmp_path / "c.mp4", SCRIPT,
                                     tmp_path / "vo.mp3", kit=brand_kit, led=led,
                                     transcribe=_fake_transcribe(), log=lambda *_: None)
    assert Path(out).exists()
    assert drift == 0.0
    assert led.rows == [("asr", "fal", "fal-ai/whisper", 0.0001)]


def test_caption_clip_refuses_to_burn_a_mismatched_voiceover(synth_video, tmp_path):
    """We are transcribing audio we synthesized from a script we wrote. This much drift
    means the wrong file, the wrong language, or a broken TTS. Fail closed."""
    with pytest.raises(captions.CaptionDriftError):
        editor.caption_clip(synth_video, tmp_path / "c.mp4", SCRIPT, tmp_path / "vo.mp3",
                            transcribe=_fake_transcribe("totally unrelated audio here"),
                            log=lambda *_: None)
    assert not (tmp_path / "c.mp4").exists(), "nothing is written when the gate fires"
