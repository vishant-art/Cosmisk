"""Post-process a generated video clip: burn a copy/logo lower-third onto it.

Uses the ffmpeg binary BUNDLED by imageio-ffmpeg (a pip wheel, no system ffmpeg
needed -- works in a bare venv / Docker). The clip keeps its motion (and any native
Seedance audio); the text is overlaid as a transparent PNG sized to the real video
resolution, so it lines up regardless of the model's output size.

imageio_ffmpeg / subprocess are used lazily so the module imports without them and
the mock test suite runs offline.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import compositor  # noqa: E402
import layout as layout_mod  # noqa: E402


def _video_size(path) -> tuple[int, int]:
    import imageio_ffmpeg            # lazy
    gen = imageio_ffmpeg.read_frames(str(path))
    meta = next(gen)                 # first yield is metadata
    gen.close()
    return tuple(meta["size"])       # (width, height)


def add_copy_overlay(video_in, video_out, copy, kit, *, fmt: str = "9:16",
                     logo_path: str | None = None) -> str:
    """Overlay the ad copy (headline/subhead/CTA + optional logo) onto `video_in`,
    writing `video_out`. Returns the output path."""
    import subprocess               # lazy
    import imageio_ffmpeg           # lazy
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    w, h = _video_size(video_in)
    spec = layout_mod.plan_layout(copy, fmt, has_logo=bool(logo_path))
    overlay = Path(video_out).with_name(Path(video_out).stem + "_overlay.png")
    compositor.render_overlay(spec, copy, kit, overlay, width=w, height=h,
                              logo_path=logo_path)
    cmd = [ff, "-y", "-i", str(video_in), "-i", str(overlay),
           "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy", str(video_out)]
    subprocess.run(cmd, check=True, capture_output=True)
    return str(video_out)
