"""Tests for the connector adapter seam (#27): UnifiedSnapshot -> mt.Dataset.

Offline only -- snapshots are handcrafted; no network, no credentials.
Requires the cosmisk-connectors package (installed editable in the repo venv).
"""
from __future__ import annotations

from connectors.contract import (Blended, ConnectorStatus, UnifiedFact,
                                 UnifiedSnapshot)

from ai_layer import connector_source as cs
from ai_layer import meta_transform as mt


def fact(platform="meta", **kw):
    base = dict(platform=platform, account_id="a1", entity_id="c1",
                entity_name="Camp", date="2026-06-01")
    base.update(kw)
    return UnifiedFact(**base)


def snap(facts, currency="INR", mismatch=False, ok=("meta",)):
    return UnifiedSnapshot(
        brand_id="acme", since="2026-06-01", until="2026-06-30",
        currency=currency, facts=list(facts),
        blended=Blended(currency=currency, currency_mismatch=mismatch),
        statuses=[ConnectorStatus(platform=p, state="ok") for p in ok])


# ---- Task 1: row mapping ----

def test_identity_is_tagged_uniformly_for_all_platforms():
    ds = cs.snapshot_to_dataset(
        snap([fact("meta", entity_id="7", entity_name="Prospecting"),
              fact("google", entity_id="123", entity_name="S_IN_Search")],
             ok=("meta", "google")),
        "acme")
    ids = {f.campaign_id for f in ds.facts}
    names = {f.campaign_name for f in ds.facts}
    assert ids == {"meta:7", "google:123"}
    assert names == {"[meta] Prospecting", "[google] S_IN_Search"}


def test_conversions_map_to_purchases_and_metrics_copy_by_name():
    f = fact("google", spend=10.0, impressions=1000.0, clicks=50.0, ctr=5.0,
             cpc=0.2, cpm=10.0, link_clicks=50.0, link_ctr=5.0,
             cost_per_link_click=0.2, conversions=5.0, revenue=250.0,
             roas=25.0, cpa=2.0)
    row = cs.snapshot_to_dataset(snap([f], ok=("google",)), "acme").facts[0]
    assert isinstance(row, mt.CampaignDayFact)
    assert row.purchases == 5.0                      # conversions -> purchases
    assert row.date == "2026-06-01"
    assert (row.spend, row.impressions, row.clicks) == (10.0, 1000.0, 50.0)
    assert (row.ctr, row.cpc, row.cpm) == (5.0, 0.2, 10.0)
    assert (row.link_clicks, row.link_ctr, row.cost_per_link_click) == (50.0, 5.0, 0.2)
    assert (row.revenue, row.roas, row.cpa) == (250.0, 25.0, 2.0)
    assert (row.reach, row.frequency, row.add_to_cart, row.checkout) == (0.0, 0.0, 0.0, 0.0)


def test_shopify_facts_are_excluded_from_the_dataset():
    ds = cs.snapshot_to_dataset(
        snap([fact("meta"), fact("shopify", entity_id="day", conversions=30.0,
                                 revenue=90000.0)],
             ok=("meta", "shopify")),
        "acme")
    assert len(ds.facts) == 1 and ds.facts[0].campaign_id == "meta:c1"
