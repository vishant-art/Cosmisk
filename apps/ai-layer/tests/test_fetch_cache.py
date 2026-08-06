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


def test_ad_level_key_separates_same_named_ads(db_session):
    """Two different ads can share a name inside one adset; collapsing them onto
    one key silently loses one ad's spend."""
    today = date(2026, 7, 30)
    day = date(2026, 7, 1)

    def fr(lo, hi):
        return [{"campaign_id": "c1", "adset_name": "as1", "ad_name": "Creative A",
                 "ad_id": "111", "date_start": day.isoformat(), "spend": "10"},
                {"campaign_id": "c1", "adset_name": "as1", "ad_name": "Creative A",
                 "ad_id": "222", "date_start": day.isoformat(), "spend": "20"}]

    rows, _ = fetch_cache.fetch_cached("act_a2", "ad", day, day, fr, today=today)
    assert len(rows) == 2, "same-named ads in one adset must not collapse"
    assert {r["ad_id"] for r in rows} == {"111", "222"}


def test_campaign_level_key_unchanged(db_session):
    """Campaign keys must be byte-identical so existing cached rows keep identity."""
    row = {"campaign_id": "c1", "adset_name": "as1", "ad_name": "n", "ad_id": "999"}
    assert fetch_cache._key(row, "campaign") == "c1|as1|n"
    assert fetch_cache._key(row) == "c1|as1|n"


def test_skipped_days_are_not_marked_fetched(db_session):
    today = date(2026, 7, 30)
    since, until = date(2026, 7, 1), date(2026, 7, 5)

    def fr_with_skip(lo, hi):
        # Meta refused 2026-07-03..2026-07-04; the rest came back.
        rows = [r for r in _rows_for(lo, hi)
                if not ("2026-07-03" <= r["date_start"] <= "2026-07-04")]
        return rows, [("2026-07-03", "2026-07-04", "reduce the amount of data")]

    _, stats = fetch_cache.fetch_cached(ACC, LVL, since, until, fr_with_skip, today=today)
    assert stats["skipped_days"] == 2 and stats["fetched_days"] == 3

    # the skipped days must be retried on the next call, not served as cached holes
    calls = []
    def fr2(lo, hi):
        calls.append((lo, hi))
        return _rows_for(lo, hi), []
    fetch_cache.fetch_cached(ACC, LVL, since, until, fr2, today=today)
    assert calls == [(date(2026, 7, 3), date(2026, 7, 4))]


def test_plain_list_fetcher_still_supported(db_session):
    today = date(2026, 7, 30)
    _, stats = fetch_cache.fetch_cached(ACC, LVL, date(2026, 7, 1), date(2026, 7, 3),
                                        _rows_for, today=today)
    assert stats["fetched_days"] == 3 and stats["skipped_days"] == 0


def test_degraded_path_unwraps_tuple_fetcher(db_session, monkeypatch):
    """The cache must never be a point of failure. With the store down AND a
    tuple-returning fetcher, callers must still get a flat row list -- not
    ((rows, skipped), stats)."""
    def boom(*a, **k):
        raise RuntimeError("simulated cache outage")

    monkeypatch.setattr(fetch_cache._repo, "insight_fetched_dates", boom)
    today = date(2026, 7, 30)
    rows, stats = fetch_cache.fetch_cached(
        ACC, LVL, date(2026, 7, 1), date(2026, 7, 3),
        lambda lo, hi: (_rows_for(lo, hi), []), today=today)
    assert isinstance(rows, list) and len(rows) == 3
    assert all(isinstance(r, dict) for r in rows), "a tuple leaked through as rows"
    assert stats["skipped_days"] == 0


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


def test_cached_rows_honours_since(db_session):
    """D6: cached_rows loaded every row for the account on every context build,
    just to filter a few months out of it in Python."""
    today = date(2026, 7, 30)
    fetch_cache.fetch_cached("act_d6", LVL, date(2026, 6, 1), date(2026, 6, 5),
                             _rows_for, today=today)
    fetch_cache.fetch_cached("act_d6", LVL, date(2026, 7, 1), date(2026, 7, 5),
                             _rows_for, today=today)
    assert len(fetch_cache.cached_rows("act_d6", LVL)) == 10
    assert len(fetch_cache.cached_rows("act_d6", LVL, since="2026-07-01")) == 5
