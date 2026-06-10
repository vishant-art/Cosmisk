"""Shared helpers for parsing Meta Ads Insights data (mock or live).

Meta returns insights as a list of rows where numeric fields are STRINGS, and
conversion/revenue data is nested inside `actions` / `action_values` /
`purchase_roas` arrays keyed by `action_type`. This module flattens all of that
into a tidy pandas DataFrame the other rnd scripts share.

Used by: brain.py (File 1), meta_live.py (File 2), chat.py (File 3).
"""
from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

# action_types we treat as a purchase / ATC / checkout, in priority order
# (web pixel first, then omni, then bare). First match wins so we never
# double-count omni + pixel for the same event.
PURCHASE_ACTION_TYPES = (
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "purchase",
)
ATC_ACTION_TYPES = (
    "offsite_conversion.fb_pixel_add_to_cart",
    "omni_add_to_cart",
    "add_to_cart",
)
CHECKOUT_ACTION_TYPES = (
    "offsite_conversion.fb_pixel_initiate_checkout",
    "omni_initiated_checkout",
    "initiate_checkout",
)
LINK_CLICK_ACTION_TYPES = ("link_click",)


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _action_value(arr, wanted_types) -> float:
    """Return the value of the first matching action_type in a Meta nested array."""
    if not arr:
        return 0.0
    by_type = {a.get("action_type"): _to_float(a.get("value")) for a in arr}
    for t in wanted_types:
        if t in by_type:
            return by_type[t]
    return 0.0


def load_insights(path: str):
    """Load a Meta insights file. Accepts the {meta, data} envelope OR a bare list.

    Returns (meta: dict, rows: list[dict]).
    """
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        return data.get("meta", {}), data.get("data", [])
    return {}, data


def explode_row(row: dict) -> dict:
    """Flatten one Meta insights row into typed scalars, unpacking the nested
    actions/action_values/purchase_roas arrays into real columns."""
    spend = _to_float(row.get("spend"))
    impressions = _to_float(row.get("impressions"))
    clicks = _to_float(row.get("clicks"))
    reach = _to_float(row.get("reach"))
    purchases = _action_value(row.get("actions"), PURCHASE_ACTION_TYPES)
    revenue = _action_value(row.get("action_values"), PURCHASE_ACTION_TYPES)
    roas_field = _action_value(row.get("purchase_roas"), PURCHASE_ACTION_TYPES)
    return {
        "campaign_id": row.get("campaign_id"),
        "campaign_name": row.get("campaign_name", row.get("campaign_id", "unknown")),
        "date": row.get("date_start"),
        "spend": spend,
        "impressions": impressions,
        "reach": reach,
        "frequency": _to_float(row.get("frequency")) or (impressions / reach if reach else 0.0),
        "clicks": clicks,
        "link_clicks": _action_value(row.get("actions"), LINK_CLICK_ACTION_TYPES),
        "ctr": _to_float(row.get("ctr")) or (clicks / impressions * 100 if impressions else 0.0),
        "cpc": _to_float(row.get("cpc")) or (spend / clicks if clicks else 0.0),
        "cpm": _to_float(row.get("cpm")) or (spend / impressions * 1000 if impressions else 0.0),
        "add_to_cart": _action_value(row.get("actions"), ATC_ACTION_TYPES),
        "checkout": _action_value(row.get("actions"), CHECKOUT_ACTION_TYPES),
        "purchases": purchases,
        "revenue": revenue,
        # prefer Meta's own purchase_roas, else derive revenue/spend
        "roas": roas_field or (revenue / spend if spend else 0.0),
        "cpa": spend / purchases if purchases else 0.0,
    }


def to_dataframe(rows) -> pd.DataFrame:
    df = pd.DataFrame([explode_row(r) for r in rows])
    if not df.empty:
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values(["campaign_name", "date"]).reset_index(drop=True)
    return df


def daily_totals(df: pd.DataFrame) -> pd.DataFrame:
    """Account-level daily aggregate. Spend/revenue summed; ROAS/CTR recomputed
    from the sums (never averaged, which would be wrong)."""
    g = df.groupby("date", as_index=False).agg(
        spend=("spend", "sum"),
        revenue=("revenue", "sum"),
        impressions=("impressions", "sum"),
        clicks=("clicks", "sum"),
        purchases=("purchases", "sum"),
    )
    g["roas"] = g.apply(lambda r: r.revenue / r.spend if r.spend else 0.0, axis=1)
    g["ctr"] = g.apply(lambda r: r.clicks / r.impressions * 100 if r.impressions else 0.0, axis=1)
    return g.sort_values("date").reset_index(drop=True)


def campaign_summary(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("campaign_name", as_index=False).agg(
        spend=("spend", "sum"),
        revenue=("revenue", "sum"),
        impressions=("impressions", "sum"),
        clicks=("clicks", "sum"),
        purchases=("purchases", "sum"),
        avg_frequency=("frequency", "mean"),
        days=("date", "nunique"),
    )
    g["roas"] = g.apply(lambda r: r.revenue / r.spend if r.spend else 0.0, axis=1)
    g["ctr"] = g.apply(lambda r: r.clicks / r.impressions * 100 if r.impressions else 0.0, axis=1)
    g["cpa"] = g.apply(lambda r: r.spend / r.purchases if r.purchases else 0.0, axis=1)
    return g.sort_values("spend", ascending=False).reset_index(drop=True)
