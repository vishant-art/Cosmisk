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


# ---- Task 2: dataset metadata ----

def test_metadata_carries_window_currency_and_platform_status():
    ds = cs.snapshot_to_dataset(snap([fact()], ok=("meta", "google")), "acme")
    assert ds.account_id == "acme"
    assert ds.account_name == "acme [connectors: meta+google]"
    assert ds.currency == "INR"
    assert (ds.since, ds.until) == ("2026-06-01", "2026-06-30")
    assert ds.level == "campaign" and ds.source == "connectors"


def test_currency_mismatch_is_labeled_never_silent():
    ds = cs.snapshot_to_dataset(
        snap([fact()], currency="MIXED", mismatch=True), "acme")
    assert ds.currency == "MIXED"
    assert ds.account_name.endswith("; currency MIXED")


def test_all_platforms_down_yields_empty_dataset_not_an_error():
    ds = cs.snapshot_to_dataset(snap([], ok=()), "acme")
    assert len(ds) == 0
    assert ds.account_name == "acme [connectors: none]"


# ---- Task 3: fetch_connector_dataset ----

def test_fetch_maps_preset_to_window_and_act_ids_to_meta_account(monkeypatch):
    seen = {}

    def fake_get_snapshot(brand, window, platforms=None):
        seen.update(brand=brand, window=window, platforms=platforms)
        return snap([fact()])

    monkeypatch.setattr(cs, "get_snapshot", fake_get_snapshot)

    ds = cs.fetch_connector_dataset("act_123", preset="last_7d")
    assert len(ds) == 1 and ds.account_id == "act_123"
    assert seen["brand"].brand_id == "act_123"
    assert seen["brand"].meta_account_id == "act_123"      # act_ rule
    assert seen["platforms"] is None
    from datetime import date
    w = seen["window"]
    span = (date.fromisoformat(w.until) - date.fromisoformat(w.since)).days
    assert span == 6                                       # last_7d inclusive window

    cs.fetch_connector_dataset("pratapsons", preset="nonsense")
    assert seen["brand"].meta_account_id is None           # brand handle -> env fallback
    w = seen["window"]
    span = (date.fromisoformat(w.until) - date.fromisoformat(w.since)).days
    assert span == 29                                      # unknown preset -> 30d


# ---- Task 4: the api seam ----
import sys

import pytest
from fastapi.testclient import TestClient

from ai_layer import api


@pytest.fixture
def client(monkeypatch):
    # This repo's local .env sets AI_LAYER_API_KEY; disable auth for these
    # unauthenticated-client tests (same pattern as tests/test_api.py).
    from ai_layer import config
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    return TestClient(api.app)


def _dataset_for_api():
    return cs.snapshot_to_dataset(
        snap([fact(spend=100.0, conversions=10.0, revenue=800.0, roas=8.0)]),
        "acme")


def test_insights_source_connectors_end_to_end(client, monkeypatch):
    monkeypatch.setattr(cs, "fetch_connector_dataset",
                        lambda account_id, preset="last_30d", platforms=None:
                        _dataset_for_api())
    r = client.get("/insights/acme?source=connectors")
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "connectors"
    assert body["account_name"] == "acme [connectors: meta]"
    assert body["totals"]["spend"] == 100.0 and body["totals"]["purchases"] == 10


def test_empty_connector_snapshot_hits_existing_404(client, monkeypatch):
    monkeypatch.setattr(cs, "fetch_connector_dataset",
                        lambda account_id, preset="last_30d", platforms=None:
                        cs.snapshot_to_dataset(snap([], ok=()), "acme"))
    assert client.get("/insights/acme?source=connectors").status_code == 404


def test_missing_connectors_package_yields_503_with_hint(client, monkeypatch):
    # sys.modules[name] = None makes `from ai_layer import connector_source`
    # raise ImportError -- simulates the package being absent in the image. Also
    # drop the cached attribute on the `ai_layer` package: this test module already
    # did `from ai_layer import connector_source as cs` at import time, so the
    # submodule is cached as a package attribute and the fromlist import would
    # resolve via that attribute, bypassing the sys.modules sentinel.
    import ai_layer
    monkeypatch.delattr(ai_layer, "connector_source", raising=False)
    monkeypatch.setitem(sys.modules, "ai_layer.connector_source", None)
    r = client.get("/insights/acme?source=connectors")
    assert r.status_code == 503
    assert "connectors package" in r.json()["detail"]


