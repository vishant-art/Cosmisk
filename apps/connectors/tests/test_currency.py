import asyncio

from conftest import FakeConnector

from connectors.contract import BrandRef, DateWindow, UnifiedFact
from connectors.funnel import run

BRAND = BrandRef(brand_id="acme")
WINDOW = DateWindow(since="2026-06-01", until="2026-06-30")


def _fact(platform, currency, *, spend=0.0, revenue=0.0):
    return UnifiedFact(platform=platform, account_id="a1", entity_id="e1", date="2026-06-01",
                       spend=spend, revenue=revenue, platform_extra={"currency": currency})


def test_single_currency_sets_snapshot_currency_no_mismatch():
    conns = [FakeConnector("meta", facts=[_fact("meta", "USD", spend=100, revenue=300)]),
             FakeConnector("shopify", facts=[_fact("shopify", "USD", revenue=400)])]
    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns))
    assert snap.currency == "USD"
    assert snap.blended.currency == "USD"
    assert snap.blended.currency_mismatch is False
    assert snap.status_for("meta").currency == "USD"


def test_currency_mismatch_without_provider_is_flagged():
    conns = [FakeConnector("meta", facts=[_fact("meta", "USD", spend=100)]),
             FakeConnector("shopify", facts=[_fact("shopify", "INR", revenue=8000)])]
    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns))
    assert snap.currency == "MIXED"
    assert snap.blended.currency_mismatch is True


def test_currency_mismatch_with_provider_converts_and_clears_flag():
    conns = [FakeConnector("meta", facts=[_fact("meta", "USD", spend=100)]),
             FakeConnector("shopify", facts=[_fact("shopify", "INR", revenue=8000)])]

    class FixedRate:   # 1 USD = 80 INR
        def rate(self, base, quote):
            return 80.0 if (base, quote) == ("USD", "INR") else 1.0

    snap = asyncio.run(run(BRAND, WINDOW, _connectors=conns,
                           rate_provider=FixedRate(), target_currency="INR"))
    assert snap.currency == "INR"
    assert snap.blended.currency_mismatch is False
    assert snap.blended.spend == 8000.0                     # 100 USD -> 8000 INR
    assert round(snap.blended.blended_roas, 4) == 1.0       # 8000 INR revenue / 8000 INR spend
