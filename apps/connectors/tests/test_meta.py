import asyncio

from conftest import FakeHttp

from connectors.config import MetaCredentials, Settings
from connectors.contract import DateWindow
from connectors.meta import MetaConnector
from connectors.meta.normalize import row_to_fact

CREDS = MetaCredentials(access_token="t", ad_account_id="act_123")
WINDOW = DateWindow(since="2026-06-01", until="2026-06-02")


def test_row_to_fact_uses_pixel_purchase_and_derived_roas():
    raw = {
        "campaign_id": "c1", "campaign_name": "Promo", "date_start": "2026-06-01",
        "spend": "100", "impressions": "1000", "clicks": "50",
        "inline_link_clicks": "40",
        "actions": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "5"},
                    {"action_type": "add_to_cart", "value": "20"}],
        "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "400"}],
    }
    f = row_to_fact(raw, "act_123")
    assert f.platform == "meta" and f.entity_id == "c1"
    assert f.spend == 100 and f.conversions == 5 and f.revenue == 400
    assert f.platform_extra["roas"] == 4.0          # 400/100 derived
    assert f.platform_extra["link_clicks"] == 40


def test_fetch_facts_paginates_and_normalizes():
    page1 = {"data": [{"campaign_id": "c1", "campaign_name": "A", "date_start": "2026-06-01",
                       "spend": "10"}],
             "paging": {"next": "https://graph.facebook.com/next-page"}}
    page2 = {"data": [{"campaign_id": "c2", "campaign_name": "B", "date_start": "2026-06-01",
                       "spend": "20"}]}
    http = FakeHttp(json_map={"/insights": page1, "next-page": page2})
    conn = MetaConnector(CREDS, Settings(), http=http)
    facts = asyncio.run(conn.fetch_facts(None, WINDOW))
    assert [f.entity_id for f in facts] == ["c1", "c2"]    # both pages merged
    assert facts[1].spend == 20


def test_fetch_assets_ranks_by_roas_and_downloads():
    ad_rows = {"data": [
        {"ad_id": "a1", "ad_name": "Low", "purchase_roas": [{"value": "1.0"}]},
        {"ad_id": "a2", "ad_name": "High", "purchase_roas": [{"value": "9.0"}]},
    ]}
    creative = {"creative": {"image_url": "https://scontent.fbcdn.net/x.png", "image_hash": "h9"}}
    http = FakeHttp(json_map={"/insights": ad_rows, "a2": creative, "a1": creative},
                    files={"fbcdn.net": b"PNGDATA"})
    conn = MetaConnector(CREDS, Settings(), http=http)
    assets = asyncio.run(conn.fetch_assets(None, top_n=1))
    assert len(assets) == 1
    assert assets[0].entity_name == "High"            # ranked winner first
    assert assets[0].local_path and assets[0].durable_ref == "h9"
