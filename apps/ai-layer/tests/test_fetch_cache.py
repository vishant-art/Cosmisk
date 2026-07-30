"""Settled/trailing-7d rule + contiguous-run fetching on the Neon store (Task 5)."""
from datetime import date, timedelta

from ai_layer import fetch_cache

ACC, LVL = "act_fc", "campaign"


def _rows_for(lo, hi):
    out, cur = [], lo
    while cur <= hi:
        out.append({"campaign_id": "c1", "adset_name": "", "ad_name": "",
                    "date_start": cur.isoformat(), "spend": "1"})
        cur += timedelta(days=1)
    return out


def test_fetches_all_then_serves_settled_from_cache(db_session):
    today = date(2026, 7, 30)
    since, until = date(2026, 7, 1), date(2026, 7, 20)
    calls = []
    def fr(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi)
    rows, stats = fetch_cache.fetch_cached(ACC, LVL, since, until, fr, today=today)
    assert len(rows) == 20 and stats["fetched_days"] == 20 and not stats["from_cache"]
    # second call: everything is settled (all dates < today-7) -> zero fetching
    calls.clear()
    rows2, stats2 = fetch_cache.fetch_cached(ACC, LVL, since, until, fr, today=today)
    assert not calls and stats2["from_cache"] and stats2["cached_days"] == 20
    assert len(rows2) == 20


def test_trailing_seven_days_always_refetched(db_session):
    today = date(2026, 7, 30)
    since, until = date(2026, 7, 15), date(2026, 7, 29)
    fetch_cache.fetch_cached(ACC, LVL, since, until, _rows_for, today=today)
    calls = []
    def fr(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi)
    _, stats = fetch_cache.fetch_cached(ACC, LVL, since, until, fr, today=today)
    # floor = 2026-07-23; days 23..29 must be refetched as one contiguous run
    assert calls == [(date(2026, 7, 23), date(2026, 7, 29))]
    assert stats["fetched_days"] == 7 and stats["cached_days"] == 8


def test_settled_middle_never_refetched(db_session):
    today = date(2026, 7, 30)
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 5), date(2026, 7, 10),
                             _rows_for, today=today)
    calls = []
    def fr(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi)
    # wider window around the cached middle -> two runs, hole-free middle skipped
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 1), date(2026, 7, 14), fr, today=today)
    assert calls == [(date(2026, 7, 1), date(2026, 7, 4)),
                     (date(2026, 7, 11), date(2026, 7, 14))]


def test_prune_older_than(db_session):
    today = date(2026, 7, 30)
    fetch_cache.fetch_cached(ACC, LVL, date(2026, 1, 1), date(2026, 1, 3),
                             _rows_for, today=today)
    dropped = fetch_cache.prune_older_than(ACC, LVL, date(2026, 6, 1))
    assert dropped == 3 and fetch_cache.cached_rows(ACC, LVL) == []


def test_write_failure_never_loses_fetched_rows(db_session, monkeypatch):
    from datetime import date
    from ai_layer import fetch_cache

    def boom(*a, **k):
        raise RuntimeError("simulated cache write outage")

    monkeypatch.setattr(fetch_cache._repo, "replace_insight_span", boom)
    today = date(2026, 7, 30)
    rows, stats = fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 1), date(2026, 7, 5),
                                           _rows_for, today=today)
    assert len(rows) == 5                      # fetched data survives the write outage
    assert stats["fetched_days"] == 5 and not stats["from_cache"]
