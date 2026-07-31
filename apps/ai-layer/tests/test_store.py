"""Tests for the Phase 3 SQLite store: round-trip + trailing-window UPSERT."""
from __future__ import annotations

from datetime import date, timedelta

import pytest

from ai_layer import meta_live as ml
from ai_layer import meta_transform as mt, store


@pytest.fixture(autouse=True)
def _use_db(db_session):
    """Route store.py -> repository -> the rolled-back test-branch transaction."""
    yield


def raw(name, date, spend, purch, rev):
    return dict(
        campaign_id=name, campaign_name=name, date_start=date, date_stop=date,
        spend=str(spend), impressions="1000", reach="800", frequency="1.5",
        clicks="50", ctr="5", cpc="2", cpm="100", inline_link_clicks="40",
        actions=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purch)}],
        action_values=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(rev)}],
        purchase_roas=[],
    )


def ds_of(rows, account_id="act_1", name="Acme", currency="INR"):
    return mt.normalize({"meta": {"account_id": account_id, "account_name": name,
                                  "currency": currency}, "data": rows})


def test_roundtrip_preserves_facts():
    ds = ds_of([raw("A", "2026-05-01", 100, 2, 300), raw("B", "2026-05-01", 50, 1, 100)])
    n = store.upsert_dataset(ds)
    assert n == 2
    back = store.load_dataset("act_1")
    assert len(back) == 2 and back.account_name == "Acme" and back.currency == "INR"
    df = back.to_dataframe()
    assert df.spend.sum() == 150 and df.revenue.sum() == 400


def test_upsert_overwrites_not_duplicates():
    """Re-ingesting the same (account, campaign, date) restates the row in place."""
    store.upsert_dataset(ds_of([raw("A", "2026-05-01", 100, 2, 300)]))
    store.upsert_dataset(ds_of([raw("A", "2026-05-01", 100, 5, 999)]))   # same key, new values
    back = store.load_dataset("act_1")
    assert len(back) == 1                       # not duplicated
    assert back.to_dataframe().revenue.sum() == 999  # restated


def test_ingest_accumulates_new_days():
    """New dates append; old dates stay (trailing-window accumulation)."""
    store.upsert_dataset(ds_of([raw("A", "2026-05-01", 100, 2, 300)]))
    store.upsert_dataset(ds_of([raw("A", "2026-05-01", 100, 2, 300),
                                raw("A", "2026-05-02", 120, 3, 360)]))
    back = store.load_dataset("act_1")
    dates = sorted(f.date for f in back.facts)
    assert dates == ["2026-05-01", "2026-05-02"]


def test_load_window_filters_dates():
    store.upsert_dataset(ds_of([raw("A", "2026-05-01", 100, 2, 300),
                                raw("A", "2026-05-05", 100, 2, 300),
                                raw("A", "2026-05-10", 100, 2, 300)]))
    back = store.load_dataset("act_1", since="2026-05-03", until="2026-05-07")
    assert [f.date for f in back.facts] == ["2026-05-05"]


def test_ingest_day_preset_uses_chunked_range_fetcher(monkeypatch):
    """last_Nd presets must route through fetch_dataset_range (the chunked, adaptive
    fetcher) -- the legacy unchunked fetch_dataset 500s on large accounts past ~21
    daily days. Also asserts the resulting window ends yesterday and spans N days."""
    calls = {}

    def fake_fetch_envelope(token, account, since, until, level="campaign", progress=None):
        calls["token"], calls["account"] = token, account
        calls["since"], calls["until"] = since, until
        return {"meta": {"account_id": account, "account_name": "Acme", "currency": "INR"},
                "data": [raw("A", since.isoformat(), 100, 2, 300)]}

    def legacy_should_not_run(*a, **k):
        raise AssertionError("legacy fetch_dataset must not run for a last_Nd preset")

    monkeypatch.setattr(ml, "fetch_envelope", fake_fetch_envelope)
    monkeypatch.setattr(ml, "fetch_dataset", legacy_should_not_run)

    result = store.ingest("tok", "act_t", preset="last_30d")

    expected_until = date.today() - timedelta(days=1)
    expected_since = expected_until - timedelta(days=29)
    assert calls["since"] == expected_since and calls["until"] == expected_until
    assert calls["account"] == "act_t" and calls["token"] == "tok"

    assert result["rows_upserted"] == 1
    back = store.load_dataset("act_t")
    assert len(back) == 1


def test_ingest_non_day_preset_keeps_legacy_fetch(monkeypatch):
    """Non-day-shaped presets (e.g. "this_month") keep using the legacy
    fetch_dataset -- there's no since/until to chunk against."""
    calls = {"legacy": 0}

    def fake_fetch_dataset(token, account=None, preset="last_30d", level="campaign"):
        calls["legacy"] += 1
        return ds_of([raw("A", "2026-05-01", 100, 2, 300)], account_id=account)

    def range_should_not_run(*a, **k):
        raise AssertionError("fetch_dataset_range must not run for a non-day preset")

    monkeypatch.setattr(ml, "fetch_dataset", fake_fetch_dataset)
    monkeypatch.setattr(ml, "fetch_dataset_range", range_should_not_run)

    store.ingest("tok", "act_m", preset="this_month")
    assert calls["legacy"] == 1


def test_accounts_isolated():
    store.upsert_dataset(ds_of([raw("A", "2026-05-01", 100, 2, 300)], account_id="act_1"))
    store.upsert_dataset(ds_of([raw("X", "2026-05-01", 9, 1, 9)], account_id="act_2", name="Other"))
    assert len(store.load_dataset("act_1")) == 1
    assert store.load_dataset("act_2").account_name == "Other"
    assert len(store.load_dataset("act_missing")) == 0
