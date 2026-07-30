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
