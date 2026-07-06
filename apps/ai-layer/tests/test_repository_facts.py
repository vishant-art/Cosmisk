from ai_layer import meta_transform as mt
from ai_layer.db import repository as repo


def _ds(rows, account_id="act_1", name="Acme", currency="INR"):
    return mt.normalize({"meta": {"account_id": account_id, "account_name": name,
                                  "currency": currency}, "data": rows})


def _raw(name, date, spend, purch, rev):
    return dict(campaign_id=name, campaign_name=name, date_start=date, date_stop=date,
                spend=str(spend), impressions="1000", reach="800", frequency="1.5",
                clicks="50", ctr="5", cpc="2", cpm="100", inline_link_clicks="40",
                actions=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purch)}],
                action_values=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(rev)}],
                purchase_roas=[])


def test_roundtrip(db_session):
    n = repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 100, 2, 300),
                                 _raw("B", "2026-05-01", 50, 1, 100)]))
    assert n == 2
    back = repo.load_dataset("act_1")
    assert len(back) == 2 and back.account_name == "Acme" and back.currency == "INR"
    assert back.source == "store" and back.level == "campaign"
    df = back.to_dataframe()
    assert df.spend.sum() == 150 and df.revenue.sum() == 400


def test_upsert_overwrites_not_duplicates(db_session):
    repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 100, 2, 300)]))
    repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 100, 5, 999)]))
    back = repo.load_dataset("act_1")
    assert len(back) == 1 and back.to_dataframe().revenue.sum() == 999


def test_since_until_derived_and_date_is_iso(db_session):
    repo.upsert_dataset(_ds([_raw("A", "2026-05-01", 1, 0, 0),
                             _raw("A", "2026-05-03", 1, 0, 0)]))
    back = repo.load_dataset("act_1")
    assert back.since == "2026-05-01" and back.until == "2026-05-03"
    assert all(isinstance(f.date, str) for f in back.facts)


def test_empty_account_returns_empty_dataset(db_session):
    back = repo.load_dataset("act_missing")
    assert len(back) == 0 and back.facts == ()
    assert back.since is None and back.currency == "INR" and back.account_name == "act_missing"
