"""Tests for the L1 transform module (meta_transform): the trust boundary.

brain.py and chat.py are only as correct as the typed facts this produces from
messy real Meta rows. Locks the researched field choices (link clicks not
all-clicks; website-pixel purchase; derived ROAS). Run:  pytest test_transform.py
"""
from __future__ import annotations

import math

from ai_layer import meta_transform as mt


def raw(**kw):
    base = dict(
        campaign_id="c1", campaign_name="C1", date_start="2026-05-01", date_stop="2026-05-01",
        spend="100", impressions="1000", reach="800", frequency="1.25",
        clicks="50", ctr="5", cpc="2", cpm="100",
        actions=[], action_values=[], purchase_roas=[],
    )
    base.update(kw)
    return base


def pixel_purchase(count, value):
    return (
        [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(count)}],
        [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(value)}],
    )


# --- contract shape ---------------------------------------------------------

def test_fact_is_typed_frozen_contract():
    f = mt.row_to_fact(raw())
    assert isinstance(f, mt.CampaignDayFact)
    try:
        f.spend = 1.0
        assert False, "CampaignDayFact should be frozen"
    except Exception:
        pass


def test_dataframe_has_exact_contract_columns():
    ds = mt.normalize({"meta": {}, "data": [raw()]})
    assert list(ds.to_dataframe().columns) == list(mt.FACT_FIELDS)


# --- link clicks vs all-clicks (the core field-choice fix) ------------------

def test_link_clicks_prefer_inline_field_over_all_clicks():
    f = mt.row_to_fact(raw(
        clicks="100", inline_link_clicks="40",
        actions=[{"action_type": "link_click", "value": "30"}],
    ))
    assert f.clicks == 100.0        # ALL clicks preserved (secondary)
    assert f.link_clicks == 40.0    # inline field wins, NOT clicks(100) or action(30)


def test_link_clicks_fallback_to_link_click_action():
    f = mt.row_to_fact(raw(clicks="100", actions=[{"action_type": "link_click", "value": "30"}]))
    assert f.link_clicks == 30.0    # no inline field -> link_click action


def test_link_ctr_and_cost_prefer_reported_fields():
    f = mt.row_to_fact(raw(
        impressions="1000", spend="100", inline_link_clicks="40",
        inline_link_click_ctr="3.7", cost_per_inline_link_click="2.5",
    ))
    assert math.isclose(f.link_ctr, 3.7)             # reported, not derived 4.0
    assert math.isclose(f.cost_per_link_click, 2.5)  # reported, not derived 2.5


def test_link_ctr_derived_when_absent():
    f = mt.row_to_fact(raw(impressions="1000", inline_link_clicks="40"))
    assert math.isclose(f.link_ctr, 4.0)             # 40/1000*100


# --- canonical purchase = website pixel; omni excluded ----------------------

def test_canonical_purchase_is_website_pixel():
    f = mt.row_to_fact(raw(
        actions=[
            {"action_type": "omni_purchase", "value": "10"},
            {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "8"},
            {"action_type": "onsite_web_purchase", "value": "7"},
            {"action_type": "purchase", "value": "10"},
        ],
        action_values=[
            {"action_type": "omni_purchase", "value": "1060"},
            {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "1000"},
        ],
    ))
    assert f.purchases == 8.0       # pixel, not omni(10)/onsite_web(7)/purchase(10)
    assert f.revenue == 1000.0      # pixel revenue, not omni 1060


def test_omni_and_bare_purchase_excluded():
    """Wrong scope for a website brand -> not counted (only pixel/onsite_conversion)."""
    f = mt.row_to_fact(raw(
        actions=[{"action_type": "omni_purchase", "value": "9"},
                 {"action_type": "purchase", "value": "9"}],
        action_values=[{"action_type": "omni_purchase", "value": "900"}],
    ))
    assert f.purchases == 0.0 and f.revenue == 0.0


def test_falls_back_to_onsite_conversion_purchase():
    f = mt.row_to_fact(raw(
        actions=[{"action_type": "onsite_conversion.purchase", "value": "4"}],
        action_values=[{"action_type": "onsite_conversion.purchase", "value": "500"}],
    ))
    assert f.purchases == 4.0 and f.revenue == 500.0


# --- ROAS is derived, not reported ------------------------------------------

def test_roas_is_derived_not_reported():
    acts, vals = pixel_purchase(2, 250)
    f = mt.row_to_fact(raw(
        spend="100", actions=acts, action_values=vals,
        purchase_roas=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": "9.0"}],
    ))
    assert math.isclose(f.roas, 2.5)   # 250/100 derived, IGNORES reported 9.0


# --- funnel on pixel tier ---------------------------------------------------

def test_atc_checkout_pixel_tier():
    f = mt.row_to_fact(raw(actions=[
        {"action_type": "offsite_conversion.fb_pixel_add_to_cart", "value": "12"},
        {"action_type": "omni_add_to_cart", "value": "20"},
        {"action_type": "offsite_conversion.fb_pixel_initiate_checkout", "value": "5"},
    ]))
    assert f.add_to_cart == 12.0   # pixel, not omni(20)
    assert f.checkout == 5.0


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


# --- normalize / load / aggregates ------------------------------------------

def test_normalize_reads_envelope_meta():
    ds = mt.normalize({"meta": {"account_name": "Acme", "currency": "USD",
                                "date_range": {"since": "2026-05-01", "until": "2026-05-30"}},
                       "data": [raw()]})
    assert ds.account_name == "Acme" and ds.currency == "USD"
    assert ds.since == "2026-05-01" and ds.until == "2026-05-30" and len(ds) == 1


def test_normalize_accepts_bare_list():
    ds = mt.normalize([raw(), raw()])
    assert len(ds) == 2 and ds.currency == "INR"


def test_empty_dataset_to_dataframe():
    assert mt.normalize({"data": []}).to_dataframe().empty


def test_daily_totals_recompute_blended():
    a_acts, a_vals = pixel_purchase(2, 300)
    b_acts, b_vals = pixel_purchase(1, 100)
    rows = [raw(campaign_name="A", spend="100", actions=a_acts, action_values=a_vals),
            raw(campaign_name="B", spend="100", actions=b_acts, action_values=b_vals)]
    daily = mt.daily_totals(mt.normalize({"data": rows}).to_dataframe())
    assert len(daily) == 1
    assert daily.iloc[0].spend == 200 and daily.iloc[0].revenue == 400
    assert math.isclose(daily.iloc[0].roas, 2.0)   # 400/200, NOT avg of 3.0 and 1.0


def test_campaign_summary_groups():
    cs = mt.campaign_summary(mt.normalize(
        {"data": [raw(campaign_name="A"), raw(campaign_name="A"), raw(campaign_name="B")]}
    ).to_dataframe())
    assert set(cs.campaign_name) == {"A", "B"}
    assert "link_ctr" in cs.columns
