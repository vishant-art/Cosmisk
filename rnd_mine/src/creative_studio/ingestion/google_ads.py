# src/creative_studio/ingestion/google_ads.py
"""Google Ads API campaign ingestion for the Creative Studio.

`load_fixture()` reads the captured Google Ads API search-result fixture.
`normalize_campaign` maps a raw `campaign` / `metrics` row onto the
canonical `Campaign` contract (schema spec section 15 / "Google Ads
Mapping").

There is no live client in this module: Cosmisk holds no Google Ads
OAuth credentials or developer token yet. This is fixture-only transport
until those are provisioned (unlike `meta.py`, which has a real
`fetch_live`).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from creative_studio.contracts import Campaign, new_id

_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "google_campaigns.json"


def load_fixture() -> list[dict]:
    """Load the captured Google Ads campaigns fixture (2 Pratap Sons campaigns)."""
    with open(_FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _title_case_underscored(value: str) -> str:
    return value.replace("_", " ").title()


def _normalize_performance(metrics: dict) -> dict[str, Any]:
    performance: dict[str, Any] = {}
    if metrics.get("impressions") is not None:
        performance["impressions"] = int(float(metrics["impressions"]))
    if metrics.get("clicks") is not None:
        performance["clicks"] = int(float(metrics["clicks"]))
    if metrics.get("ctr") is not None:
        performance["ctr"] = round(float(metrics["ctr"]) * 100, 2)  # canonical unit: percent (Meta reports percent natively; Google reports a ratio)
    if metrics.get("conversions") is not None:
        performance["conversions"] = int(float(metrics["conversions"]))
    if metrics.get("costMicros") is not None:
        performance["spend"] = round(float(metrics["costMicros"]) / 1_000_000, 2)
    return performance


def normalize_campaign(raw: dict, product_ids: list[str]) -> Campaign:
    """Map a raw Google Ads API search-result row onto the canonical `Campaign` contract.

    `metrics` and `headlines` are optional and normalize to empty
    sections when absent. `campaign.name`/`campaign.advertisingChannelType`
    are NOT defaulted -- a missing value propagates into `Campaign`'s own
    validator, which raises `pydantic.ValidationError`.
    """
    campaign = raw.get("campaign") or {}
    metrics = raw.get("metrics") or {}
    headlines = list(raw.get("headlines") or [])

    channel_type = campaign.get("advertisingChannelType")
    campaign_info = {
        "campaignName": campaign.get("name"),
        "objective": _title_case_underscored(channel_type) if channel_type else None,
        "status": campaign.get("status"),
    }

    creative_summary: dict[str, Any] = {}
    if headlines:
        creative_summary["primaryHook"] = headlines[0]

    return Campaign(
        id=new_id("campaign"),
        source="google",
        campaign_info=campaign_info,
        platforms={"googleAds": True},
        products=list(product_ids),
        audience={},
        creative_summary=creative_summary,
        performance=_normalize_performance(metrics),
        learnings={"winningHooks": headlines},
    )
