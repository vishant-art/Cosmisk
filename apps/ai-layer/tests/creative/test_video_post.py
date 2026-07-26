"""Video copy-overlay: a transparent lower-third rendered + burned onto a clip via
the bundled ffmpeg (mocked here -- no real video / ffmpeg touched)."""
from __future__ import annotations

import sys
import types
from pathlib import Path

from PIL import Image

from ai_layer.creative import compositor
from ai_layer.creative import layout
from ai_layer.creative import video_post


def test_render_overlay_transparent_png_with_copy(copyset, brand_kit, tmp_path):
    spec = layout.plan_layout(copyset, "9:16", has_logo=False)
    out = tmp_path / "ov.png"
    compositor.render_overlay(spec, copyset, brand_kit, out, width=720, height=1280)
    img = Image.open(out)
    assert img.mode == "RGBA" and img.size == (720, 1280)
    alpha = img.getchannel("A")
    assert alpha.getpixel((360, 50)) == 0          # top region is transparent (no bg)
    assert alpha.getextrema()[1] == 255            # copy/scrim region is opaque somewhere


def test_add_copy_overlay_builds_ffmpeg_overlay_cmd(monkeypatch, tmp_path, copyset, brand_kit):
    # fake imageio_ffmpeg (bundled binary + frame metadata)
    iio = types.ModuleType("imageio_ffmpeg")
    iio.get_ffmpeg_exe = lambda: "FFMPEG_BIN"

    def read_frames(path):
        yield {"size": (720, 1280), "fps": 24}
    iio.read_frames = read_frames
    monkeypatch.setitem(sys.modules, "imageio_ffmpeg", iio)

    cap = {}
    sub = types.ModuleType("subprocess")
    sub.run = lambda cmd, **kw: cap.update(cmd=cmd) or types.SimpleNamespace(returncode=0)
    monkeypatch.setitem(sys.modules, "subprocess", sub)

    vin = tmp_path / "in.mp4"; vin.write_bytes(b"VID")
    vout = tmp_path / "out.mp4"
    res = video_post.add_copy_overlay(vin, vout, copyset, brand_kit, fmt="9:16")

    assert res == str(vout)
    assert cap["cmd"][0] == "FFMPEG_BIN"
    assert any("overlay=0:0" in part for part in cap["cmd"])    # the overlay filtergraph
    assert str(vin) in cap["cmd"] and str(vout) in cap["cmd"]
    # the overlay PNG was rendered at the real video size (720x1280)
    ov = vout.with_name(vout.stem + "_overlay.png")
    assert Image.open(ov).size == (720, 1280)
