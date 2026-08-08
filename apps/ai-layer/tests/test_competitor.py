"""Competitor pipeline: aggregates, staleness, storage round-trip (Task 10). No network."""
from ai_layer.competitor import apify_ads, discover, pipeline


def _ad(competitor, days=10.0, cta="SHOP_NOW", text="Flat 50% off silk kurtas",
        video=False, active=True):
    return {"competitor": competitor, "active": active, "active_days": days,
            "cta_type": cta, "primary_text": text, "title": None, "caption": None,
            "card_texts": [], "is_carousel": False, "has_video": video}


def test_aggregate_counts_offers_formats_and_proven_creatives():
    record = {"ads_by_competitor": {
        "A": [_ad("A", days=200.0), _ad("A", days=5.0, text="New drop", cta="LEARN_MORE")],
        "B": [_ad("B", days=90.0, video=True, text="{{product.name}}")],   # template skipped
    }}
    agg = pipeline.aggregate(record)
    assert agg["total_ads"] == 3
    assert agg["offer_pct"] == 33                 # 1 of 3 has an offer phrase
    assert dict(agg["format_mix"])["video"] == 1
    hooks = [h["snippet"] for h in agg["top_hooks"]]
    assert "Flat 50% off silk kurtas" in hooks and all("{{" not in h for h in hooks)
    assert agg["top_hooks"][0]["days"] == 200.0   # longest-running first


def test_name_similarity_resolution():
    assert apify_ads._similar("Manyavar", "Manyavar Official") == 1.0
    assert apify_ads._similar("Manyavar", "Amazon Fashion") < apify_ads.NAME_MATCH
    items = [{"pageName": "Manyavar"}, {"pageName": "Manyavar"}, {"pageName": "Amazon"}]
    assert apify_ads._dominant_page(items) == ("Manyavar", 2)
    kept = apify_ads._filter_to_brand(items, "Manyavar")
    assert len(kept) == 2 and all(i["pageName"] == "Manyavar" for i in kept)


def test_discovery_storage_roundtrip(db_session):
    rec = {"brand": {"name": "X"}, "competitors": [{"name": "Rival"}]}
    discover.save("act_c1", rec)
    assert discover.load("act_c1")["competitors"][0]["name"] == "Rival"
    # ensure() returns the stored record without an LLM call when present
    assert discover.ensure("act_c1", "X")["competitors"][0]["name"] == "Rival"


def test_stored_block_and_staleness(db_session):
    discover.save("act_c2", {"brand_understanding": "sells kurtas",
                             "competitors": [{"name": "R", "tier": "direct",
                                              "confidence": "high", "facebook": "r"}]})
    block = pipeline.stored_block("act_c2")
    assert "R" in block                            # discovery-only block renders
    assert pipeline._is_stale(None) is True
    assert pipeline._is_stale({"scraped_at": "2020-01-01T00:00:00"}) is True


def test_geo_and_context_helpers():
    assert pipeline._country_code("India, US") == "IN"
    assert pipeline._geo_hint(["PS_IND_Sale", "PS_IND_Reels", "US_x"]) .startswith("India")


def test_scrape_does_not_store_raw_payloads_by_default(monkeypatch, db_session):
    """E3: _raw_by_competitor had zero readers, but load_competitor_intel does
    dict(ads_json) on every uncached /chat -- written once, deserialized forever."""
    from ai_layer.competitor import apify_ads

    monkeypatch.setattr(apify_ads.config, "APIFY_TOKEN", "t")
    monkeypatch.setattr(apify_ads, "scrape_competitor",
                        lambda *a, **k: ([{"id": "1", "snapshot": {}}], "handle"))
    monkeypatch.setattr(apify_ads, "normalize_ad", lambda r, n: {"id": r["id"], "brand": n})
    monkeypatch.setattr(apify_ads, "save_ads", lambda *a, **k: None)

    rec = apify_ads.scrape("act_1", {"competitors": [{"name": "Acme"}]})
    assert "_raw_by_competitor" not in rec
    assert rec["total_ads"] == 1, "normalized ads are still stored"


