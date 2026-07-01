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


def _blend_from_sums(meta_spend: float, google_spend: float,
                     meta_rev: float, shop_rev: float) -> Blended:
    ad_spend = meta_spend + google_spend
    truth_rev = shop_rev if shop_rev > 0 else meta_rev
    return Blended(
        spend=ad_spend,
        revenue_meta_pixel=meta_rev,
        revenue_shopify=shop_rev,
        blended_roas=(truth_rev / ad_spend) if ad_spend > 0 else 0.0,
        revenue_gap_pct=((shop_rev - meta_rev) / shop_rev * 100) if shop_rev > 0 else 0.0,
    )


def compute_blended(facts: list[UnifiedFact]) -> Blended:
    """Reconcile ad spend (Meta+Google) against revenue, preferring Shopify as the truth side.
    Currency-agnostic (single-currency assumption); reconcile_blended layers currency on top."""
    return _blend_from_sums(
        sum(f.spend for f in facts if f.platform == "meta"),
        sum(f.spend for f in facts if f.platform == "google"),
        sum(f.revenue for f in facts if f.platform == "meta"),
        sum(f.revenue for f in facts if f.platform == "shopify"),
    )


def reconcile_blended(facts, currencies, *, rate_provider=None, target_currency=None,
                      fx_target=None) -> tuple[Blended, str]:
    """Compute Blended with currency handling. Conversion (when a rate_provider is supplied)
    applies to the blended AGGREGATE only; per-platform facts keep their native currency.
    Returns (Blended, snapshot_currency)."""
    meta_spend = sum(f.spend for f in facts if f.platform == "meta")
    google_spend = sum(f.spend for f in facts if f.platform == "google")
    meta_rev = sum(f.revenue for f in facts if f.platform == "meta")
    shop_rev = sum(f.revenue for f in facts if f.platform == "shopify")

    # Currencies that actually contribute a nonzero figure to the blend.
    contrib: dict[str, str | None] = {}
    if meta_spend or meta_rev:
        contrib["meta"] = currencies.get("meta")
    if google_spend:
        contrib["google"] = currencies.get("google")
    if shop_rev:
        contrib["shopify"] = currencies.get("shopify")
    distinct = {c for c in contrib.values() if c}

    if len(distinct) <= 1:
        common = next(iter(distinct), "")
        b = _blend_from_sums(meta_spend, google_spend, meta_rev, shop_rev)
        b.currency = common
        return b, common

    # Mismatch.
    if rate_provider is not None:
        target = target_currency or fx_target or contrib.get("shopify") or next(iter(distinct))

        def conv(amount: float, base: str | None) -> float:
            if not amount or not base or base == target:
                return amount
            return amount * rate_provider.rate(base, target)

        b = _blend_from_sums(
            conv(meta_spend, contrib.get("meta")),
            conv(google_spend, contrib.get("google")),
            conv(meta_rev, contrib.get("meta")),
            conv(shop_rev, contrib.get("shopify")),
        )
        b.currency = target
        return b, target

    b = _blend_from_sums(meta_spend, google_spend, meta_rev, shop_rev)
    b.currency = "MIXED"
    b.currency_mismatch = True
    return b, "MIXED"


def _currency_from_facts(facts) -> str | None:
    for f in facts:
        c = f.platform_extra.get("currency")
        if c:
            return str(c)
    return None


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
              rate_provider=None, target_currency=None,
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
            status.currency = _currency_from_facts(result)   # surface reported currency
        statuses.append(status)

    currencies = {s.platform: s.currency for s in statuses}
    blended, snap_currency = reconcile_blended(
        facts, currencies, rate_provider=rate_provider,
        target_currency=target_currency, fx_target=settings.fx_target_currency,
    )
    return UnifiedSnapshot(
        brand_id=brand.brand_id, since=window.since, until=window.until,
        currency=snap_currency, facts=facts, blended=blended, statuses=statuses,
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
