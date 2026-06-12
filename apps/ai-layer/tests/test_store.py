"""Tests for the Phase 3 SQLite store: round-trip + trailing-window UPSERT."""
from __future__ import annotations

import pytest

from ai_layer import config, meta_transform as mt, store


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Point the store at a throwaway DB so tests never touch the real one."""
    monkeypatch.setattr(config, "STORE_DB_PATH", tmp_path / "store.sqlite")
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


def test_accounts_isolated():
    store.upsert_dataset(ds_of([raw("A", "2026-05-01", 100, 2, 300)], account_id="act_1"))
    store.upsert_dataset(ds_of([raw("X", "2026-05-01", 9, 1, 9)], account_id="act_2", name="Other"))
    assert len(store.load_dataset("act_1")) == 1
    assert store.load_dataset("act_2").account_name == "Other"
    assert len(store.load_dataset("act_missing")) == 0
