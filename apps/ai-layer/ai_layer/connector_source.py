"""Connector-source adapter (#27): UnifiedSnapshot -> the ai-layer Dataset contract.

Feeds cross-platform connector facts (Meta + Google) through the existing
CampaignDayFact pipeline as the opt-in `source="connectors"`. Binding upstream
interface: apps/connectors/CONTRACT.md (v1.0, section 2 mapping table); design:
docs/superpowers/specs/2026-07-02-ai-layer-connector-adapter-design.md.

Shopify facts are shop-level daily revenue, not campaigns -- as campaign rows
they would corrupt every spend-based brain statement, so they are excluded here;
Shopify truth surfaces via snapshot.blended (the #28 route).

This module is the ONLY place in ai_layer allowed to import `connectors`, and it
is only ever lazy-imported (api.py returns 503 when the package is absent).
"""
from __future__ import annotations

import os
import threading
import time
from datetime import datetime, timezone

from connectors import BrandRef, DateWindow, get_snapshot
from connectors.contract import UnifiedFact, UnifiedSnapshot

from ai_layer import meta_transform as mt

EXCLUDED_PLATFORMS = {"shopify"}   # shop-level rows, not campaigns (see docstring)

# CampaignDayFact fields that copy from UnifiedFact under the same name
# (identity + date + purchases are mapped explicitly).
_COPY_FIELDS = ("spend", "impressions", "reach", "frequency", "clicks", "ctr",
                "cpc", "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
                "add_to_cart", "checkout", "revenue", "roas", "cpa")


def _to_fact(f: UnifiedFact) -> mt.CampaignDayFact:
    metrics = {name: getattr(f, name) for name in _COPY_FIELDS}
    return mt.CampaignDayFact(
        campaign_id=f"{f.platform}:{f.entity_id}",
        campaign_name=f"[{f.platform}] {f.entity_name}",
        date=f.date,
        purchases=f.conversions,
        **metrics,
    )


def snapshot_to_dataset(snapshot: UnifiedSnapshot, account_id: str) -> mt.Dataset:
    """Pure mapping -- no I/O. Platform status and currency caveats ride
    account_name (the one metadata string chat puts in front of the LLM)."""
    facts = tuple(_to_fact(f) for f in snapshot.facts
                  if f.platform not in EXCLUDED_PLATFORMS)
    name = f"{account_id} [connectors: {'+'.join(snapshot.ok_platforms) or 'none'}]"
    if snapshot.blended.currency_mismatch:
        name += "; currency MIXED"
    return mt.Dataset(account_id=account_id, account_name=name,
                      currency=snapshot.currency, since=snapshot.since,
                      until=snapshot.until, level="campaign",
                      source="connectors", facts=facts)


_PRESET_DAYS = {"last_7d": 7, "last_30d": 30, "last_90d": 90}


def fetch_connector_dataset(account_id: str, preset: str = "last_30d",
                            platforms: list[str] | None = None) -> mt.Dataset:
    """Adapt the (cached) cross-platform snapshot. Repeat calls within
    CONNECTOR_CACHE_TTL_S share one platform sweep -- see get_cached_snapshot."""
    snapshot, _ = get_cached_snapshot(account_id, preset, platforms)
    return snapshot_to_dataset(snapshot, account_id)


# ---- snapshot cache (#28) ---------------------------------------------------
# Shared by /insights?source=connectors, /chat, and /blended. TTL sized to the
# platforms' own reporting latency (Meta finalizes over ~24h, Google lags ~3h),
# so an hour-old snapshot is fresher than the sources guarantee. Single-flight:
# concurrent callers for one key share a single platform sweep.
#
# Key is (account_id, preset, platforms). Single-tenant .env credentials make
# account_id sufficient today; when per-brand credentials (I10) land, the
# credential identity MUST join this key.

_CACHE_MAX = 100
_cache: dict[tuple, tuple[float, UnifiedSnapshot, str]] = {}   # key -> (at, snap, fetched_at)
_cache_guard = threading.Lock()
_key_locks: dict[tuple, threading.Lock] = {}


def _now_s() -> float:
    return time.time()


def _ttl_s() -> float:
    return float(os.getenv("CONNECTOR_CACHE_TTL_S", "3600"))


def _cache_clear() -> None:
    with _cache_guard:
        _cache.clear()
        _key_locks.clear()


def _fresh(entry: tuple | None, refresh: bool) -> bool:
    return bool(entry) and not refresh and (_now_s() - entry[0]) < _ttl_s()


def get_cached_snapshot(account_id: str, preset: str = "last_30d",
                        platforms: list[str] | None = None,
                        refresh: bool = False) -> tuple[UnifiedSnapshot, str]:
    """Cached cross-platform snapshot -> (snapshot, fetched_at ISO). One fetch
    per key per TTL window; concurrent requests for the same key block on the
    fetching thread and share its result (bounded by the connector deadline)."""
    key = (account_id, preset, tuple(platforms or ()))
    with _cache_guard:
        entry = _cache.get(key)
        if _fresh(entry, refresh):
            return entry[1], entry[2]
        lock = _key_locks.setdefault(key, threading.Lock())
    with lock:                                   # single-flight per key
        with _cache_guard:                       # double-check after the wait
            entry = _cache.get(key)
            if _fresh(entry, refresh):
                return entry[1], entry[2]
        window = DateWindow.last_n_days(_PRESET_DAYS.get(preset, 30))
        brand = BrandRef(
            brand_id=account_id,
            meta_account_id=account_id if account_id.startswith("act_") else None,
        )
        snapshot = get_snapshot(brand, window, platforms)
        fetched_at = datetime.now(timezone.utc).isoformat()
        with _cache_guard:
            if len(_cache) >= _CACHE_MAX:
                oldest = min(_cache, key=lambda k: _cache[k][0])
                _cache.pop(oldest, None)
            _cache[key] = (_now_s(), snapshot, fetched_at)
        return snapshot, fetched_at
