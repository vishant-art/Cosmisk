"""Google Ads GAQL rows (already flattened to plain dicts by the client) → UnifiedFact.
Kept dict-based so it's testable with zero gRPC dependency."""
from __future__ import annotations

from ..contract import UnifiedFact

# Daily campaign performance. cost is micros; revenue = conversions_value.
GAQL_CAMPAIGN_DAILY = (
    "SELECT campaign.id, campaign.name, segments.date, metrics.cost_micros, "
    "metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value "
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
        out.append(UnifiedFact(
            platform="google",
            account_id=customer_id,
            entity_id=str(r.get("campaign_id", "")),
            entity_name=r.get("campaign_name", ""),
            date=r.get("date", ""),
            spend=_f(r.get("cost_micros")) / 1_000_000.0,
            impressions=int(_f(r.get("impressions"))),
            clicks=int(_f(r.get("clicks"))),
            conversions=_f(r.get("conversions")),
            revenue=_f(r.get("conversions_value")),
            platform_extra={"cost_micros": r.get("cost_micros")},
        ))
    return out
