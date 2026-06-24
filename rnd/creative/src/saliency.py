"""Saliency / busyness of an image region -- the compositor uses this to decide
whether a text box needs a contrast scrim.

Pillow-only (edge density via FIND_EDGES); cv2 is NOT required. The interface is
deliberately small so a cv2 spectral-residual implementation could drop in later
behind the same two functions.
"""
from __future__ import annotations


def _edge_density(region) -> float:
    """Mean edge magnitude (0-1). Flat region -> ~0; busy/detailed -> higher."""
    from PIL import ImageFilter            # lazy
    gray = region.convert("L")
    edges = gray.filter(ImageFilter.FIND_EDGES)
    hist = edges.histogram()
    n = sum(hist)
    if not n:
        return 0.0
    mean = sum(i * c for i, c in enumerate(hist)) / n
    return mean / 255.0


def region_busyness(img, bbox) -> float:
    """`bbox` is relative (x, y, w, h) in 0-1. Returns a 0-1 busyness score."""
    w_px, h_px = img.size
    x, y, w, h = bbox
    crop = img.crop((int(x * w_px), int(y * h_px),
                     int((x + w) * w_px), int((y + h) * h_px)))
    return round(_edge_density(crop), 4)


def needs_scrim(img, bbox, threshold: float = 0.08) -> bool:
    """True when the region is too busy to drop legible text without a scrim."""
    return region_busyness(img, bbox) >= threshold
