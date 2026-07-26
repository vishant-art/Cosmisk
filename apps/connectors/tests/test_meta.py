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
    assert f.roas == 4.0            # 400/100 derived, now first-class
    assert f.link_clicks == 40      # inline link clicks, now first-class
    assert f.platform_extra == {} or set(f.platform_extra) <= {"currency"}  # residue only


def test_row_to_fact_populates_all_metric_fields_and_derives_missing():
    raw = {
        "campaign_id": "c1", "campaign_name": "Promo", "date_start": "2026-06-01",
        "account_currency": "INR",
        "spend": "100", "impressions": "1000", "reach": "800", "clicks": "50",
        "inline_link_clicks": "40",
        # ctr/cpc/link_ctr/cost_per_link_click/cpm/frequency omitted -> derived
        "actions": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "5"},
                    {"action_type": "add_to_cart", "value": "20"},
                    {"action_type": "initiate_checkout", "value": "12"}],
        "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "400"}],
    }
    f = row_to_fact(raw, "act_123")
    assert isinstance(f.impressions, float) and f.impressions == 1000.0
    assert isinstance(f.clicks, float) and f.clicks == 50.0
    assert f.reach == 800.0
    assert round(f.ctr, 2) == 5.0                 # 50/1000*100
    assert round(f.cpc, 2) == 2.0                 # 100/50
    assert round(f.link_ctr, 2) == 4.0            # 40/1000*100
    assert round(f.cost_per_link_click, 2) == 2.5  # 100/40
    assert round(f.cpm, 2) == 100.0               # 100/1000*1000
    assert round(f.frequency, 2) == 1.25          # 1000/800
    assert f.add_to_cart == 20.0 and f.checkout == 12.0
    assert f.conversions == 5.0 and f.revenue == 400.0
    assert round(f.roas, 2) == 4.0 and round(f.cpa, 2) == 20.0
    assert f.platform_extra == {"currency": "INR"}


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


def test_fetch_assets_handles_video_creative_thumbnail_and_source():
    # A video winner: no image_url/image_hash, but a video_id + thumbnail. We must download the
    # thumbnail, classify kind=video, keep video_id as durable_ref, and resolve the source URL.
    ad_rows = {"data": [{"ad_id": "v1", "ad_name": "Vid", "purchase_roas": [{"value": "7.0"}]}]}
    creative = {"creative": {"video_id": "vid_42",
                             "thumbnail_url": "https://scontent.fbcdn.net/thumb.jpg"}}
    video_meta = {"source": "https://video.fbcdn.net/clip.mp4", "permalink_url": "https://fb.com/x"}
    http = FakeHttp(json_map={"/insights": ad_rows, "v1": creative, "vid_42": video_meta},
                    files={"fbcdn.net": b"JPGDATA"})
    conn = MetaConnector(CREDS, Settings(), http=http)
    assets = asyncio.run(conn.fetch_assets(None, top_n=1))
    assert len(assets) == 1
    a = assets[0]
    assert a.kind == "video"
    assert a.durable_ref == "vid_42"                       # durable; source URL re-resolvable from it
    assert a.source_url == "https://video.fbcdn.net/clip.mp4"
    assert a.local_path and a.local_path.endswith(".jpg")  # thumbnail downloaded


def test_fetch_assets_skips_a_broken_winner_keeps_the_rest():
    # One winner's creative call fails (permission error); the batch must not be sunk.
    ad_rows = {"data": [
        {"ad_id": "good", "ad_name": "Good", "purchase_roas": [{"value": "9.0"}]},
        {"ad_id": "bad", "ad_name": "Bad", "purchase_roas": [{"value": "5.0"}]},
    ]}
    creative = {"creative": {"image_url": "https://scontent.fbcdn.net/x.png", "image_hash": "h"}}
    http = FakeHttp(json_map={"/insights": ad_rows, "good": creative},
                    files={"fbcdn.net": b"IMG"},
                    errors={"bad": RuntimeError("permission denied")})
    conn = MetaConnector(CREDS, Settings(), http=http)
    assets = asyncio.run(conn.fetch_assets(None, top_n=2))
    assert [a.entity_name for a in assets] == ["Good"]     # bad skipped, good kept
