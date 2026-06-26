"""Cost ledger: one JSONL row per step, plus a final TOTAL row.

Two sources of truth, by provider:
- **OpenRouter** returns the authoritative billed cost inline at `response.usage.cost`
  (USD; already includes image tokens for the VLM critic) -- we read it, never estimate.
- **fal** returns NO cost in the response or headers, so we compute it from fal's
  published rates (verified 2026-06; see creative-vendor-research.md). fal's megapixel
  unit is 1024x1024 and rounds UP; video bills by a token formula.

These are estimates only for the fal side; OpenRouter rows are exact.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

# --- fal published rates (USD) ------------------------------------------------
_MP_UNIT = 1024 * 1024            # fal's "megapixel" = 1024x1024 px
FLUX_FLEX_PER_MP = 0.05           # flux-2-flex: $0.05/MP (input + output)
FLUX_PRO_FIRST_MP = 0.03          # flux-2-pro: $0.03 first MP ...
FLUX_PRO_EXTRA_MP = 0.015         #            ... + $0.015 per extra MP
BRIA_PRODUCT_FLAT = 0.04          # bria/product-shot: $0.04 per image
FLUX_FILL_PER_MP = 0.05           # flux-pro/v1/fill (outpaint): $0.05/MP

VIDEO_FPS = 24                    # Seedance token formula uses 24 fps
_SEEDANCE_PER_1K = {              # USD per 1,000 video tokens
    "seedance": 0.014,
    "seedance_fast": 0.0112,
    "seedance_4k": 0.008,
}


def megapixels(width: int, height: int) -> int:
    """fal megapixels: width*height / 1024^2, rounded UP (min 1)."""
    return max(1, math.ceil((width * height) / _MP_UNIT))


def image_cost(provider: str, width: int = 1024, height: int = 1024, *,
               ref_mp: int = 0) -> float:
    """USD for one fal image. `ref_mp` = megapixels of input reference images
    (flex/pro bill input + output); product-shot is flat; fill is output-only."""
    mp = megapixels(width, height)
    if provider in ("flux", "flux_flex"):
        return round(FLUX_FLEX_PER_MP * (mp + ref_mp), 6)
    if provider == "flux_pro":
        extra = max(0, mp - 1) + ref_mp
        return round(FLUX_PRO_FIRST_MP + FLUX_PRO_EXTRA_MP * extra, 6)
    if provider == "product":
        return BRIA_PRODUCT_FLAT
    if provider in ("flux_fill", "flux_outpaint"):
        return round(FLUX_FILL_PER_MP * mp, 6)
    return 0.0


def video_cost(bucket: str, width: int, height: int, seconds: float, *,
               fps: int = VIDEO_FPS) -> float:
    """USD for one Seedance clip via the token formula (h*w*sec*fps)/1024."""
    tokens = (width * height * seconds * fps) / 1024
    rate = _SEEDANCE_PER_1K.get(bucket, _SEEDANCE_PER_1K["seedance"])
    return round(tokens / 1000 * rate, 6)


TTS_PER_1K_CHARS = 0.10               # MiniMax Speech-02 HD ($/1K characters)
AUDIO_MERGE_PER_S = 0.0002            # fal ffmpeg merge-audio-video ($/second)


def tts_cost(chars: int) -> float:
    """USD for a TTS voiceover by character count."""
    return round(max(0, chars) / 1000 * TTS_PER_1K_CHARS, 6)


def merge_cost(seconds: float) -> float:
    """USD to mux an audio track onto a video (fal ffmpeg merge)."""
    return round(max(0.0, seconds) * AUDIO_MERGE_PER_S, 6)


def response_cost(resp) -> float:
    """Authoritative OpenRouter cost (USD) from a chat-completion response.

    Normal requests put the charge in `usage.cost`. BYOK requests (an underlying
    provider key) report `usage.cost = 0` and the real spend in
    `usage.cost_details.upstream_inference_cost`. Summing both captures either mode
    (upstream is 0/absent for non-BYOK). Returns 0.0 if the shape is absent."""
    try:
        usage = resp.model_dump().get("usage") or {}
        direct = float(usage.get("cost") or 0.0)
        details = usage.get("cost_details") or {}
        upstream = float(details.get("upstream_inference_cost") or 0.0)
        return round(direct + upstream, 6)
    except Exception:                 # noqa: BLE001 -- any non-conforming response -> 0
        return 0.0


class Ledger:
    """Append-only JSONL at <run_dir>/ledger.jsonl, finalized with a TOTAL row."""

    def __init__(self, run_dir: Path):
        self.path = Path(run_dir) / "ledger.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._total = 0.0
        self._by_op: dict[str, float] = {}

    def record(self, op: str, provider: str, model: str, cost_usd: float, **meta) -> None:
        cost = round(float(cost_usd or 0.0), 6)
        self._total += cost
        self._by_op[op] = round(self._by_op.get(op, 0.0) + cost, 6)
        row = {"op": op, "provider": provider, "model": model, "cost_usd": cost, **meta}
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row) + "\n")

    def finalize(self) -> dict:
        """Append and return the grand-total row (with a per-op breakdown)."""
        summary = {"op": "TOTAL", "provider": "-", "model": "-",
                   "cost_usd": self.total, "by_op": dict(self._by_op), "currency": "USD"}
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(summary) + "\n")
        return summary

    @property
    def total(self) -> float:
        return round(self._total, 6)
