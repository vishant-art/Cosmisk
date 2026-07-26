"""Per-platform capability sets — the single source of truth for "does this platform measure
this metric?". Semantic: a DERIVED metric counts as measured; only truly-absent metrics are N/A.
A field at 0.0 is a real zero only when it is in that platform's set.

Exported from the package so a future ai-layer import uses this, not a hardcoded copy."""
from __future__ import annotations

METRIC_FIELDS = (
    "spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc",
    "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
    "add_to_cart", "checkout", "conversions", "revenue", "roas", "cpa",
)  # 17 metric fields — order mirrors UnifiedFact / CampaignDayFact

META_METRICS = frozenset(METRIC_FIELDS)                                    # Meta measures/derives all
GOOGLE_METRICS = META_METRICS - {"reach", "frequency", "add_to_cart", "checkout"}
SHOPIFY_METRICS = frozenset({"revenue", "conversions"})                    # orders + revenue only

CAPABILITIES: dict[str, frozenset[str]] = {
    "meta": META_METRICS, "google": GOOGLE_METRICS, "shopify": SHOPIFY_METRICS,
}


def measures(platform: str, field: str) -> bool:
    """True if `platform` actually measures/derives `field` (vs. an N/A 0.0)."""
    return field in CAPABILITIES.get(platform, frozenset())
