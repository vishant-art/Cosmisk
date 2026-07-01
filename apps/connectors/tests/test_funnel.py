import asyncio

from conftest import FakeConnector, fact

from connectors.config import Settings
from connectors.contract import AssetRecord, BrandRef, DateWindow
from connectors.funnel import compute_blended, run, run_assets

BRAND = BrandRef(brand_id="acme")
WINDOW = DateWindow(since="2026-06-01", until="2026-06-30")


def test_blended_prefers_shopify_revenue_and_sums_ad_spend():
    facts = [
        fact("meta", spend=100, revenue=300),     # pixel revenue
        fact("google", spend=50, revenue=120),
        fact("shopify", revenue=400),             # truth revenue, no spend
    ]
    b = compute_blended(facts)
    assert b.spend == 150                          # meta + google
    assert b.revenue_meta_pixel == 300
    assert b.revenue_shopify == 400
    assert round(b.blended_roas, 4) == round(400 / 150, 4)
    assert b.revenue_gap_pct == 25.0               # (400-300)/400*100


def test_blended_falls_back_to_pixel_when_no_shopify():
    b = compute_blended([fact("meta", spend=100, revenue=250)])
    assert b.revenue_shopify == 0
    assert b.blended_roas == 2.5                    # pixel/spend
    assert b.revenue_gap_pct == 0.0


def test_one_platform_failing_never_sinks_the_snapshot():
    conns = [
        FakeConnector("meta", raise_on=RuntimeError("token expired")),
        FakeConnector("shopify", facts=[fact("shopify", revenue=500)]),
    ]
    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns))
    assert snap.status_for("meta").state == "failed"
    assert "token expired" in snap.status_for("meta").detail
    assert snap.status_for("shopify").state == "ok"
    assert snap.blended.revenue_shopify == 500       # shopify still flowed
    assert len(snap.facts) == 1


def test_missing_platform_is_skipped_not_failed():
    conns = [FakeConnector("meta", facts=[fact("meta", spend=10)])]
    snap = asyncio.run(run(BRAND, WINDOW, platforms=["meta", "shopify", "google"], _connectors=conns))
    assert snap.status_for("meta").state == "ok"
    assert snap.status_for("shopify").state == "skipped"
    assert snap.status_for("google").state == "skipped"


def test_hanging_platform_is_degraded_at_timeout_others_proceed():
    conns = [
        FakeConnector("meta", hang=True),
        FakeConnector("shopify", facts=[fact("shopify", revenue=42)]),
    ]
    fast = Settings(timeout_s=0.2)
    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns, _settings=fast))
    assert snap.status_for("meta").state == "degraded"
    assert snap.status_for("meta").detail == "timeout"
    assert snap.status_for("shopify").state == "ok"
    assert snap.blended.revenue_shopify == 42


def test_run_assets_collects_across_platforms_and_tolerates_failure():
    conns = [
        FakeConnector("meta", assets=[AssetRecord(platform="meta", entity_id="c1", roas=4.0)]),
        FakeConnector("shopify", raise_on=RuntimeError("boom")),
    ]
    assets = asyncio.run(run_assets(BRAND, top_n=3, _connectors=conns))
    assert len(assets) == 1 and assets[0].platform == "meta"
