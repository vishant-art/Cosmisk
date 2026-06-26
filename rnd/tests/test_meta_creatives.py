"""Meta creative retrieval: parse winners, pull image/video assets, download.
All network calls (_api / _download / fetch_ad_insights) are monkeypatched."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import meta_creatives as mc  # noqa: E402


def test_roas_of_parses_purchase_roas():
    assert mc.roas_of({"purchase_roas": [{"action_type": "omni_purchase", "value": "5.0"}]}) == 5.0
    assert mc.roas_of({"website_purchase_roas": [{"value": "3.2"}]}) == 3.2
    assert mc.roas_of({"actions": []}) == 0.0


def test_rank_winners_sorts_and_limits():
    rows = [
        {"ad_id": "a", "ad_name": "A", "purchase_roas": [{"value": "2"}]},
        {"ad_id": "b", "ad_name": "B", "purchase_roas": [{"value": "6"}]},
        {"ad_id": "c", "ad_name": "C", "purchase_roas": [{"value": "4"}]},
    ]
    assert [t[0] for t in mc.rank_winners(rows, 2)] == ["b", "c"]


def test_image_targets_collects_url_and_dedups_hashes():
    creative = {
        "image_url": "https://cdn/x.png",
        "object_story_spec": {"link_data": {"image_hash": "h1",
                                            "child_attachments": [{"image_hash": "h2"}]}},
        "asset_feed_spec": {"images": [{"hash": "h3"}, {"hash": "h1"}]},
    }
    urls, hashes = mc.image_targets(creative)
    assert urls == ["https://cdn/x.png"]
    assert hashes == ["h1", "h2", "h3"]


def test_video_ids_checks_all_three_locations():
    creative = {
        "video_id": "v1",
        "object_story_spec": {"video_data": {"video_id": "v2"}},
        "asset_feed_spec": {"videos": [{"video_id": "v3"}, {"video_id": "v1"}]},
    }
    assert mc.video_ids(creative) == ["v1", "v2", "v3"]


def test_resolve_hashes_batches(monkeypatch):
    cap = {}

    def fake_api(path, params):
        cap["path"], cap["hashes"] = path, params["hashes"]
        return {"data": [{"hash": "h1", "url": "https://cdn/h1.png", "permalink_url": "https://fb/h1"}]}

    monkeypatch.setattr(mc, "_api", fake_api)
    out = mc.resolve_hashes("tok", "act_1", ["h1"])
    assert out["h1"]["url"] == "https://cdn/h1.png"
    assert "adimages" in cap["path"] and json.loads(cap["hashes"]) == ["h1"]


def test_preferred_thumb_picks_preferred():
    video = {"thumbnails": {"data": [{"uri": "u1", "is_preferred": False},
                                     {"uri": "u2", "is_preferred": True}]}}
    assert mc.preferred_thumb(video) == "u2"


def _fake_dl(url, out_path):
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    Path(out_path).write_bytes(b"X")
    return str(out_path)


def test_fetch_winning_creatives_downloads_image(monkeypatch, tmp_path):
    monkeypatch.setattr(mc, "fetch_ad_insights",
                        lambda *a, **k: [{"ad_id": "a", "ad_name": "Hero",
                                          "purchase_roas": [{"value": "6"}]}])
    monkeypatch.setattr(mc, "get_creative", lambda tok, ad: {"image_url": "https://cdn/a.png"})
    seen = []
    monkeypatch.setattr(mc, "_download", lambda u, p: (seen.append(u), _fake_dl(u, p))[1])

    assets = mc.fetch_winning_creatives("tok", "act_1", top_n=1, out_dir=tmp_path)
    assert len(assets) == 1
    a = assets[0]
    assert a.kind == "image" and a.ad_name == "Hero" and a.roas == 6.0
    assert Path(a.local_path).read_bytes() == b"X" and seen == ["https://cdn/a.png"]


def test_fetch_winner_video_source_then_thumb(monkeypatch, tmp_path):
    monkeypatch.setattr(mc, "fetch_ad_insights",
                        lambda *a, **k: [{"ad_id": "v", "ad_name": "Vid",
                                          "purchase_roas": [{"value": "5"}]}])
    monkeypatch.setattr(mc, "get_creative", lambda tok, ad: {"video_id": "v1"})
    monkeypatch.setattr(mc, "_download", _fake_dl)

    monkeypatch.setattr(mc, "get_video",
                        lambda tok, vid: {"source": "https://cdn/v.mp4", "permalink_url": "p"})
    a = mc.fetch_winning_creatives("tok", "act_1", top_n=1, out_dir=tmp_path)[0]
    assert a.kind == "video" and a.has_source is True and a.local_path.endswith(".mp4")

    monkeypatch.setattr(mc, "get_video",
                        lambda tok, vid: {"thumbnails": {"data": [{"uri": "https://cdn/t.png",
                                                                   "is_preferred": True}]}})
    b = mc.fetch_winning_creatives("tok", "act_1", top_n=1, out_dir=tmp_path)[0]
    assert b.kind == "image" and b.has_source is False and b.local_path.endswith(".png")
