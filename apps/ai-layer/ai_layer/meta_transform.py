"""L1 transformation module for Meta Ads Insights -> typed, clean facts.

The single source of truth that turns raw Meta insight rows into a typed contract
(`CampaignDayFact` inside a `Dataset`). No consumer (brain, chat, EDA, the future
apps/ai-layer) touches raw Meta JSON; they consume the contract here.

FIELD CHOICES (researched against Meta docs + Fivetran/Supermetrics/Funnel/Windsor
consensus; see dev_reports/ai_serv/meta-field-choices.md):

  - LINK CLICKS, not all-clicks. `clicks`/`ctr`/`cpc` count ALL clicks (likes,
    comments, shares) and overstate traffic. The meaningful traffic metrics are
    `inline_link_clicks` / `inline_link_click_ctr` / `cost_per_inline_link_click`.
    We keep both, but `link_*` are the headline; `clicks`/`ctr`/`cpc` are the
    labeled "all-clicks" secondary stats.
  - PURCHASE / REVENUE = the WEBSITE pixel purchase
    (`offsite_conversion.fb_pixel_purchase`), which audit-matches the Ads Manager
    "Website purchases" column. We deliberately do NOT use `omni_purchase`/`purchase`
    (the all-channels rollup: wrong scope for a website brand). Fallback to
    `onsite_conversion.purchase` (on-Meta direct) only.
  - ROAS is DERIVED (`revenue / spend`), not read from the reported `purchase_roas`
    (now keys on omni) or the deprecating `website_purchase_roas`. Deriving keeps
    count, value, and ROAS on one consistent basis.
  - Funnel (ATC, checkout) stays on the pixel tier to match the purchase basis.

Cross-source unification + blended ROAS (Meta + Google + Shopify) is L2 and lives
elsewhere; see dev_reports/ai_serv/transformation-layer-discussion.md.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd

# --- Canonical action_type policy (first match wins; omni rollups excluded) ---
# WEBSITE purchase basis. `omni_purchase`/`purchase` are intentionally absent:
# they aggregate web+app+onsite+offline and are the wrong scope for a web D2C
# brand (equal to pixel for web-only, but not auditable). See the module docstring.
PURCHASE_ACTION_TYPES = (
    "offsite_conversion.fb_pixel_purchase",   # Ads Manager "Website purchases"
    "onsite_conversion.purchase",             # on-Meta direct (disjoint from web)
)
ATC_ACTION_TYPES = (
    "offsite_conversion.fb_pixel_add_to_cart",
    "add_to_cart",
)
CHECKOUT_ACTION_TYPES = (
    "offsite_conversion.fb_pixel_initiate_checkout",
    "initiate_checkout",
)
LINK_CLICK_ACTION_TYPES = ("link_click",)     # fallback only; prefer inline_link_clicks field

FACT_FIELDS = (
    "campaign_id", "campaign_name", "date",
    "spend", "impressions", "reach", "frequency",
    "clicks", "ctr", "cpc",                            # ALL-clicks (secondary)
    "link_clicks", "link_ctr", "cost_per_link_click",  # link clicks (headline)
    "cpm",
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
    clicks: float             # ALL clicks (incl. social) -- secondary
    ctr: float                # ALL-clicks CTR -- secondary
    cpc: float                # cost per ALL click -- secondary
    link_clicks: float        # inline_link_clicks -- the real traffic number
    link_ctr: float           # inline_link_click_ctr -- the headline CTR
    cost_per_link_click: float
    cpm: float
    add_to_cart: float
    checkout: float
    purchases: float          # website pixel purchases
    revenue: float            # website pixel purchase value
    roas: float               # DERIVED revenue/spend
    cpa: float

    # --- extended fields (not in FACT_FIELDS / the facts table; adset/ad level + video) ---
    adset_id: str = ""
    adset_name: str = ""              # populated at adset/ad level
    ad_id: str = ""                   # unique ad key at ad level
    ad_name: str = ""                 # human label (NOT unique -- repeats across adsets)
    video_3s: float = 0.0             # 3-second video views (actions.video_view)
    thruplay: float = 0.0
    hook_rate: float = 0.0            # 3-sec view rate = video_3s / impressions * 100
    is_video: bool = False


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

    # link clicks: prefer the dedicated inline field, else the link_click action
    link_clicks = _to_float(raw.get("inline_link_clicks")) \
        or _action_value(raw.get("actions"), LINK_CLICK_ACTION_TYPES)

    purchases = _action_value(raw.get("actions"), PURCHASE_ACTION_TYPES)
    revenue = _action_value(raw.get("action_values"), PURCHASE_ACTION_TYPES)

    # video: actions.video_view = 3-second views (hook-rate numerator)
    video_3s = _action_value(raw.get("actions"), ("video_view",))
    thruplay = _action_value(raw.get("video_thruplay_watched_actions"), ("video_view",))
    video_plays = _action_value(raw.get("video_play_actions"), ("video_view",))

    return CampaignDayFact(
        campaign_id=str(raw.get("campaign_id", "")),
        campaign_name=raw.get("campaign_name", raw.get("campaign_id", "unknown")),
        date=raw.get("date_start", ""),
        spend=spend,
        impressions=impressions,
        reach=reach,
        frequency=_to_float(raw.get("frequency")) or (impressions / reach if reach else 0.0),
        clicks=clicks,
        ctr=_to_float(raw.get("ctr")) or (clicks / impressions * 100 if impressions else 0.0),
        cpc=_to_float(raw.get("cpc")) or (spend / clicks if clicks else 0.0),
        link_clicks=link_clicks,
        link_ctr=_to_float(raw.get("inline_link_click_ctr"))
        or (link_clicks / impressions * 100 if impressions else 0.0),
        cost_per_link_click=_to_float(raw.get("cost_per_inline_link_click"))
        or (spend / link_clicks if link_clicks else 0.0),
        cpm=_to_float(raw.get("cpm")) or (spend / impressions * 1000 if impressions else 0.0),
        add_to_cart=_action_value(raw.get("actions"), ATC_ACTION_TYPES),
        checkout=_action_value(raw.get("actions"), CHECKOUT_ACTION_TYPES),
        purchases=purchases,
        revenue=revenue,
        roas=revenue / spend if spend else 0.0,     # DERIVED, never the reported field
        cpa=spend / purchases if purchases else 0.0,
        adset_id=str(raw.get("adset_id") or ""),
        adset_name=raw.get("adset_name") or "",
        ad_id=str(raw.get("ad_id") or ""),
        ad_name=raw.get("ad_name") or "",
        video_3s=video_3s,
        thruplay=thruplay,
        hook_rate=video_3s / impressions * 100 if impressions else 0.0,
        is_video=bool(thruplay or video_3s or video_plays),
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
    """Account-level daily aggregate. Spend/revenue summed; ratios recomputed
    from the sums (never averaged, which would be wrong)."""
    g = df.groupby("date", as_index=False).agg(
        spend=("spend", "sum"),
        revenue=("revenue", "sum"),
        impressions=("impressions", "sum"),
        link_clicks=("link_clicks", "sum"),
        purchases=("purchases", "sum"),
    )
    g["roas"] = g.apply(lambda r: r.revenue / r.spend if r.spend else 0.0, axis=1)
    g["link_ctr"] = g.apply(
        lambda r: r.link_clicks / r.impressions * 100 if r.impressions else 0.0, axis=1)
    return g.sort_values("date").reset_index(drop=True)


def campaign_summary(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("campaign_name", as_index=False).agg(
        spend=("spend", "sum"),
        revenue=("revenue", "sum"),
        impressions=("impressions", "sum"),
        link_clicks=("link_clicks", "sum"),
        purchases=("purchases", "sum"),
        avg_frequency=("frequency", "mean"),
        days=("date", "nunique"),
    )
    g["roas"] = g.apply(lambda r: r.revenue / r.spend if r.spend else 0.0, axis=1)
    g["link_ctr"] = g.apply(
        lambda r: r.link_clicks / r.impressions * 100 if r.impressions else 0.0, axis=1)
    g["cpa"] = g.apply(lambda r: r.spend / r.purchases if r.purchases else 0.0, axis=1)
    return g.sort_values("spend", ascending=False).reset_index(drop=True)
