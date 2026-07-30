"""Repository round-trips for the intelligence stores (Task 2)."""
from ai_layer.db import repository as repo

ACC, LVL = "act_test1", "campaign"


def _raw(day, camp="c1", adset="", ad=""):
    return {"campaign_id": camp, "adset_name": adset, "ad_name": ad,
            "date_start": day, "spend": "10.0", "actions": [{"action_type": "x", "value": "1"}]}


def test_insight_span_roundtrip(db_session):
    assert repo.insight_fetched_dates(ACC, LVL) == set()
    rows = [("2026-07-01", "c1||", _raw("2026-07-01")),
            ("2026-07-02", "c1||", _raw("2026-07-02"))]
    repo.replace_insight_span(ACC, LVL, ["2026-07-01", "2026-07-02"], rows)
    repo.mark_insight_fetched(ACC, LVL, ["2026-07-01", "2026-07-02"])
    assert repo.insight_fetched_dates(ACC, LVL) == {"2026-07-01", "2026-07-02"}
    out = repo.load_insight_rows(ACC, LVL)
    assert [r["date_start"] for r in out] == ["2026-07-01", "2026-07-02"]
    assert out[0]["actions"][0]["value"] == "1"          # raw preserved verbatim


def test_replace_span_upserts_cleanly(db_session):
    repo.replace_insight_span(ACC, LVL, ["2026-07-01"],
                              [("2026-07-01", "c1||", _raw("2026-07-01"))])
    # re-fetch the same span with a revised row -> old row replaced, not duplicated
    revised = _raw("2026-07-01"); revised["spend"] = "99.0"
    repo.replace_insight_span(ACC, LVL, ["2026-07-01"],
                              [("2026-07-01", "c1||", revised)])
    out = repo.load_insight_rows(ACC, LVL)
    assert len(out) == 1 and out[0]["spend"] == "99.0"


def test_insight_range_filter_and_prune(db_session):
    for d in ("2026-01-05", "2026-06-05"):
        repo.replace_insight_span(ACC, LVL, [d], [(d, "c1||", _raw(d))])
        repo.mark_insight_fetched(ACC, LVL, [d])
    assert len(repo.load_insight_rows(ACC, LVL, since="2026-06-01")) == 1
    dropped = repo.prune_insight_rows(ACC, LVL, "2026-06-01")
    assert dropped == 1
    assert repo.insight_fetched_dates(ACC, LVL) == {"2026-06-05"}   # log pruned too


def test_monthly_facts_roundtrip(db_session):
    assert repo.load_monthly_facts(ACC, LVL) == {}
    months = {"2026-05": {"roas": 3.1, "spend": 100.0, "mom": None}}
    repo.save_monthly_facts(ACC, LVL, months)
    months["2026-06"] = {"roas": 2.9, "spend": 90.0, "mom": {"roas": -6.5}}
    repo.save_monthly_facts(ACC, LVL, months)
    out = repo.load_monthly_facts(ACC, LVL)
    assert set(out) == {"2026-05", "2026-06"} and out["2026-06"]["mom"]["roas"] == -6.5


def test_competitor_intel_roundtrip(db_session):
    assert repo.load_competitor_intel(ACC) is None
    repo.save_competitor_discovery(ACC, {"competitors": [{"name": "X"}]})
    intel = repo.load_competitor_intel(ACC)
    assert intel["discovery"]["competitors"][0]["name"] == "X"
    assert intel["ads"] is None
    repo.save_competitor_ads(ACC, {"total_ads": 3})
    intel = repo.load_competitor_intel(ACC)
    assert intel["ads"]["total_ads"] == 3 and intel["scraped_at"] is not None
