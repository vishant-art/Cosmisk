# src/creative_studio/ingestion/meta.py
"""Meta Graph API campaign ingestion for the Creative Studio.

`load_fixture()` reads the captured Meta Marketing API campaign fixture.
`normalize_campaign` maps a raw Meta Graph API campaign node (nested
`insights` + `adcreatives` + `targeting_summary`) onto the canonical
`Campaign` contract (schema spec section 15 / "Meta Ads Mapping").
`fetch_live` calls the real Graph API when an access token AND an ad
account are both configured; otherwise it logs a warning and falls back
to the fixture so downstream planning code always has campaigns to work
with (mirrors the task-11 constraint: no live Meta ad-account id yet).
"""
from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

from creative_studio.contracts import Campaign, new_id

logger = logging.getLogger("creative_studio.ingestion")

_API_VERSION = "v23.0"
_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "meta_campaigns.json"

_INSIGHTS_FIELDS = "insights{impressions,clicks,ctr,spend}"
_ADCREATIVES_FIELDS = "adcreatives{title,body,call_to_action_type}"
_CAMPAIGN_FIELDS = f"name,objective,status,start_time,stop_time,{_INSIGHTS_FIELDS},{_ADCREATIVES_FIELDS}"


class MetaError(Exception):
    """Raised when the Meta Graph API rejects a campaigns request.

    The message never carries the access token (or any other query-string
    parameter) -- only the bare URL path, HTTP status, and the API's own
    error text, if any.
    """


def load_fixture() -> list[dict]:
    """Load the captured Meta campaigns fixture (2 Pratap Sons campaigns)."""
    with open(_FIXTURE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _title_case_underscored(value: str) -> str:
    return value.replace("_", " ").title()


def _first_purchase_conversions(actions: list[dict]) -> int:
    for action in actions or []:
        if isinstance(action, dict) and action.get("action_type") == "purchase":
            try:
                return int(float(action.get("value", 0)))
            except (TypeError, ValueError):
                return 0
    return 0


def _normalize_audience(targeting: dict) -> dict[str, Any]:
    audience: dict[str, Any] = {}
    if not targeting:
        return audience

    age_min, age_max = targeting.get("age_min"), targeting.get("age_max")
    if age_min is not None and age_max is not None:
        audience["ageRange"] = f"{age_min}-{age_max}"

    genders = targeting.get("genders")
    if genders is not None:
        audience["gender"] = "male" if genders == ["male"] else "all"

    if targeting.get("locations"):
        audience["locations"] = list(targeting["locations"])
    if targeting.get("interests"):
        audience["interests"] = list(targeting["interests"])

    return audience


def _normalize_creative_summary(adcreatives: list[dict]) -> dict[str, Any]:
    if not adcreatives:
        return {}

    first = adcreatives[0]
    summary: dict[str, Any] = {"primaryHook": first.get("title")}
    if first.get("body"):
        summary["description"] = first["body"]
    if first.get("call_to_action_type"):
        summary["cta"] = _title_case_underscored(first["call_to_action_type"])
    return summary


def _normalize_performance(row: dict) -> dict[str, Any]:
    performance: dict[str, Any] = {}
    if row.get("impressions") is not None:
        performance["impressions"] = int(float(row["impressions"]))
    if row.get("clicks") is not None:
        performance["clicks"] = int(float(row["clicks"]))
    if row.get("ctr") is not None:
        performance["ctr"] = float(row["ctr"])  # canonical unit: percent (Graph API ctr is already percentage-scaled)
    if row.get("spend") is not None:
        performance["spend"] = float(row["spend"])

    performance["conversions"] = _first_purchase_conversions(row.get("actions") or [])

    roas_rows = row.get("purchase_roas") or []
    if roas_rows and isinstance(roas_rows[0], dict) and roas_rows[0].get("value") is not None:
        performance["roas"] = float(roas_rows[0]["value"])

    return performance


def normalize_campaign(raw: dict, product_ids: list[str]) -> Campaign:
    """Map a raw Meta Graph API campaign node onto the canonical `Campaign` contract.

    `insights`, `adcreatives`, and `targeting_summary` are optional and
    normalize to empty sections when absent. `name`/`objective` are NOT
    defaulted -- a missing value propagates into `Campaign`'s own
    validator, which raises `pydantic.ValidationError`. That is correct:
    a campaign without a name or objective is not usable for planning.
    """
    campaign_info = {
        "campaignName": raw.get("name"),
        "objective": raw.get("objective"),
        "status": raw.get("status"),
        "startDate": raw.get("start_time"),
        "endDate": raw.get("stop_time"),
    }

    adcreatives = ((raw.get("adcreatives") or {}).get("data")) or []
    insights_rows = ((raw.get("insights") or {}).get("data")) or []

    return Campaign(
        id=new_id("campaign"),
        source="meta",
        campaign_info=campaign_info,
        platforms={"meta": True},
        products=list(product_ids),
        audience=_normalize_audience(raw.get("targeting_summary") or {}),
        creative_summary=_normalize_creative_summary(adcreatives),
        performance=_normalize_performance(insights_rows[0]) if insights_rows else {},
        learnings={"winningHooks": [c.get("title") for c in adcreatives if c.get("title")]},
    )


def _strip_query(url: str) -> str:
    """Return scheme://host/path only -- never the query string (may hold the token)."""
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}{parsed.path}"


def _error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        body = None
    if isinstance(body, dict):
        error = body.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
    return response.text[:200] if response.text else "no response body"


async def fetch_live(settings) -> list[dict]:
    """Fetch campaigns from the real Meta Graph API, or fall back to the fixture.

    Falls back (with a logged warning) unless BOTH `meta_access_token` and
    `meta_ad_account` are configured -- both are required to call the Graph
    API. Raises `MetaError` on a non-200 response; the message never
    includes the access token or any other query parameter.
    """
    if not settings.meta_access_token or not settings.meta_ad_account:
        logger.warning(
            "meta.fetch_live: meta_access_token or meta_ad_account not configured; "
            "falling back to fixture campaigns"
        )
        return load_fixture()

    url = f"https://graph.facebook.com/{_API_VERSION}/act_{settings.meta_ad_account}/campaigns"
    params = {"fields": _CAMPAIGN_FIELDS, "access_token": settings.meta_access_token}

    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(url, params=params)

    if response.status_code != 200:
        raise MetaError(
            f"Meta Graph API request failed: HTTP {response.status_code}: "
            f"{_error_message(response)} (url: {_strip_query(str(response.url))})"
        )

    body = response.json()
    return body.get("data", [])
