"""Thin cost ledger: one JSONL row per model call, plus per-call cost estimates.

The SDKs don't return a billed amount, so we estimate from the published rates in
the vendor research doc. Estimates, not invoices -- enough to understand run cost.
"""
from __future__ import annotations

import json
from pathlib import Path

# USD per image, by provider + size bucket (see creative-vendor-research.md).
_IMAGE_USD = {
    "nanobanana": {"1K": 0.067, "2K": 0.101, "4K": 0.151},
    "nanobanana_pro": {"1K": 0.134, "2K": 0.134, "4K": 0.24},
    "flux": {"_": 0.04},          # ~1MP; FLUX.2 pro is $0.03 + $0.015/MP
}

# USD per second of output video, by provider + resolution.
_VIDEO_USD_PER_S = {
    "veo": {"720p": 0.40, "1080p": 0.40, "4k": 0.60},
    "veo_fast": {"720p": 0.10, "1080p": 0.12, "4k": 0.30},
    "seedance": {"_": 0.30},
    "seedance_fast": {"_": 0.24},
}


def image_cost(provider: str, size: str = "2K") -> float:
    table = _IMAGE_USD.get(provider, {})
    return table.get(size) or next(iter(table.values()), 0.0)


def video_cost(provider: str, seconds: float, resolution: str = "720p") -> float:
    table = _VIDEO_USD_PER_S.get(provider, {})
    per_s = table.get(resolution) or next(iter(table.values()), 0.0)
    return round(per_s * seconds, 4)


class Ledger:
    """Append-only JSONL at <run_dir>/ledger.jsonl."""

    def __init__(self, run_dir: Path):
        self.path = Path(run_dir) / "ledger.jsonl"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._total = 0.0

    def record(self, op: str, provider: str, model: str, cost_usd: float, **meta) -> None:
        self._total += float(cost_usd or 0.0)
        row = {"op": op, "provider": provider, "model": model,
               "cost_usd": round(float(cost_usd or 0.0), 6), **meta}
        with self.path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row) + "\n")

    @property
    def total(self) -> float:
        return round(self._total, 6)
