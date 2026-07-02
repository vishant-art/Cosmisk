"""Connector-source adapter (#27): UnifiedSnapshot -> the ai-layer Dataset contract.

Feeds cross-platform connector facts (Meta + Google) through the existing
CampaignDayFact pipeline as the opt-in `source="connectors"`. Binding upstream
interface: apps/connectors/CONTRACT.md (v1.0, section 2 mapping table); design:
docs/superpowers/specs/2026-07-02-ai-layer-connector-adapter-design.md.

Shopify facts are shop-level daily revenue, not campaigns -- as campaign rows
they would corrupt every spend-based brain statement, so they are excluded here;
Shopify truth surfaces via snapshot.blended (the #28 route).

This module is the ONLY place in ai_layer allowed to import `connectors`, and it
is only ever lazy-imported (api.py returns 503 when the package is absent).
"""
from __future__ import annotations

from connectors import BrandRef, DateWindow, get_snapshot
from connectors.contract import UnifiedFact, UnifiedSnapshot

from ai_layer import meta_transform as mt

EXCLUDED_PLATFORMS = {"shopify"}   # shop-level rows, not campaigns (see docstring)

# CampaignDayFact fields that copy from UnifiedFact under the same name
# (identity + date + purchases are mapped explicitly).
_COPY_FIELDS = ("spend", "impressions", "reach", "frequency", "clicks", "ctr",
                "cpc", "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
                "add_to_cart", "checkout", "revenue", "roas", "cpa")


def _to_fact(f: UnifiedFact) -> mt.CampaignDayFact:
    metrics = {name: getattr(f, name) for name in _COPY_FIELDS}
    return mt.CampaignDayFact(
        campaign_id=f"{f.platform}:{f.entity_id}",
        campaign_name=f"[{f.platform}] {f.entity_name}",
        date=f.date,
        purchases=f.conversions,
        **metrics,
    )


def snapshot_to_dataset(snapshot: UnifiedSnapshot, account_id: str) -> mt.Dataset:
    """Pure mapping -- no I/O. Platform status and currency caveats ride
    account_name (the one metadata string chat puts in front of the LLM)."""
    facts = tuple(_to_fact(f) for f in snapshot.facts
                  if f.platform not in EXCLUDED_PLATFORMS)
    name = f"{account_id} [connectors: {'+'.join(snapshot.ok_platforms) or 'none'}]"
    if snapshot.blended.currency_mismatch:
        name += "; currency MIXED"
    return mt.Dataset(account_id=account_id, account_name=name,
                      currency=snapshot.currency, since=snapshot.since,
                      until=snapshot.until, level="campaign",
                      source="connectors", facts=facts)


_PRESET_DAYS = {"last_7d": 7, "last_30d": 30, "last_90d": 90}


def fetch_connector_dataset(account_id: str, preset: str = "last_30d",
                            platforms: list[str] | None = None) -> mt.Dataset:
    """Pull a cross-platform snapshot and adapt it. First call can take up to
    ~120s on large accounts (CONTRACT.md section 6) -- ingest-grade, not
    interactive-grade; chat reuses the session context cache across turns."""
    window = DateWindow.last_n_days(_PRESET_DAYS.get(preset, 30))
    brand = BrandRef(
        brand_id=account_id,
        meta_account_id=account_id if account_id.startswith("act_") else None,
    )
    return snapshot_to_dataset(get_snapshot(brand, window, platforms), account_id)
