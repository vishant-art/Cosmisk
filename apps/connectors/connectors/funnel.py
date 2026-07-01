"""The aggregator — the one module that knows about all platforms.

Runs each connector concurrently and fault-isolated: a missing/slow/broken platform becomes a
`ConnectorStatus` (skipped/degraded/failed), never an exception, and the snapshot still carries
whatever else succeeded. No single platform can stall or sink the run.
"""
from __future__ import annotations

import asyncio
import logging
import time

from .config import Settings, get_google_creds, get_meta_creds, get_settings, get_shopify_creds
from .contract import (
    AssetRecord,
    Blended,
    BrandRef,
    ConnectorStatus,
    DateWindow,
    UnifiedFact,
    UnifiedSnapshot,
)

logger = logging.getLogger("connectors.funnel")

PLATFORMS = ("meta", "shopify", "google")


def compute_blended(facts: list[UnifiedFact]) -> Blended:
    """Reconcile ad spend (Meta+Google) against revenue, preferring Shopify as the truth side."""
    meta_spend = sum(f.spend for f in facts if f.platform == "meta")
    google_spend = sum(f.spend for f in facts if f.platform == "google")
    ad_spend = meta_spend + google_spend
    meta_rev = sum(f.revenue for f in facts if f.platform == "meta")      # pixel-attributed
    shop_rev = sum(f.revenue for f in facts if f.platform == "shopify")   # truth
    truth_rev = shop_rev if shop_rev > 0 else meta_rev
    return Blended(
        spend=ad_spend,
        revenue_meta_pixel=meta_rev,
        revenue_shopify=shop_rev,
        blended_roas=(truth_rev / ad_spend) if ad_spend > 0 else 0.0,
        revenue_gap_pct=((shop_rev - meta_rev) / shop_rev * 100) if shop_rev > 0 else 0.0,
    )


def _account_for(platform: str, brand: BrandRef) -> str | None:
    return {"meta": brand.meta_account_id, "shopify": brand.shopify_domain,
            "google": brand.google_customer_id}.get(platform)


def _make_connector(platform: str, settings: Settings):
    """Build a real connector from config, or None (→ `skipped`) when creds are absent.
    Lazy imports keep the module tree importable with optional deps (e.g. google-ads) missing."""
    if platform == "meta":
        creds = get_meta_creds()
        if not creds:
            return None
        from .meta import MetaConnector
        return MetaConnector(creds, settings)
    if platform == "shopify":
        creds = get_shopify_creds()
        if not creds:
            return None
        from .shopify import ShopifyConnector
        return ShopifyConnector(creds, settings)
    if platform == "google":
        creds = get_google_creds()
        if not creds:
            return None
        from .google import GoogleConnector
        return GoogleConnector(creds, settings)
    return None


async def _guard(platform, coro, settings: Settings):
    """Run one connector call under a hard timeout, capturing every failure as a status."""
    t0 = time.monotonic()
    try:
        result = await asyncio.wait_for(coro, timeout=settings.timeout_s)
        ms = int((time.monotonic() - t0) * 1000)
        return result, ConnectorStatus(platform=platform, state="ok", elapsed_ms=ms)
    except asyncio.TimeoutError:
        ms = int((time.monotonic() - t0) * 1000)
        logger.warning("[%s] timed out after %.0fs — degraded", platform, settings.timeout_s)
        return None, ConnectorStatus(platform=platform, state="degraded",
                                     detail="timeout", elapsed_ms=ms)
    except Exception as e:  # noqa: BLE001 -- no platform is load-bearing
        ms = int((time.monotonic() - t0) * 1000)
        logger.error("[%s] failed: %s", platform, e)
        return None, ConnectorStatus(platform=platform, state="failed",
                                     detail=str(e)[:200], elapsed_ms=ms)


def _resolve(platforms, settings, _connectors):
    requested = list(platforms) if platforms else list(PLATFORMS)
    inj = {c.platform: c for c in _connectors} if _connectors is not None else None
    out = []
    for p in requested:
        conn = inj.get(p) if inj is not None else _make_connector(p, settings)
        out.append((p, conn))
    return out


async def run(brand: BrandRef, window: DateWindow, platforms=None, *,
              _connectors=None, _settings: Settings | None = None) -> UnifiedSnapshot:
    settings = _settings or get_settings()
    resolved = _resolve(platforms, settings, _connectors)

    statuses: list[ConnectorStatus] = []
    tasks, task_platforms = [], []
    for platform, conn in resolved:
        if conn is None:
            statuses.append(ConnectorStatus(platform=platform, state="skipped",
                                            detail="no credentials"))
            continue
        tasks.append(_guard(platform, conn.fetch_facts(_account_for(platform, brand), window),
                            settings))
        task_platforms.append(platform)

    facts: list[UnifiedFact] = []
    for (result, status), platform in zip(await asyncio.gather(*tasks), task_platforms):
        if result:
            facts.extend(result)
            status.fact_count = len(result)
        statuses.append(status)

    return UnifiedSnapshot(
        brand_id=brand.brand_id, since=window.since, until=window.until,
        facts=facts, blended=compute_blended(facts), statuses=statuses,
    )


async def run_assets(brand: BrandRef, top_n: int = 5, platforms=None, *,
                     _connectors=None, _settings: Settings | None = None) -> list[AssetRecord]:
    settings = _settings or get_settings()
    resolved = _resolve(platforms, settings, _connectors)
    tasks, task_platforms = [], []
    for platform, conn in resolved:
        if conn is None:
            continue
        tasks.append(_guard(platform, conn.fetch_assets(_account_for(platform, brand), top_n),
                            settings))
        task_platforms.append(platform)
    assets: list[AssetRecord] = []
    for result, _status in await asyncio.gather(*tasks):
        if result:
            assets.extend(result)
    return assets
