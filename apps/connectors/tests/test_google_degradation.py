import asyncio

from connectors.config import GoogleCredentials, Settings, get_google_creds
from connectors.contract import BrandRef, DateWindow
from connectors.google import GoogleConnector
from connectors.funnel import run

CREDS = GoogleCredentials(developer_token="d", client_id="c", client_secret="s",
                          refresh_token="r", customer_id="123")
WINDOW = DateWindow(since="2026-06-01", until="2026-06-30")
BRAND = BrandRef(brand_id="acme")


def test_google_maps_rows_when_token_works():
    rows = [{"campaign_id": 7, "campaign_name": "Search", "date": "2026-06-01",
             "cost_micros": 5_000_000, "impressions": 100, "clicks": 10,
             "conversions": 3, "conversions_value": 250}]
    conn = GoogleConnector(CREDS, Settings(), searcher=lambda cid, q: rows)
    facts = asyncio.run(conn.fetch_facts(None, WINDOW))
    assert facts[0].platform == "google" and facts[0].spend == 5.0   # micros → currency
    assert facts[0].revenue == 250 and facts[0].conversions == 3


def test_no_google_creds_means_skipped_not_failed(monkeypatch):
    for v in ("GOOGLE_ADS_DEVELOPER_TOKEN", "GOOGLE_ADS_CLIENT_ID", "GOOGLE_ADS_CLIENT_SECRET",
              "GOOGLE_ADS_REFRESH_TOKEN", "GOOGLE_ADS_CUSTOMER_ID"):
        monkeypatch.delenv(v, raising=False)
    assert get_google_creds() is None        # → funnel renders it `skipped`


def test_token_declining_is_logged_and_tolerated_others_proceed():
    # Google token present but the API declines (e.g. unapproved dev token).
    def declined(cid, q):
        raise RuntimeError("DEVELOPER_TOKEN_NOT_APPROVED")

    google = GoogleConnector(CREDS, Settings(), searcher=declined)

    from conftest import FakeConnector, fact
    meta = FakeConnector("meta", facts=[fact("meta", spend=100, revenue=400)])

    snap = asyncio.run(run(BRAND, WINDOW, _connectors=[meta, google]))
    assert snap.status_for("google").state == "failed"
    assert "DEVELOPER_TOKEN_NOT_APPROVED" in snap.status_for("google").detail
    assert snap.status_for("meta").state == "ok"          # Meta unaffected
    assert snap.blended.revenue_meta_pixel == 400         # snapshot still useful


def test_google_health_reports_failure_without_raising():
    def boom(cid, q):
        raise RuntimeError("auth failed")
    status = asyncio.run(GoogleConnector(CREDS, Settings(), searcher=boom).health())
    assert status.state == "failed" and "auth failed" in status.detail
