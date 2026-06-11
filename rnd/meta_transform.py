"""L1 transformation module for Meta Ads Insights -> typed, clean facts.

The single source of truth that turns raw Meta insight rows into a typed contract
(`CampaignDayFact` inside a `Dataset`). No consumer (brain, chat, EDA, the future
apps/ai-layer) should ever touch raw Meta JSON; they consume the contract here.

L1 responsibilities (single-source cleaning / normalization):
  - explode the nested actions / action_values / purchase_roas arrays
  - pick ONE canonical purchase / revenue / ROAS via a documented priority
    (first match wins -> the same sale under fb_pixel/omni/onsite/bare keys is
    never double counted)
  - coerce string / missing / null numerics safely to float
  - conform to one tidy grain: (account x campaign x date)

Cross-source unification + blended ROAS (Meta + Google + Shopify) is L2 and lives
elsewhere; see dev_reports/ai_serv/transformation-layer-discussion.md.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd

# --- Canonical action_type policy --------------------------------------------
# On real accounts the same logical event appears under many keys (67 action
# types seen on one live account). We select ONE per metric, first match wins.
# The PURCHASE policy is the load-bearing BUSINESS choice (pixel vs omni vs
# onsite disagree by 2-3x); it is deliberately explicit and centralised here so
# it is decided once, not re-derived per consumer.
PURCHASE_ACTION_TYPES = (
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "onsite_web_purchase",
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

# Columns of the contract, in order — handy for tests and schema assertions.
FACT_FIELDS = (
    "campaign_id", "campaign_name", "date",
    "spend", "impressions", "reach", "frequency",
    "clicks", "link_clicks", "ctr", "cpc", "cpm",
    "add_to_cart", "checkout", "purchases", "revenue", "roas", "cpa",
)


@dataclass(frozen=True)
class CampaignDayFact:
    """One normalized (campaign x date) row -- the L1 output contract."""
    campaign_id: str
    campaign_name: str
    date: str                 # ISO date (date_start)
    spend: float
    impressions: float
    reach: float
    frequency: float
    clicks: float
    link_clicks: float
    ctr: float
    cpc: float
    cpm: float
    add_to_cart: float
    checkout: float
    purchases: float
    revenue: float
    roas: float
    cpa: float


@dataclass(frozen=True)
class Dataset:
    """A normalized pull: account metadata + typed campaign-day facts."""
    account_id: str
    account_name: str
    currency: str
    since: str | None
    until: str | None
    level: str
    source: str
    facts: tuple[CampaignDayFact, ...]

    def __len__(self) -> int:
        return len(self.facts)

    def to_dataframe(self) -> pd.DataFrame:
        df = pd.DataFrame([asdict(f) for f in self.facts], columns=list(FACT_FIELDS))
        if not df.empty:
            df["date"] = pd.to_datetime(df["date"])
            df = df.sort_values(["campaign_name", "date"]).reset_index(drop=True)
        return df


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _action_value(arr, wanted_types) -> float:
    """Value of the first matching action_type in a Meta nested array."""
    if not arr:
        return 0.0
    by_type = {a.get("action_type"): _to_float(a.get("value")) for a in arr}
    for t in wanted_types:
        if t in by_type:
            return by_type[t]
    return 0.0


def row_to_fact(raw: dict) -> CampaignDayFact:
    """Flatten one raw Meta insight row into the typed contract."""
    spend = _to_float(raw.get("spend"))
    impressions = _to_float(raw.get("impressions"))
    clicks = _to_float(raw.get("clicks"))
    reach = _to_float(raw.get("reach"))
    purchases = _action_value(raw.get("actions"), PURCHASE_ACTION_TYPES)
    revenue = _action_value(raw.get("action_values"), PURCHASE_ACTION_TYPES)
    roas_field = _action_value(raw.get("purchase_roas"), PURCHASE_ACTION_TYPES)
    return CampaignDayFact(
        campaign_id=str(raw.get("campaign_id", "")),
        campaign_name=raw.get("campaign_name", raw.get("campaign_id", "unknown")),
        date=raw.get("date_start", ""),
        spend=spend,
        impressions=impressions,
        reach=reach,
        frequency=_to_float(raw.get("frequency")) or (impressions / reach if reach else 0.0),
        clicks=clicks,
        link_clicks=_action_value(raw.get("actions"), LINK_CLICK_ACTION_TYPES),
        ctr=_to_float(raw.get("ctr")) or (clicks / impressions * 100 if impressions else 0.0),
        cpc=_to_float(raw.get("cpc")) or (spend / clicks if clicks else 0.0),
        cpm=_to_float(raw.get("cpm")) or (spend / impressions * 1000 if impressions else 0.0),
        add_to_cart=_action_value(raw.get("actions"), ATC_ACTION_TYPES),
        checkout=_action_value(raw.get("actions"), CHECKOUT_ACTION_TYPES),
        purchases=purchases,
        revenue=revenue,
        roas=roas_field or (revenue / spend if spend else 0.0),
        cpa=spend / purchases if purchases else 0.0,
    )


def normalize(envelope) -> Dataset:
    """Raw {meta, data} envelope (or a bare list of rows) -> typed Dataset."""
    if isinstance(envelope, dict):
        meta = envelope.get("meta", {}) or {}
        rows = envelope.get("data", []) or []
    else:
        meta, rows = {}, (envelope or [])
    dr = meta.get("date_range", {}) if isinstance(meta, dict) else {}
    return Dataset(
        account_id=meta.get("account_id", ""),
        account_name=meta.get("account_name", "(unknown account)"),
        currency=meta.get("currency", "INR"),
        since=dr.get("since"),
        until=dr.get("until"),
        level=meta.get("level", "campaign"),
        source=meta.get("source", "mock"),
        facts=tuple(row_to_fact(r) for r in rows),
    )


def load(path: str) -> Dataset:
    return normalize(json.loads(Path(path).read_text(encoding="utf-8")))


# --- aggregation helpers (operate on Dataset.to_dataframe()) -----------------

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
