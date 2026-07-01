"""Cosmisk data connectors — the abstract entry point for the AI layer.

The AI layer imports ONLY this:

    from connectors import get_snapshot, get_assets, BrandRef, DateWindow

and receives typed `UnifiedSnapshot` / `AssetRecord` objects. It never sees a Meta/Shopify/
Google payload, and a failing platform never raises — it shows up in `snapshot.statuses`.
"""
from __future__ import annotations

from .capabilities import (
    CAPABILITIES,
    GOOGLE_METRICS,
    META_METRICS,
    SHOPIFY_METRICS,
    measures,
)
from .contract import (
    AssetRecord,
    Blended,
    BrandRef,
    ConnectorStatus,
    DateWindow,
    UnifiedFact,
    UnifiedSnapshot,
)

__all__ = [
    "get_snapshot", "get_assets",
    "BrandRef", "DateWindow", "UnifiedSnapshot", "UnifiedFact",
    "AssetRecord", "Blended", "ConnectorStatus",
    "META_METRICS", "GOOGLE_METRICS", "SHOPIFY_METRICS", "CAPABILITIES", "measures",
]


def get_snapshot(brand: BrandRef, window: DateWindow,
                 platforms: list[str] | None = None, *,
                 rate_provider=None, target_currency: str | None = None) -> UnifiedSnapshot:
    """Sync facade: fetch + merge all enabled platforms into one UnifiedSnapshot.
    Pass a RateProvider (see connectors.fx) to normalize blended figures across currencies."""
    import asyncio

    from . import funnel
    return asyncio.run(funnel.run(brand, window, platforms,
                                  rate_provider=rate_provider, target_currency=target_currency))


def get_assets(brand: BrandRef, top_n: int = 5,
               platforms: list[str] | None = None) -> list[AssetRecord]:
    """Sync facade: download the winning-creative assets across enabled platforms."""
    import asyncio

    from . import funnel
    return asyncio.run(funnel.run_assets(brand, top_n, platforms))
