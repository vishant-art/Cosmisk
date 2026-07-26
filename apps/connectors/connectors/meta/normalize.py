"""Meta raw-insight → UnifiedFact, porting the proven field choices from the existing
`meta_transform` (inline link clicks, website-pixel purchase basis, DERIVED ROAS). The rich
Meta-only metrics are preserved under `platform_extra` so the contract core stays platform-agnostic.
"""
from __future__ import annotations

from ..contract import UnifiedFact

# Pixel/website basis — matches Ads Manager "Website purchases" (auditable for web D2C).
PURCHASE_ACTION_TYPES = ("offsite_conversion.fb_pixel_purchase", "onsite_conversion.purchase")
ATC_ACTION_TYPES = ("offsite_conversion.fb_pixel_add_to_cart", "add_to_cart")
CHECKOUT_ACTION_TYPES = ("offsite_conversion.fb_pixel_initiate_checkout", "initiate_checkout")
LINK_CLICK_ACTION_TYPES = ("link_click",)      # fallback only; prefer inline_link_clicks

# level=campaign insight fields (mirror meta_live.FIELDS, minus a few CLI-only extras).
INSIGHT_FIELDS = [
    "campaign_id", "campaign_name", "account_currency",
    "spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc",
    "inline_link_clicks", "inline_link_click_ctr", "cost_per_inline_link_click",
    "cpm", "actions", "action_values", "date_start", "date_stop",
]
# Do NOT request 7d_view/28d_view — removed Jan 2026, return empty silently.
ATTRIBUTION_WINDOWS = ["1d_view", "7d_click"]


def _f(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _action_value(arr, wanted) -> float:
    if not arr:
        return 0.0
    by_type = {a.get("action_type"): _f(a.get("value")) for a in arr}
    for t in wanted:
        if t in by_type:
            return by_type[t]
    return 0.0


def row_to_fact(raw: dict, account_id: str) -> UnifiedFact:
    spend = _f(raw.get("spend"))
    impressions = _f(raw.get("impressions"))
    reach = _f(raw.get("reach"))
    clicks = _f(raw.get("clicks"))
    link_clicks = _f(raw.get("inline_link_clicks")) \
        or _action_value(raw.get("actions"), LINK_CLICK_ACTION_TYPES)
    purchases = _action_value(raw.get("actions"), PURCHASE_ACTION_TYPES)
    revenue = _action_value(raw.get("action_values"), PURCHASE_ACTION_TYPES)
    # Prefer platform-reported derived metrics; fall back to derivation (never None).
    ctr = _f(raw.get("ctr")) or (clicks / impressions * 100 if impressions else 0.0)
    cpc = _f(raw.get("cpc")) or (spend / clicks if clicks else 0.0)
    link_ctr = _f(raw.get("inline_link_click_ctr")) or (link_clicks / impressions * 100 if impressions else 0.0)
    cost_per_link_click = _f(raw.get("cost_per_inline_link_click")) or (spend / link_clicks if link_clicks else 0.0)
    cpm = _f(raw.get("cpm")) or (spend / impressions * 1000 if impressions else 0.0)
    frequency = _f(raw.get("frequency")) or (impressions / reach if reach else 0.0)
    return UnifiedFact(
        platform="meta",
        account_id=account_id,
        entity_id=str(raw.get("campaign_id", "")),
        entity_name=raw.get("campaign_name", raw.get("campaign_id", "unknown")),
        date=raw.get("date_start", ""),
        spend=spend, impressions=impressions, reach=reach, frequency=frequency,
        clicks=clicks, ctr=ctr, cpc=cpc,
        link_clicks=link_clicks, link_ctr=link_ctr, cost_per_link_click=cost_per_link_click,
        cpm=cpm,
        add_to_cart=_action_value(raw.get("actions"), ATC_ACTION_TYPES),
        checkout=_action_value(raw.get("actions"), CHECKOUT_ACTION_TYPES),
        conversions=purchases, revenue=revenue,
        roas=(revenue / spend if spend else 0.0),        # DERIVED, never the reported field
        cpa=(spend / purchases if purchases else 0.0),
        platform_extra={"currency": raw.get("account_currency")},
    )
