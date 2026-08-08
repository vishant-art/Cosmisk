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


def test_upsert_dataset_with_extended_facts(db_session):
    from ai_layer import meta_transform as mt
    from ai_layer.db import repository as repo
    f = mt.row_to_fact({"campaign_id": "c9", "campaign_name": "C9",
                        "date_start": "2026-07-01", "spend": "10", "impressions": "100",
                        "ad_id": "a1", "adset_id": "as1"})
    ds = mt.Dataset(account_id="act_ext", account_name="Ext", currency="INR",
                    since="2026-07-01", until="2026-07-01", level="campaign",
                    source="test", facts=(f,))
    assert repo.upsert_dataset(ds) == 1
    out = repo.load_dataset("act_ext")
    assert len(out) == 1 and out.facts[0].ad_id == ""   # table stores the 20 cols only


def test_save_monthly_facts_writes_distinct_rollups(db_session):
    """E2 guard: with executemany, set_ must use stmt.excluded. Closing over the
    loop variable writes ONE month's rollup to every row -- and the existing
    round-trip tests cannot see it, because their months are identical by
    construction."""
    from ai_layer.db import repository as _repo

    _repo.save_monthly_facts("act_e2", "campaign",
                             {"2026-05": {"spend": 1.0}, "2026-06": {"spend": 2.0}})
    back = _repo.load_monthly_facts("act_e2", "campaign")
    assert back["2026-05"]["spend"] == 1.0 and back["2026-06"]["spend"] == 2.0

    # the conflict path must update only the targeted month
    _repo.save_monthly_facts("act_e2", "campaign", {"2026-06": {"spend": 9.0}})
    back = _repo.load_monthly_facts("act_e2", "campaign")
    assert back["2026-06"]["spend"] == 9.0 and back["2026-05"]["spend"] == 1.0
