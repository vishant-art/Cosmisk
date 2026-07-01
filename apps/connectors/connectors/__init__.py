"""Cosmisk data connectors — the abstract entry point for the AI layer.

The AI layer imports ONLY this:

    from connectors import get_snapshot, get_assets, BrandRef, DateWindow

and receives typed `UnifiedSnapshot` / `AssetRecord` objects. It never sees a Meta/Shopify/
Google payload, and a failing platform never raises — it shows up in `snapshot.statuses`.
"""
from __future__ import annotations

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
]


def get_snapshot(brand: BrandRef, window: DateWindow,
                 platforms: list[str] | None = None) -> UnifiedSnapshot:
    """Sync facade: fetch + merge all enabled platforms into one UnifiedSnapshot."""
    import asyncio

    from . import funnel
    return asyncio.run(funnel.run(brand, window, platforms))


def get_assets(brand: BrandRef, top_n: int = 5,
               platforms: list[str] | None = None) -> list[AssetRecord]:
    """Sync facade: download the winning-creative assets across enabled platforms."""
    import asyncio

    from . import funnel
    return asyncio.run(funnel.run_assets(brand, top_n, platforms))
