"""Downscaled thumbnails for the results grid.

The grid was loading full 1-2 MB renders into every card; a ~512px JPEG is an order of
magnitude smaller and full-res is fetched only on open/download. Pure PIL + the bundled
ffmpeg (both already deps) — no fal call, $0. Callers treat these as best-effort: a thumb
that fails to build just leaves the grid to fall back to full-res.
"""
from __future__ import annotations

from pathlib import Path

_QUALITY = 82


def image_thumb(src: Path, dst: Path, max_px: int = 512) -> None:
    """Downscale `src` to fit within max_px on its long edge, save as JPEG at `dst`."""
    from PIL import Image

    with Image.open(src) as im:
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        im.thumbnail((max_px, max_px))
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "JPEG", quality=_QUALITY)


def video_poster(src: Path, dst: Path, max_px: int = 512) -> None:
    """Grab the first frame of `src` and save it as a downscaled JPEG poster at `dst`."""
    import imageio_ffmpeg
    from PIL import Image

    reader = imageio_ffmpeg.read_frames(str(src), pix_fmt="rgb24")
    try:
        meta = next(reader)
        w, h = meta["size"]
        frame = next(reader)                       # first frame's raw bytes
        im = Image.frombytes("RGB", (w, h), frame)
        im.thumbnail((max_px, max_px))
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "JPEG", quality=_QUALITY)
    finally:
        reader.close()                             # tears down the ffmpeg subprocess


if __name__ == "__main__":
    import tempfile
    from PIL import Image

    with tempfile.TemporaryDirectory() as d:
        big = Path(d) / "big.png"
        Image.new("RGBA", (2000, 1600), (120, 40, 200, 255)).save(big)
        out = Path(d) / "thumbs" / "big.jpg"
        image_thumb(big, out, max_px=512)
        with Image.open(out) as t:
            assert max(t.size) == 512, t.size       # long edge downscaled
            assert t.format == "JPEG"
        assert out.stat().st_size < big.stat().st_size  # smaller on disk
    print("thumbs self-check ok")
