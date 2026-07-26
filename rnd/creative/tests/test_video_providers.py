"""fal-only video (Seedance): mode by inputs, seed = text-free bg, t2v fallback.
fal_client / requests are lazily imported, so we inject fakes via sys.modules."""
from __future__ import annotations

import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import config  # noqa: E402
import video_providers as vp  # noqa: E402


def _install_fake_fal(monkeypatch, captured, *, fail_seeded=False):
    fal = types.ModuleType("fal_client")

    def subscribe(endpoint, arguments=None, with_logs=False):
        captured.setdefault("endpoints", []).append(endpoint)
        captured["args"] = arguments
        if fail_seeded and endpoint in (config.VIDEO_I2V, config.VIDEO_REF2V):
            raise RuntimeError("seeded mode down")
        return {"video": {"url": "https://fal.media/v.mp4"}}

    fal.subscribe = subscribe
    fal.upload_file = lambda p: f"https://fal.media/up/{Path(p).name}"
    monkeypatch.setitem(sys.modules, "fal_client", fal)

    req = types.ModuleType("requests")

    class _R:
        content = b"MP4"

    req.get = lambda url, timeout=None: _R()
    monkeypatch.setitem(sys.modules, "requests", req)


def test_text_to_video_when_no_seed(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    res = vp.generate_video("a hero shot", tmp_path / "v.mp4")
    assert cap["endpoints"][-1] == config.VIDEO_T2V
    assert "image_url" not in cap["args"]
    assert res["provider"] == "seedance"
    assert (tmp_path / "v.mp4").read_bytes() == b"MP4"


def test_image_to_video_seeds_from_background(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    bg = tmp_path / "concept_01_bg.png"
    bg.write_bytes(b"BG")
    vp.generate_video("push in", tmp_path / "v.mp4", image=bg)
    assert cap["endpoints"][-1] == config.VIDEO_I2V
    assert cap["args"]["image_url"].endswith(bg.name)


def test_reference_to_video_uses_image_urls(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    prod = tmp_path / "prod.png"
    prod.write_bytes(b"P")
    vp.generate_video("product spins", tmp_path / "v.mp4", refs=[prod])
    assert cap["endpoints"][-1] == config.VIDEO_REF2V
    assert cap["args"]["image_urls"] == [f"https://fal.media/up/{prod.name}"]


def test_fallback_drops_seed_to_text_to_video(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap, fail_seeded=True)
    bg = tmp_path / "bg.png"
    bg.write_bytes(b"BG")
    res = vp.generate_with_fallback("scene", tmp_path / "v.mp4", image=bg, log=lambda *_: None)
    assert cap["endpoints"][-1] == config.VIDEO_T2V      # ends at text-to-video
    assert config.VIDEO_I2V in cap["endpoints"]          # tried the seed first
    assert res["fell_back_from"].startswith("t2v")


def test_audio_violation_retries_without_audio(monkeypatch, tmp_path):
    # fal rejects the clip ONLY when generate_audio is true (the content-filter case)
    calls = []

    fal = types.ModuleType("fal_client")

    def subscribe(endpoint, arguments=None, with_logs=False):
        calls.append((endpoint, arguments["generate_audio"]))
        if arguments["generate_audio"]:
            raise RuntimeError("Output audio has sensitive content")
        return {"video": {"url": "https://fal.media/v.mp4"}}

    fal.subscribe = subscribe
    fal.upload_file = lambda p: f"u/{p}"
    monkeypatch.setitem(sys.modules, "fal_client", fal)
    req = types.ModuleType("requests")
    req.get = lambda url, timeout=None: types.SimpleNamespace(content=b"MP4")
    monkeypatch.setitem(sys.modules, "requests", req)

    bg = tmp_path / "bg.png"; bg.write_bytes(b"BG")
    res = vp.generate_with_fallback("scene", tmp_path / "v.mp4", image=bg, log=lambda *_: None)
    # kept the seed (i2v), just dropped audio -- never fell back to t2v
    assert calls == [(config.VIDEO_I2V, True), (config.VIDEO_I2V, False)]
    assert res["audio"] is False
    assert res["fell_back_from"] == "seeded/no-audio"


def test_native_audio_flag_and_default_duration(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    vp.generate_video("scene", tmp_path / "v.mp4")
    assert cap["args"]["generate_audio"] is True          # default on
    assert cap["args"]["duration"] == "10"                # default 10s
    vp.generate_video("scene", tmp_path / "v2.mp4", generate_audio=False)
    assert cap["args"]["generate_audio"] is False         # toggle off


def test_generate_voiceover_uses_fal_tts(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    # the fake subscribe returns {"video":...}; TTS needs {"audio":{"url":...}}
    fal = sys.modules["fal_client"]
    fal.subscribe = lambda endpoint, arguments=None, with_logs=False: (
        cap.update(endpoint=endpoint, args=arguments) or {"audio": {"url": "https://fal.media/v.mp3"}})
    res = vp.generate_voiceover("Shop the new collection now.", tmp_path / "vo.mp3")
    assert cap["endpoint"] == config.VIDEO_TTS_MODEL      # MiniMax, not ElevenLabs
    assert "elevenlabs" not in config.VIDEO_TTS_MODEL
    assert cap["args"]["voice_setting"]["voice_id"] == config.VIDEO_TTS_VOICE
    assert res["provider"] == "minimax-tts" and res["cost_usd"] > 0


def test_merge_audio_onto_video(monkeypatch, tmp_path):
    cap = {}
    _install_fake_fal(monkeypatch, cap)
    fal = sys.modules["fal_client"]
    fal.subscribe = lambda endpoint, arguments=None, with_logs=False: (
        cap.update(endpoint=endpoint, args=arguments) or {"video": {"url": "https://fal.media/m.mp4"}})
    vid = tmp_path / "v.mp4"; vid.write_bytes(b"V")
    aud = tmp_path / "a.mp3"; aud.write_bytes(b"A")
    res = vp.merge_audio_onto_video(vid, aud, tmp_path / "out.mp4", seconds=10)
    assert cap["endpoint"] == config.AUDIO_MERGE_MODEL
    assert "video_url" in cap["args"] and "audio_url" in cap["args"]
    assert res["provider"] == "fal-ffmpeg"
