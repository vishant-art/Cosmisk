"""Voice/picture sync (T7.5 finish + T9 gate) and the operator direction guide.

The bug this fixes, observed on the first live run: the voiceover was 12.17s over a 10s
video, so the mux truncated its tail -- the CTA. These tests assert the voiceover is made
to end WITH the video (never truncated), that a residual mismatch FAILS the gate, and that
the operator's free-text direction reaches both the script and the shot prompts.

Real ffmpeg (the imageio-ffmpeg wheel) generates the test audio; no fal, no network.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import config  # noqa: E402
import editor  # noqa: E402
import prompt_builder as pb  # noqa: E402
import story_brain  # noqa: E402
import verifier_video as vv  # noqa: E402
from schemas import BrandKit, Script, ScriptBeat, Shot, Storyboard  # noqa: E402


def _tone(path, seconds):
    """A real audio file of exactly `seconds`, via ffmpeg's sine generator."""
    import subprocess
    subprocess.run([editor._ffmpeg(), "-y", "-f", "lavfi", "-i",
                    f"sine=frequency=330:duration={seconds}", str(path)],
                   capture_output=True, check=True)
    return str(path)


def _silent_video(path, seconds, size=(64, 64), fps=8):
    import imageio_ffmpeg
    import numpy as np
    w = imageio_ffmpeg.write_frames(str(path), size, fps=fps, macro_block_size=1)
    w.send(None)
    rng = np.random.default_rng(1)
    for _ in range(int(seconds * fps)):
        w.send(rng.integers(0, 255, (size[1], size[0], 3), dtype=np.uint8).tobytes())
    w.close()
    return str(path)


# --- fit_audio: make the voiceover end WITH the picture ------------------------

def test_a_long_voiceover_is_sped_up_to_fit_not_truncated(tmp_path):
    vo = _tone(tmp_path / "vo.mp3", 12.0)
    res = editor.fit_audio(vo, vo, 10.0, log=lambda *_: None)
    assert res["action"] == "sped"
    assert res["tempo"] == pytest.approx(1.2, abs=0.02)     # 12/10
    assert editor.media_duration(vo) == pytest.approx(10.0, abs=0.2)   # ends with the video


def test_a_short_voiceover_is_padded_to_fit(tmp_path):
    vo = _tone(tmp_path / "vo.mp3", 6.0)
    res = editor.fit_audio(vo, vo, 10.0, log=lambda *_: None)
    assert res["action"] == "padded"
    assert editor.media_duration(vo) == pytest.approx(10.0, abs=0.2)


def test_fit_is_clamped_so_speech_stays_natural(tmp_path):
    """A voiceover far too long for the cut is NOT sped to a chipmunk -- it is clamped, left
    a little long, and handed to the QA gate to fail. Better a rejected ad than a distorted one."""
    vo = _tone(tmp_path / "vo.mp3", 20.0)
    res = editor.fit_audio(vo, vo, 10.0, log=lambda *_: None)
    assert res["tempo"] == pytest.approx(config.AUDIO_FIT_MAX_TEMPO)   # clamped, not 2.0
    assert editor.media_duration(vo) > 10.0 + config.QA_AV_SYNC_TOL_S  # still long on purpose


def test_an_unprobeable_stub_passes_through(tmp_path):
    (tmp_path / "vo.mp3").write_bytes(b"not really audio")
    res = editor.fit_audio(tmp_path / "vo.mp3", tmp_path / "out.mp3", 10.0, log=lambda *_: None)
    assert res["action"] == "skip"                          # a $0 test stub is unaffected
    assert (tmp_path / "out.mp3").exists()


# --- the guardrail -------------------------------------------------------------

def test_the_gate_fails_a_voiceover_longer_than_the_video(tmp_path):
    vid = _silent_video(tmp_path / "clip.mp4", 10.0)
    vo = _tone(tmp_path / "vo.mp3", 12.0)
    c = vv.check_audio_video_sync(vid, vo)
    assert c is not None and c.passed is False
    assert c.repairable is False                            # re-rendering can't shorten speech
    assert "tail" in c.detail and "CTA" in c.detail


def test_the_gate_passes_a_synced_pair(tmp_path):
    vid = _silent_video(tmp_path / "clip.mp4", 10.0)
    vo = _tone(tmp_path / "vo.mp3", 10.0)
    c = vv.check_audio_video_sync(vid, vo)
    assert c is not None and c.passed is True


def test_no_voiceover_is_not_a_failure(tmp_path):
    vid = _silent_video(tmp_path / "clip.mp4", 10.0)
    assert vv.check_audio_video_sync(vid, None) is None
    assert vv.check_audio_video_sync(vid, tmp_path / "missing.mp3") is None


# --- the operator direction guide ----------------------------------------------

def _kit():
    return BrandKit(brand_name="Aurelia", tagline="t", palette=[{"role": "accent", "hex": "#B08D57"}],
                    typography={}, tone="warm", voice_keywords=["x"], dos=[], donts=[],
                    visual_style="warm minimal", logo={"brief": "b"})


def test_direction_reaches_the_shot_prompt():
    shot = Shot(purpose="hook", duration_s=3, camera="selfie", subject="she talks", product_visible="absent")
    p = pb.build_shot_prompt(shot, _kit(), direction="cozy handheld, morning light, slow")
    assert "Art direction: cozy handheld, morning light, slow." in p


def test_no_direction_adds_nothing():
    shot = Shot(purpose="hook", duration_s=3, camera="selfie", subject="she talks", product_visible="absent")
    assert "Art direction" not in pb.build_shot_prompt(shot, _kit())


class _Capture:
    """A fake OpenRouter client that records the system+user prompts and returns canned JSON."""
    def __init__(self, payload):
        self.payload, self.system, self.user = payload, None, None
        class _C:
            def create(inner, *, model, messages, **kw):
                self.system, self.user = messages[0]["content"], messages[1]["content"]
                class R:
                    choices = [type("m", (), {"message": type("x", (), {"content": payload})})()]
                    def model_dump(self): return {"usage": {"cost": 0.0}}
                return R()
        self.chat = type("chat", (), {"completions": _C()})()


def test_direction_reaches_the_script_prompt():
    c = _Capture(json.dumps({"beats": [{"purpose": "hook", "text": "hi"}]}))
    story_brain.generate_script(c, _kit(), "ctx", seconds=10, direction="make it feel nostalgic")
    assert "OPERATOR DIRECTION" in c.user and "nostalgic" in c.user


# --- n_shots pins the shot count -----------------------------------------------

def test_n_shots_pins_the_storyboard_target_to_exactly_three():
    board = {"shots": [
        {"purpose": "hook", "duration_s": 3, "camera": "selfie", "subject": "a", "product_visible": "absent", "motion": "x", "dialogue": None},
        {"purpose": "demo", "duration_s": 4, "camera": "macro", "subject": "b", "product_visible": "hero", "motion": "y", "dialogue": None},
        {"purpose": "cta", "duration_s": 3, "camera": "selfie", "subject": "c", "product_visible": "background", "motion": "z", "dialogue": None}]}
    c = _Capture(json.dumps(board))
    script = Script(beats=[ScriptBeat(purpose="hook", text="a"), ScriptBeat(purpose="demo", text="b"),
                           ScriptBeat(purpose="cta", text="c")])
    sb, _ = story_brain.generate_storyboard(c, _kit(), script, seconds=10, n_shots=3, log=lambda *_: None)
    assert len(sb.shots) == 3
    assert "3-3 shots" in c.system          # n_lo == n_hi == 3 -> "Aim for 3-3 shots"
