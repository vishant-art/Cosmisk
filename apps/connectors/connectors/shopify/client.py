"""Shopify Admin API connector. Revenue here is the truth side of blended ROAS. Cursor
pagination via the Link response header; leaky-bucket-friendly rate. PII-minimized.
"""
from __future__ import annotations

import re
from pathlib import Path

from ..base import Http
from ..config import Settings, ShopifyCredentials
from ..contract import AssetRecord, ConnectorStatus, DateWindow, UnifiedFact
from . import normalize as nz

_NEXT_LINK = re.compile(r'<([^>]+)>;\s*rel="next"')
ASSETS_WINDOW_DAYS = 30   # bound the winning-products scan so get_assets can't hang (#35)


class ShopifyConnector:
    platform = "shopify"

    def __init__(self, creds: ShopifyCredentials, settings: Settings, http: Http | None = None):
        self.creds = creds
        self.settings = settings
        # Shopify REST is a ~2 req/s leaky bucket.
        self.http = http or Http(settings=settings, rate=2.0)
        self._base = f"https://{creds.shop_domain}/admin/api/{creds.api_version}"
        self._headers = {"X-Shopify-Access-Token": creds.admin_token}

    async def _get(self, path_or_url: str, params=None) -> tuple[dict, dict]:
        url = path_or_url if path_or_url.startswith("http") else f"{self._base}/{path_or_url}"
        return await self.http.get_with_headers(url, params=params, headers=self._headers)

    async def _paginate(self, path: str, params: dict, key: str, max_pages=20) -> list[dict]:
        rows, url, p, pages = [], path, dict(params), 0
        while True:
            body, headers = await self._get(url, p)
            rows.extend(body.get(key, []))
            pages += 1
            m = _NEXT_LINK.search(headers.get("link") or headers.get("Link") or "")
            if not m or pages >= max_pages:
                break
            url, p = m.group(1), None       # next URL carries the cursor + params
        return rows

    async def health(self) -> ConnectorStatus:
        await self._get("shop.json", {"fields": "id,name,currency"})
        return ConnectorStatus(platform=self.platform, state="ok")

    async def fetch_facts(self, account_id: str | None, window: DateWindow) -> list[UnifiedFact]:
        orders = await self._paginate("orders.json", {
            "status": "any", "limit": 250, "fields": nz.ORDER_FIELDS,
            "created_at_min": f"{window.since}T00:00:00Z",
            "created_at_max": f"{window.until}T23:59:59Z",
        }, key="orders")
        return nz.orders_to_daily_facts(orders, self.creds.shop_domain)

    async def fetch_assets(self, account_id: str | None, top_n: int) -> list[AssetRecord]:
        # Winning products = top revenue from RECENT order line items; bounded so it can't hang.
        win = DateWindow.last_n_days(ASSETS_WINDOW_DAYS)
        orders = await self._paginate("orders.json", {
            "status": "any", "limit": 250, "fields": nz.ORDER_LINE_FIELDS,
            "created_at_min": f"{win.since}T00:00:00Z",
            "created_at_max": f"{win.until}T23:59:59Z",
        }, key="orders")
        out_dir = Path(self.settings.asset_dir) / "shopify"
        assets: list[AssetRecord] = []
        for i, (pid, title, rev, units) in enumerate(nz.aggregate_products(orders)[:top_n], 1):
            body, _ = await self._get(f"products/{pid}.json", {"fields": "id,title,image"})
            src = ((body.get("product") or {}).get("image") or {}).get("src")
            local = None
            if src:
                try:
                    local = await self.http.download(src, out_dir / f"product_{i:02d}.png")
                except Exception:  # noqa: BLE001 -- a bad image never sinks the set
                    local = None
            assets.append(AssetRecord(
                platform="shopify", entity_id=pid, entity_name=title, kind="image",
                local_path=local, durable_ref=src,
                stats=UnifiedFact(platform="shopify", account_id=self.creds.shop_domain,
                                  entity_id=pid, entity_name=title, date="",  # assets aren't day-scoped
                                  revenue=rev, conversions=units),
            ))
        return assets
