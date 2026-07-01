"""Google Ads GAQL rows (already flattened to plain dicts by the client) → UnifiedFact.
Kept dict-based so it's testable with zero gRPC dependency."""
from __future__ import annotations

from ..contract import UnifiedFact

# Daily campaign performance. cost is micros; revenue = conversions_value; currency from customer.
GAQL_CAMPAIGN_DAILY = (
    "SELECT campaign.id, campaign.name, segments.date, customer.currency_code, "
    "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, "
    "metrics.conversions_value "
    "FROM campaign WHERE segments.date BETWEEN '{since}' AND '{until}'"
)


def _f(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def rows_to_facts(rows, customer_id: str) -> list[UnifiedFact]:
    out = []
    for r in rows:
        spend = _f(r.get("cost_micros")) / 1_000_000.0
        impressions = _f(r.get("impressions"))
        clicks = _f(r.get("clicks"))
        conversions = _f(r.get("conversions"))
        revenue = _f(r.get("conversions_value"))
        ctr = clicks / impressions * 100 if impressions else 0.0
        cpc = spend / clicks if clicks else 0.0
        cpm = spend / impressions * 1000 if impressions else 0.0
        out.append(UnifiedFact(
            platform="google",
            account_id=customer_id,
            entity_id=str(r.get("campaign_id", "")),
            entity_name=r.get("campaign_name", ""),
            date=r.get("date", ""),
            spend=spend, impressions=impressions, clicks=clicks,
            ctr=ctr, cpc=cpc,
            link_clicks=clicks, link_ctr=ctr, cost_per_link_click=cpc,  # Google: link ≈ all clicks
            cpm=cpm,
            conversions=conversions, revenue=revenue,
            roas=(revenue / spend if spend else 0.0),
            cpa=(spend / conversions if conversions else 0.0),
            platform_extra={"cost_micros": r.get("cost_micros"),
                            "currency": r.get("currency_code")},
        ))
    return out
