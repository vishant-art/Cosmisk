"""The R&D store: the same shape as the deployed Postgres repository, backed by JSON files.

`apps/ai-layer` persists variants and teardowns to Neon (ai_layer.db.repository). rnd has no
database and should not need one: the whole point of this tree is that you can run the studio
end to end on a laptop with nothing but an API key. So `outcomes.py` and `graph.py` talk to a
`_repo()` seam, and here that seam is two JSON files.

The interface is deliberately IDENTICAL to ai_layer.db.repository's:

    save_variants / stamp_published / record_outcome / load_variants
    save_teardown / has_teardown   / load_teardowns

so the modules that use it are byte-for-byte the same in both trees except for their imports.
When you promote an experiment to main, there is nothing to rewrite: the Postgres repository
already answers the same calls.

Files live in rnd/creative/library/ and are safe to delete -- they are a cache and a lab
notebook, not a source of truth.
"""
from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402

LIBRARY_DIR = config.CREATIVE_DIR / "library"
_VARIANTS = LIBRARY_DIR / "variants.json"
_TEARDOWNS = LIBRARY_DIR / "teardowns.json"


def _read(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text("utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _write(path: Path, payload: dict) -> None:
    LIBRARY_DIR.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


# --- variants: the closed loop (T11) -------------------------------------------

_VARIANT_COLS = ("variant_id", "base_id", "axis", "value", "kind", "artifact_path",
                 "meta_ad_id", "thumb_stop_rate", "thruplay_rate", "impressions",
                 "spend", "roas", "harvested_at")


def save_variants(variants: list[dict], brand_id: str | None = None) -> int:
    """Upsert. Never clobbers a meta_ad_id or a harvested metric that arrived since -- only
    the planning columns are refreshed, exactly like the Postgres upsert."""
    rows = _read(_VARIANTS)
    for v in variants:
        vid = v["variant_id"]
        existing = rows.get(vid, {})
        row = {c: existing.get(c) for c in _VARIANT_COLS}
        row.update({c: v[c] for c in ("variant_id", "base_id", "axis", "value", "kind",
                                      "artifact_path") if c in v})
        row["brand_id"] = brand_id or v.get("brand_id") or existing.get("brand_id")
        row.setdefault("impressions", 0)
        row.setdefault("spend", 0.0)
        rows[vid] = row
    _write(_VARIANTS, rows)
    return len(variants)


def stamp_published(variant_id: str, meta_ad_id: str) -> bool:
    """The join: which Meta ad this variant became. Manual, because nothing publishes."""
    rows = _read(_VARIANTS)
    if variant_id not in rows:
        return False
    rows[variant_id]["meta_ad_id"] = meta_ad_id
    _write(_VARIANTS, rows)
    return True


def record_outcome(variant_id: str, metrics: dict) -> bool:
    rows = _read(_VARIANTS)
    if variant_id not in rows:
        return False
    rows[variant_id].update({
        "thumb_stop_rate": metrics.get("thumb_stop_rate"),
        "thruplay_rate": metrics.get("thruplay_rate"),
        "impressions": int(metrics.get("impressions") or 0),
        "spend": float(metrics.get("spend") or 0.0),
        "roas": metrics.get("roas"),
        "harvested_at": datetime.now(timezone.utc).isoformat()})
    _write(_VARIANTS, rows)
    return True


def load_variants(brand_id: str | None = None, *, published_only: bool = False) -> list[dict]:
    rows = list(_read(_VARIANTS).values())
    if brand_id is not None:
        rows = [r for r in rows if r.get("brand_id") == brand_id]
    if published_only:
        rows = [r for r in rows if r.get("meta_ad_id")]
    return rows


# --- teardowns: the durable structural library (T12) ----------------------------

def _key(brand_id: str, ad_id: str) -> str:
    return f"{brand_id}|{ad_id}"


def save_teardown(brand_id: str, ad_id: str, cohort: str, template_json: dict,
                  thumb_stop_rate: float | None = None) -> bool:
    """Immutable: an ad's structure does not change after it ran, so an existing row wins
    and we never re-pay the ASR + vision call to be told the same thing."""
    rows = _read(_TEARDOWNS)
    k = _key(brand_id, ad_id)
    if k in rows:
        return True
    rows[k] = {"brand_id": brand_id, "ad_id": ad_id, "cohort": cohort,
               "template_json": template_json, "thumb_stop_rate": thumb_stop_rate}
    _write(_TEARDOWNS, rows)
    return True


def has_teardown(brand_id: str, ad_id: str) -> bool:
    return _key(brand_id, ad_id) in _read(_TEARDOWNS)


def load_teardowns(brand_id: str) -> list[dict]:
    return [r for r in _read(_TEARDOWNS).values() if r.get("brand_id") == brand_id]
