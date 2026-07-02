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
    """Pure mapping -- no I/O. Metadata rules are covered in Task 2."""
    facts = tuple(_to_fact(f) for f in snapshot.facts
                  if f.platform not in EXCLUDED_PLATFORMS)
    return mt.Dataset(account_id=account_id, account_name=account_id,
                      currency=snapshot.currency, since=snapshot.since,
                      until=snapshot.until, level="campaign",
                      source="connectors", facts=facts)