def test_default_source_untouched(client, monkeypatch, tmp_path):
    # No connectors involvement on the default path: empty store falls through to
    # the live branch, which 400s without a token. Hermetic: temp store + no env token.
    from ai_layer import config
    monkeypatch.setattr(config, "STORE_DB_PATH", tmp_path / "store.sqlite")
    monkeypatch.setattr(config, "META_ACCESS_TOKEN", None)
    r = client.get("/insights/act_none")
    assert r.status_code == 400


# ---- Task: snapshot cache (#28) ----

@pytest.fixture(autouse=True)
def _fresh_cache():
    # Cache is module-level; isolate every test in this file (incl. the earlier
    # #27 fetch tests, which now populate it via fetch_connector_dataset).
    cs._cache_clear()
    yield
    cs._cache_clear()


def _counting_fetcher(calls):
    def fake(brand, window, platforms=None):
        calls.append(brand.brand_id)
        return snap([fact()])
    return fake


def test_cache_miss_fetches_then_hit_reuses(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    s1, at1 = cs.get_cached_snapshot("acme")
    s2, at2 = cs.get_cached_snapshot("acme")
    assert calls == ["acme"]                 # one fetch, second call served from cache
    assert s1 is s2 and at1 == at2
    assert isinstance(at1, str) and "T" in at1   # ISO timestamp present


def test_cache_expires_after_ttl(monkeypatch):
    monkeypatch.delenv("CONNECTOR_CACHE_TTL_S", raising=False)   # default 3600
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    t = [1000.0]
    monkeypatch.setattr(cs, "_now_s", lambda: t[0])
    cs.get_cached_snapshot("acme")
    t[0] += 3599.0
    cs.get_cached_snapshot("acme")           # still fresh
    t[0] += 2.0
    cs.get_cached_snapshot("acme")           # expired -> refetch
    assert len(calls) == 2


def test_refresh_bypasses_fresh_entry(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    cs.get_cached_snapshot("acme")
    cs.get_cached_snapshot("acme", refresh=True)
    assert len(calls) == 2


def test_cache_keys_isolate_customers_and_presets(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    cs.get_cached_snapshot("acme")
    cs.get_cached_snapshot("globex")                     # other customer -> own entry
    cs.get_cached_snapshot("acme", preset="last_7d")     # other window -> own entry
    cs.get_cached_snapshot("acme")                       # original still cached
    assert calls == ["acme", "globex", "acme"]


def test_cache_key_includes_brand(monkeypatch):
    """Same account_id under different brand_id -> distinct cache entries (multi-tenant)."""
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    cs.get_cached_snapshot("act_1", brand_id="brandA")
    cs.get_cached_snapshot("act_1", brand_id="brandB")   # different brand -> refetch
    cs.get_cached_snapshot("act_1", brand_id="brandA")   # same brand -> cache hit
    assert calls == ["brandA", "brandB"]


def test_cache_caps_entries_evicting_oldest(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    monkeypatch.setattr(cs, "_CACHE_MAX", 2)
    cs.get_cached_snapshot("a")
    cs.get_cached_snapshot("b")
    cs.get_cached_snapshot("c")   # cap hit -> evicts oldest ("a")
    cs.get_cached_snapshot("b")   # still cached
    cs.get_cached_snapshot("a")   # was evicted -> refetch
    assert calls == ["a", "b", "c", "a"]


def test_single_flight_concurrent_requests_share_one_fetch(monkeypatch):
    import threading as th
    calls = []
    gate = th.Event()

    def slow_fetch(brand, window, platforms=None):
        calls.append(1)
        gate.wait(timeout=5)          # hold the fetch open while callers pile up
        return snap([fact()])

    monkeypatch.setattr(cs, "get_snapshot", slow_fetch)
    results = []

    def worker():
        results.append(cs.get_cached_snapshot("acme"))

    threads = [th.Thread(target=worker) for _ in range(5)]
    for t in threads:
        t.start()
    import time as _t
    _t.sleep(0.2)                     # let every thread reach the key lock
    gate.set()
    for t in threads:
        t.join(timeout=10)
    assert len(calls) == 1            # exactly one platform sweep
    assert len(results) == 5
    assert all(r[0] is results[0][0] for r in results)   # all share the snapshot


def test_fetch_connector_dataset_shares_the_cache(monkeypatch):
    calls = []
    monkeypatch.setattr(cs, "get_snapshot", _counting_fetcher(calls))
    cs.get_cached_snapshot("act_9", "last_30d")           # warm the entry
    ds = cs.fetch_connector_dataset("act_9", "last_30d")  # must reuse it
    assert len(calls) == 1
    assert ds.source == "connectors" and ds.account_id == "act_9"


# ---- Task: /blended route (#28) ----

def _rich_snapshot(mismatch=False):
    cur = "MIXED" if mismatch else "INR"
    return UnifiedSnapshot(
        brand_id="acme", since="2026-06-03", until="2026-07-02", currency=cur,
        facts=[],
        blended=Blended(spend=1000.0, revenue_meta_pixel=2500.0,
                        revenue_shopify=3000.0, blended_roas=3.0,
                        revenue_gap_pct=16.67, currency=cur,
                        currency_mismatch=mismatch),
        statuses=[ConnectorStatus(platform="meta", state="ok", fact_count=42,
                                  elapsed_ms=77000, currency="INR"),
                  ConnectorStatus(platform="shopify", state="ok", fact_count=30,
                                  elapsed_ms=3000,
                                  currency="USD" if mismatch else "INR"),
                  ConnectorStatus(platform="google", state="skipped",
                                  detail="no creds")])


def test_blended_route_happy_path(client, monkeypatch):
    monkeypatch.setattr(cs, "get_cached_snapshot",
                        lambda account_id, preset="last_30d", platforms=None, refresh=False:
                        (_rich_snapshot(), "2026-07-03T10:00:00+00:00"))
    r = client.get("/blended/acme")
    assert r.status_code == 200
    body = r.json()
    assert body["account_id"] == "acme"
    assert body["fetched_at"] == "2026-07-03T10:00:00+00:00"
    assert body["window"] == {"since": "2026-06-03", "until": "2026-07-02"}
    assert body["blended"]["blended_roas"] == 3.0
    assert body["blended"]["revenue_shopify"] == 3000.0
    assert body["blended"]["currency_mismatch"] is False
    assert body["ok_platforms"] == ["meta", "shopify"]
    states = {s["platform"]: s["state"] for s in body["statuses"]}
    assert states == {"meta": "ok", "shopify": "ok", "google": "skipped"}


def test_blended_route_mixed_currency_flag_passes_through(client, monkeypatch):
    monkeypatch.setattr(cs, "get_cached_snapshot",
                        lambda *a, **k: (_rich_snapshot(mismatch=True),
                                         "2026-07-03T10:00:00+00:00"))
    body = client.get("/blended/acme").json()
    assert body["blended"]["currency_mismatch"] is True
    assert body["blended"]["currency"] == "MIXED"


def test_blended_route_refresh_and_preset_reach_the_cache(client, monkeypatch):
    seen = {}

    def capture(account_id, preset="last_30d", platforms=None, refresh=False):
        seen.update(account_id=account_id, preset=preset, refresh=refresh)
        return _rich_snapshot(), "2026-07-03T10:00:00+00:00"

    monkeypatch.setattr(cs, "get_cached_snapshot", capture)
    client.get("/blended/acme?preset=last_7d&refresh=true")
    assert seen == {"account_id": "acme", "preset": "last_7d", "refresh": True}


def test_blended_route_404_when_no_platform_contributed(client, monkeypatch):
    monkeypatch.setattr(cs, "get_cached_snapshot",
                        lambda *a, **k: (snap([], ok=()), "2026-07-03T10:00:00+00:00"))
    assert client.get("/blended/acme").status_code == 404


def test_blended_route_503_when_connectors_missing(client, monkeypatch):
    import ai_layer
    monkeypatch.delattr(ai_layer, "connector_source", raising=False)
    monkeypatch.setitem(sys.modules, "ai_layer.connector_source", None)
    r = client.get("/blended/acme")
    assert r.status_code == 503
    assert "connectors package" in r.json()["detail"]
