"""Monthly rollups, ensure(), retention skip, rendering (Task 6)."""
from datetime import date

from ai_layer import history

ACC, LVL = "act_h", "campaign"


def _fact(day, camp="C1", spend=100.0, revenue=300.0, purchases=6):
    return {"campaign_name": camp, "date": day, "spend": spend, "revenue": revenue,
            "impressions": 1000.0, "link_clicks": 20.0, "purchases": float(purchases),
            "frequency": 1.5}


def test_months_range_excludes_partial_current_month():
    ms = history.months_range(date(2026, 7, 30), months_back=3)
    assert ms == ["2026-04", "2026-05", "2026-06"]


def test_rollup_math_and_gating():
    facts = [_fact("2026-06-01"), _fact("2026-06-02", spend=50, revenue=50)]
    r = history.rollup(facts)
    assert r["spend"] == 150.0 and r["revenue"] == 350.0
    assert abs(r["roas"] - 350.0 / 150.0) < 1e-4  # rollup rounds roas to 4dp
    assert r["best_campaign"][0] == "C1"
    # a campaign with <5 purchases never ranks
    r2 = history.rollup([_fact("2026-06-01", purchases=2)])
    assert r2["best_campaign"] is None


def test_ensure_builds_missing_and_skips_failing_months(db_session):
    def facts_for_month(first, last):
        if first < date(2026, 5, 1):
            raise RuntimeError("beyond retention")       # one bad month never kills it
        return [_fact(first.isoformat())]
    months = history.ensure(ACC, LVL, facts_for_month, date(2026, 7, 15), months_back=4)
    assert set(months) == {"2026-05", "2026-06"}
    assert months["2026-06"]["mom"] is not None
    # second ensure: only the REBUILD_RECENT_MONTHS tail is recomputed
    calls = []
    def ffm2(first, last):
        calls.append(first.isoformat()[:7])
        return [_fact(first.isoformat())]
    # months_back=2 here so the wanted range is exactly the already-stored
    # REBUILD_RECENT_MONTHS tail -- 2026-03/04 (never persisted) are out of
    # range and must not be retried.
    history.ensure(ACC, LVL, ffm2, date(2026, 7, 15), months_back=2)
    assert calls == ["2026-05", "2026-06"]               # the refresh tail only


def test_render_block_tail(db_session):
    months = {f"2026-{m:02d}": dict(history.rollup([_fact(f"2026-{m:02d}-01")]), mom=None)
              for m in range(1, 7)}
    block = history.render_history_block(months, tail=3)
    assert "3 earlier months stored" in block and "2026-06" in block


def test_load_degrades_to_empty_on_store_error(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("store down")
    monkeypatch.setattr(history._repo, "load_monthly_facts", boom)
    assert history.load(ACC, LVL) == {}


def test_month_bounds_exact():
    assert history.month_bounds("2026-02") == (date(2026, 2, 1), date(2026, 2, 28))
    assert history.month_bounds("2024-02") == (date(2024, 2, 1), date(2024, 2, 29))
    assert history.month_bounds("2026-04") == (date(2026, 4, 1), date(2026, 4, 30))
    assert history.month_bounds("2026-12") == (date(2026, 12, 1), date(2026, 12, 31))


def test_attach_deltas_math():
    months = {
        "2026-05": {"roas": 2.0, "spend": 100.0, "revenue": 200.0},
        "2026-06": {"roas": 3.0, "spend": 150.0, "revenue": 450.0},
    }
    history.attach_deltas(months)
    assert months["2026-05"]["mom"] is None
    assert months["2026-06"]["mom"] == {"roas": 50.0, "spend": 50.0, "revenue": 125.0}
    # zero-prior edge: prior 0 -> 100.0 when recent nonzero
    months2 = {"2026-01": {"roas": 0.0, "spend": 0.0, "revenue": 0.0},
               "2026-02": {"roas": 1.5, "spend": 10.0, "revenue": 15.0}}
    history.attach_deltas(months2)
    assert months2["2026-02"]["mom"] == {"roas": 100.0, "spend": 100.0, "revenue": 100.0}


def test_empty_months_are_memoized_and_not_refetched(db_session):
    """D3: a month Meta genuinely has no data for was never stored, so it landed in
    `todo` on every subsequent call -- one Meta round-trip per empty month, per
    chat, forever. On a development_access app that is the dominant rate consumer."""
    calls = []

    def ffm(first, last):
        calls.append(first.isoformat()[:7])
        return []                       # Meta has nothing for any month

    history.ensure("act_empty", LVL, ffm, date(2026, 7, 15), months_back=4)
    assert len(calls) > 0

    calls.clear()
    history.ensure("act_empty", LVL, ffm, date(2026, 7, 15), months_back=4)
    # only the rebuild window may be refetched; settled empties stay memoized
    assert len(calls) <= history.REBUILD_RECENT_MONTHS, f"empty months refetched: {calls}"


def test_none_from_facts_for_month_is_not_memoized(db_session):
    """`None` means the caller declined this month -- distinct from an empty list.
    Memoizing it would turn 'skip' into a permanent fake-empty month."""
    def ffm(first, last):
        return None

    months = history.ensure("act_none", LVL, ffm, date(2026, 7, 15), months_back=3)
    assert months == {}, "a declined month must not be stored"
