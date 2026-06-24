"""QA gate -- two stages, fail-closed (rebuild plan Stage 5).

1. Deterministic checks on the rendered ad + layout: WCAG text contrast, Meta
   safe-zone geometry, required-element presence. Free, fast, run first.
2. VLM critic (Gemini via OpenRouter): a structured pass/fail with reasons. Advisory
   but gating. Run only when asked (costs a token call).

The pipeline ships only `pass`; a `fail` loops (re-place/re-layout/regenerate) up to
a retry budget, then rejects -- 'reject, don't log'.
"""
from __future__ import annotations

import base64
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import ledger  # noqa: E402
from schemas import CopySet, LayoutSpec, QACheck, QAReport  # noqa: E402

_CONTRAST_MIN = 3.0        # WCAG AA large-text threshold; ad copy is large
_HERO_ROLES = ("headline", "subhead")


# --- WCAG contrast ------------------------------------------------------------

def _lin(c: float) -> float:
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def rel_lum(rgb) -> float:
    r, g, b = (_lin(v) for v in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(l1: float, l2: float) -> float:
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def _percentile_gray(crop, p: float) -> int:
    hist = crop.histogram()
    n = sum(hist)
    if not n:
        return 0
    target, c = n * p, 0
    for i, cnt in enumerate(hist):
        c += cnt
        if c >= target:
            return i
    return 255


def region_contrast(img, bbox) -> float:
    """Contrast between the light and dark tones present in a region (text vs bg)."""
    w_px, h_px = img.size
    x, y, w, h = bbox
    crop = img.crop((int(x * w_px), int(y * h_px),
                     int((x + w) * w_px), int((y + h) * h_px))).convert("L")
    hi = _percentile_gray(crop, 0.98)
    lo = _percentile_gray(crop, 0.02)
    return round(contrast_ratio(rel_lum((hi,) * 3), rel_lum((lo,) * 3)), 3)


# --- deterministic checks -----------------------------------------------------

def check_contrast(img, spec: LayoutSpec) -> QACheck:
    worst = None
    for b in spec.boxes:
        if b.role in _HERO_ROLES:
            c = region_contrast(img, (b.x, b.y, b.w, b.h))
            worst = c if worst is None else min(worst, c)
    if worst is None:
        return QACheck(name="contrast", passed=True, detail="no hero copy to check")
    ok = worst >= _CONTRAST_MIN
    return QACheck(name="contrast", passed=ok,
                   detail=f"min hero contrast {worst} (need >= {_CONTRAST_MIN})"
                          + ("" if ok else " -- add/darken scrim"))


def check_safe_zone(spec: LayoutSpec) -> QACheck:
    sz = spec.safe_zone
    for b in spec.boxes:
        if b.role not in ("headline", "subhead", "cta", "legal"):
            continue
        if (b.y < sz["top"] - 1e-6 or b.y + b.h > 1 - sz["bottom"] + 1e-6
                or b.x < sz["left"] - 1e-6 or b.x + b.w > 1 - sz["right"] + 1e-6):
            return QACheck(name="safe_zone", passed=False,
                           detail=f"{b.role} box violates the {spec.fmt} safe zone")
    return QACheck(name="safe_zone", passed=True, detail="all copy within safe zone")


def check_presence(spec: LayoutSpec, copy: CopySet) -> QACheck:
    roles = {b.role for b in spec.boxes}
    missing = []
    if "headline" not in roles:
        missing.append("headline")
    if "cta" not in roles:
        missing.append("cta")
    if copy.legal and "legal" not in roles:
        missing.append("legal")
    ok = not missing
    return QACheck(name="presence", passed=ok,
                   detail="all required elements present" if ok else f"missing: {', '.join(missing)}")


# --- VLM critic ---------------------------------------------------------------

_VLM_SYSTEM = (
    "You are a meticulous advertising creative director reviewing ONE finished static ad. "
    "Judge it against this rubric and return STRICT JSON only: "
    '{"passed": bool, "issues": [str]}. '
    "Fail (passed=false) if ANY: the headline is unreadable or low-contrast; the headline or "
    "CTA overlaps/obscures the product; spelling is wrong vs the intended copy; the CTA is "
    "missing or invisible; the logo is missing or crowded; it looks generic, off-brand, or "
    "AI-slop. List concrete issues. If it is clean and on-brand, passed=true with [] issues."
)


def vlm_critique(image_path, copy: CopySet, *, client, model: str | None = None) -> QACheck:
    data = base64.b64encode(Path(image_path).read_bytes()).decode()
    user = [
        {"type": "text", "text": f"Intended copy -- headline: {copy.headline!r}, "
                                 f"subhead: {copy.subhead!r}, CTA: {copy.cta_label!r}. "
                                 f"Review the attached creative."},
        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}},
    ]
    resp = client.chat.completions.create(
        model=model or config.VISION_MODEL, temperature=0,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": _VLM_SYSTEM},
                  {"role": "user", "content": user}],
    )
    text = (resp.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):text.rfind("}") + 1]
    parsed = json.loads(text)
    passed = bool(parsed.get("passed", False))
    issues = parsed.get("issues") or []
    return QACheck(name="vlm_critic", passed=passed,
                   detail="; ".join(issues) if issues else "ok",
                   cost_usd=ledger.response_cost(resp))


# --- gate ---------------------------------------------------------------------

def verify(ad, spec: LayoutSpec, copy: CopySet, *, client=None, run_vlm: bool = False,
           vision_model: str | None = None) -> QAReport:
    from PIL import Image                 # lazy
    img = Image.open(ad.path).convert("RGB")
    checks = [check_safe_zone(spec), check_presence(spec, copy), check_contrast(img, spec)]
    if run_vlm and client is not None:
        checks.append(vlm_critique(ad.path, copy, client=client, model=vision_model))
    failed = [c for c in checks if not c.passed]
    return QAReport(checks=checks, verdict="fail" if failed else "pass",
                    retry_hint=failed[0].detail if failed else None,
                    cost_usd=round(sum(c.cost_usd for c in checks), 6))
