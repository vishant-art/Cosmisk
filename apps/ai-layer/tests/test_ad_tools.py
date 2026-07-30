"""Pure ad-level tools: grouping by ad_id, gates, fatigue verdicts (Task 7)."""
from ai_layer import ad_tools


def _f(day, ad_id, ad_name, spend=600.0, revenue=1800.0, purchases=4, adset="AS1",
       impressions=10000.0, link_clicks=200.0, freq=1.5, video_3s=0.0, thruplay=0.0):
    return {"campaign_name": "C", "adset_id": "as-" + adset, "adset_name": adset,
            "ad_id": ad_id, "ad_name": ad_name, "date": day, "spend": spend,
            "revenue": revenue, "purchases": float(purchases), "impressions": impressions,
            "link_clicks": link_clicks, "frequency": freq, "roas": revenue / spend,
            "video_3s": video_3s, "thruplay": thruplay}


def test_top_ads_groups_by_ad_id_not_name():
    facts = [_f("2026-07-01", "a1", "Same Name"), _f("2026-07-01", "a2", "Same Name")]
    out = ad_tools.top_ads(facts, metric="roas", n=5)
    assert out["ads_considered"] == 2          # same name, two distinct ads


def test_top_ads_gates_thin_ads():
    facts = [_f("2026-07-01", "a1", "Big"),
             _f("2026-07-01", "a2", "Tiny", spend=10.0, revenue=100.0, purchases=1)]
    out = ad_tools.top_ads(facts, metric="roas")
    assert [a["ad"] for a in out["ads"]] == ["Big"]


def test_video_hook_rates_ranks_by_hook_not_spend():
    facts = [_f("2026-07-01", "a1", "HighHook", spend=600, video_3s=2000, thruplay=800),
             _f("2026-07-01", "a2", "BigSpendLowHook", spend=6000, video_3s=500, thruplay=100)]
    out = ad_tools.video_hook_rates(facts)
    assert out["ads"][0]["ad"] == "HighHook"
    assert out["ads"][0]["hook_rate"] == 20.0


def test_fatigue_scan_flags_ctr_collapse_with_freq_rise():
    days = [f"2026-07-{d:02d}" for d in range(1, 9)]
    facts = []
    for i, day in enumerate(days):
        good = i < 4
        facts.append(_f(day, "a1", "Fatiguing", spend=600,
                        link_clicks=300.0 if good else 100.0,
                        freq=1.2 if good else 2.0))
    out = ad_tools.ad_fatigue_scan(facts)
    assert out["fatiguing_count"] == 1 and out["ads"][0]["ad"] == "Fatiguing"


def test_execute_dispatch_and_unknowns():
    assert "error" in ad_tools.execute("top_ads", {"metric": "roas"}, [])
    facts = [_f("2026-07-01", "a1", "A")]
    assert ad_tools.execute("nonsense", {}, facts)["error"].startswith("unknown tool")
    # placement_breakdown is deliberately NOT handled here (chat.py owns it)
    assert "error" in ad_tools.execute("placement_breakdown", {}, facts)
