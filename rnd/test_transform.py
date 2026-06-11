"""Tests for the L1 transform module (meta_transform): the trust boundary.

brain.py and chat.py are only as correct as the typed facts this produces from
messy real Meta rows. Run:  pytest test_transform.py
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_transform as mt  # noqa: E402


def raw(**kw):
    base = dict(
        campaign_id="c1", campaign_name="C1", date_start="2026-05-01", date_stop="2026-05-01",
        spend="100", impressions="1000", reach="800", frequency="1.25", clicks="50",
        ctr="5", cpc="2", cpm="100", actions=[], action_values=[], purchase_roas=[],
    )
    base.update(kw)
    return base


# --- contract shape ---------------------------------------------------------

def test_fact_is_typed_contract():
    f = mt.row_to_fact(raw())
    assert isinstance(f, mt.CampaignDayFact)
    # frozen dataclass: immutable
    try:
        f.spend = 1.0
        assert False, "CampaignDayFact should be frozen"
    except Exception:
        pass


def test_dataframe_has_exact_contract_columns():
    ds = mt.normalize({"meta": {}, "data": [raw()]})
    assert list(ds.to_dataframe().columns) == list(mt.FACT_FIELDS)


# --- canonical disambiguation ----------------------------------------------

def test_disambiguation_prefers_pixel_purchase():
    f = mt.row_to_fact(raw(
        actions=[
            {"action_type": "omni_purchase", "value": "10"},
            {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "8"},
            {"action_type": "onsite_web_purchase", "value": "7"},
            {"action_type": "purchase", "value": "9"},
        ],
        action_values=[
            {"action_type": "omni_purchase", "value": "1060"},
            {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "1000"},
        ],
    ))
    assert f.purchases == 8.0     # pixel, not omni/onsite/bare
    assert f.revenue == 1000.0    # pixel revenue, not omni 1060


def test_falls_back_through_priority_when_pixel_absent():
    f = mt.row_to_fact(raw(actions=[{"action_type": "omni_purchase", "value": "5"}]))
    assert f.purchases == 5.0


def test_unrelated_action_types_ignored():
    f = mt.row_to_fact(raw(actions=[
        {"action_type": "post_engagement", "value": "999"},
        {"action_type": "onsite_conversion.messaging_first_reply", "value": "12"},
    ]))
    assert f.purchases == 0.0


# --- robustness -------------------------------------------------------------

def test_missing_arrays_are_zero_not_crash():
    f = mt.row_to_fact(raw(actions=None, action_values=None, purchase_roas=None))
    assert f.purchases == 0.0 and f.revenue == 0.0 and f.roas == 0.0


def test_non_numeric_and_empty_strings_safe():
    f = mt.row_to_fact(raw(spend="not-a-number", clicks="", impressions=None, frequency="N/A"))
    assert f.spend == 0.0 and f.clicks == 0.0 and f.impressions == 0.0


def test_cpa_zero_when_no_purchases():
    f = mt.row_to_fact(raw(spend="100", actions=[], action_values=[]))
    assert f.cpa == 0.0


def test_derived_roas_when_no_purchase_roas_field():
    f = mt.row_to_fact(raw(
        spend="100",
        actions=[{"action_type": "purchase", "value": "5"}],
        action_values=[{"action_type": "purchase", "value": "250"}],
    ))
    assert f.revenue == 250.0 and math.isclose(f.roas, 2.5)


def test_prefers_reported_roas_over_derived():
    f = mt.row_to_fact(raw(
        spend="100",
        action_values=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "250"}],
        purchase_roas=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "3.0"}],
    ))
    assert math.isclose(f.roas, 3.0)   # Meta's reported roas, not derived 2.5


# --- normalize / load / aggregates ------------------------------------------

def test_normalize_reads_envelope_meta():
    ds = mt.normalize({"meta": {"account_name": "Acme", "currency": "USD",
                                "date_range": {"since": "2026-05-01", "until": "2026-05-30"}},
                       "data": [raw()]})
    assert ds.account_name == "Acme" and ds.currency == "USD"
    assert ds.since == "2026-05-01" and ds.until == "2026-05-30" and len(ds) == 1


def test_normalize_accepts_bare_list():
    ds = mt.normalize([raw(), raw()])
    assert len(ds) == 2 and ds.currency == "INR"   # default


def test_empty_dataset_to_dataframe():
    assert mt.normalize({"data": []}).to_dataframe().empty


def test_daily_totals_recompute_blended():
    rows = [
        raw(campaign_name="A", spend="100",
            actions=[{"action_type": "purchase", "value": "2"}],
            action_values=[{"action_type": "purchase", "value": "300"}]),
        raw(campaign_name="B", spend="100",
            actions=[{"action_type": "purchase", "value": "1"}],
            action_values=[{"action_type": "purchase", "value": "100"}]),
    ]
    daily = mt.daily_totals(mt.normalize({"data": rows}).to_dataframe())
    assert len(daily) == 1
    assert daily.iloc[0].spend == 200 and daily.iloc[0].revenue == 400
    assert math.isclose(daily.iloc[0].roas, 2.0)   # 400/200, NOT avg of 3.0 and 1.0


def test_campaign_summary_groups():
    rows = [raw(campaign_name="A"), raw(campaign_name="A"), raw(campaign_name="B")]
    cs = mt.campaign_summary(mt.normalize({"data": rows}).to_dataframe())
    assert set(cs.campaign_name) == {"A", "B"}