def test_shopify_context_fails_closed_on_tenant_mismatch(monkeypatch):
    """C2: SHOPIFY_STORE/SHOPIFY_TOKEN are process-global with no per-account
    lookup, but build() is per-tenant. Without this guard brand B's refresh sends
    brand A's catalogue to the discovery LLM and stores A's competitors under B."""
    from ai_layer.competitor import pipeline

    monkeypatch.setenv("SHOPIFY_STORE", "shop.example.com")
    monkeypatch.setenv("SHOPIFY_TOKEN", "tok")
    monkeypatch.setattr(pipeline.httpx, "get",
                        lambda *a, **k: (_ for _ in ()).throw(
                            AssertionError("must not call Shopify for another tenant")))

    monkeypatch.setenv("SHOPIFY_ACCOUNT_ID", "act_owner")
    assert pipeline._shopify_context("act_someone_else") is None, "mismatch must fail closed"

    monkeypatch.delenv("SHOPIFY_ACCOUNT_ID", raising=False)
    assert pipeline._shopify_context("act_owner") is None, "unset owner must fail closed"


def test_shopify_context_serves_the_owning_account(monkeypatch):
    """The configured tenant keeps full behaviour."""
    from ai_layer.competitor import pipeline

    monkeypatch.setenv("SHOPIFY_STORE", "shop.example.com")
    monkeypatch.setenv("SHOPIFY_TOKEN", "tok")
    monkeypatch.setenv("SHOPIFY_ACCOUNT_ID", "act_owner")

    class _R:
        status_code = 200
        @staticmethod
        def json():
            return {"products": [{"title": "Kurta", "product_type": "Ethnic"}]}

    monkeypatch.setattr(pipeline.httpx, "get", lambda *a, **k: _R())
    ctx = pipeline._shopify_context("act_owner")
    assert ctx["domain"] == "shop.example.com" and ctx["types"] == ["Ethnic"]


def test_refresh_inside_cooldown_does_not_rebill(monkeypatch, db_session):
    """F1: /competitors/{id}/refresh has no dedupe. A double-click or a client retry
    made both billed legs run again for identical data -- and last-writer-wins can
    leave the stored row thinner than before, so it is double spend for a worse
    result."""
    import datetime as dt
    from ai_layer.competitor import pipeline

    monkeypatch.setattr(pipeline.config, "APIFY_TOKEN", "t")
    monkeypatch.setattr(pipeline, "auto_context",
                        lambda ds: {"brand": "B", "website": None, "category": None,
                                    "geo": None, "notes": None})
    monkeypatch.setattr(pipeline.discover, "ensure",
                        lambda *a, **k: {"competitors": [{"name": "Acme"}]})

    fresh = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    monkeypatch.setattr(pipeline.apify_ads, "load_ads",
                        lambda *a, **k: {"scraped_at": fresh, "ads_by_competitor": {}})
    monkeypatch.setattr(pipeline.apify_ads, "scrape",
                        lambda *a, **k: (_ for _ in ()).throw(
                            AssertionError("must not re-bill Apify inside the cooldown")))

    class _DS:
        account_id, account_name, facts = "act_1", "B", []

    _, meta = pipeline.build("act_1", _DS(), refresh=True)
    assert meta["scraped_now"] is False, "a refresh inside the cooldown must serve cache"


def test_apify_caps_are_env_tunable(monkeypatch):
    """Apify bills per run AND per result, so these two numbers are the sweep cost.
    Local testing must be able to run a fraction of a real sweep."""
    import importlib
    from ai_layer.competitor import apify_ads

    monkeypatch.setenv("COMPETITOR_MAX", "1")
    monkeypatch.setenv("COMPETITOR_ADS_PER", "3")
    reloaded = importlib.reload(apify_ads)
    try:
        assert reloaded.MAX_COMPETITORS == 1 and reloaded.ADS_PER_COMPETITOR == 3
    finally:
        monkeypatch.delenv("COMPETITOR_MAX"); monkeypatch.delenv("COMPETITOR_ADS_PER")
        importlib.reload(apify_ads)
