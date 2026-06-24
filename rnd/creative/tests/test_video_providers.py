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
    assert res["fell_back_from"] == "image-to-video"
    assert cap["endpoints"] == [config.VIDEO_I2V, config.VIDEO_T2V]
