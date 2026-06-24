"""Saliency: how 'busy' is the region where copy will sit? Drives the scrim
decision so text stays legible. Pillow-based (no cv2 required)."""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import saliency  # noqa: E402


def _checkerboard(size=200, cell=10):
    img = Image.new("RGB", (size, size), "white")
    for yy in range(0, size, cell):
        for xx in range(0, size, cell):
            if (xx // cell + yy // cell) % 2 == 0:
                for j in range(yy, min(yy + cell, size)):
                    for i in range(xx, min(xx + cell, size)):
                        img.putpixel((i, j), (0, 0, 0))
    return img


def test_flat_region_is_not_busy():
    img = Image.new("RGB", (200, 200), "white")
    assert saliency.region_busyness(img, (0, 0, 1, 1)) < 0.02
    assert saliency.needs_scrim(img, (0, 0, 1, 1)) is False


def test_checkerboard_region_is_busy():
    img = _checkerboard()
    assert saliency.region_busyness(img, (0, 0, 1, 1)) > 0.1
    assert saliency.needs_scrim(img, (0, 0, 1, 1)) is True


def test_busyness_localizes_to_bbox():
    # left half flat white, right half busy checkerboard
    img = Image.new("RGB", (200, 200), "white")
    img.paste(_checkerboard(100, 8), (100, 0))
    left = saliency.region_busyness(img, (0.0, 0.0, 0.5, 1.0))
    right = saliency.region_busyness(img, (0.5, 0.0, 0.5, 1.0))
    assert left < right
