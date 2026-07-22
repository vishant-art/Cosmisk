# tests/ingestion/test_campaign_normalizers.py
from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError

from creative_studio.config import get_settings
from creative_studio.contracts import Campaign
from creative_studio.ingestion import google_ads, meta


# ---------------------------------------------------------------------------
# Meta: fixture + normalizer
# ---------------------------------------------------------------------------

def test_meta_fixture_loads_two_campaigns():
    campaigns = meta.load_fixture()

    assert isinstance(campaigns, list)
    assert len(campaigns) == 2


def test_meta_normalize_campaign_from_fixture():
    raw = meta.load_fixture()[0]

    campaign = meta.normalize_campaign(raw, product_ids=["product_001", "product_002"])

    assert isinstance(campaign, Campaign)
    assert campaign.campaign_info["objective"] == raw["objective"]
    assert isinstance(campaign.performance["conversions"], int)
    assert campaign.performance["conversions"] == 968
    assert campaign.performance["ctr"] == 5.4
    assert campaign.creative_summary["primaryHook"]
    assert campaign.platforms["meta"] is True
    assert campaign.creative_summary["cta"] == "Shop Now"
    assert campaign.products == ["product_001", "product_002"]
    assert campaign.source == "meta"


# ---------------------------------------------------------------------------
# Meta: fetch_live falls back to fixture when the ad account is unset
# ---------------------------------------------------------------------------

async def test_meta_fetch_live_falls_back_to_fixture(monkeypatch, caplog):
    settings = get_settings()
    monkeypatch.setattr(settings, "meta_ad_account", "")

    with caplog.at_level(logging.WARNING, logger="creative_studio.ingestion"):
        result = await meta.fetch_live(settings)

    assert result == meta.load_fixture()
    assert any(record.levelno == logging.WARNING for record in caplog.records)


# ---------------------------------------------------------------------------
# Google Ads: fixture + normalizer
# ---------------------------------------------------------------------------

def test_google_fixture_loads_two_campaigns():
    campaigns = google_ads.load_fixture()

    assert isinstance(campaigns, list)
    assert len(campaigns) == 2


def test_google_normalize_campaign_from_fixture():
    raw = google_ads.load_fixture()[0]

    campaign = google_ads.normalize_campaign(raw, product_ids=["product_003"])

    assert isinstance(campaign, Campaign)
    assert campaign.platforms["googleAds"] is True
    assert campaign.campaign_info["objective"] == "Performance Max"
    assert campaign.performance["spend"] == 438912.5
    assert campaign.performance["ctr"] == 5.2
    assert campaign.creative_summary["primaryHook"] == raw["headlines"][0]
    assert campaign.products == ["product_003"]
    assert campaign.source == "google"


# ---------------------------------------------------------------------------
# Validation propagation: a missing campaign name must raise, not default
# ---------------------------------------------------------------------------

def test_meta_normalize_missing_name_raises():
    raw = {
        "id": "120299999999999",
        # "name" deliberately omitted -> Campaign validator must reject this.
        "objective": "OUTCOME_SALES",
        "status": "ACTIVE",
        "start_time": "2026-01-01T00:00:00+0530",
        "stop_time": "2026-02-01T00:00:00+0530",
        "insights": {"data": []},
        "adcreatives": {"data": []},
        "targeting_summary": {},
    }

    with pytest.raises(ValidationError):
        meta.normalize_campaign(raw, product_ids=[])
