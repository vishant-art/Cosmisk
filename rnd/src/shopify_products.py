"""Fetch a real product image from the advertiser's Shopify store (Phase 9.6).

The Meta side picks WINNING ADS by ROAS; this picks WINNING PRODUCTS by revenue -- the
store's bestsellers -- and downloads the featured image of each. That image becomes the
`product_image` the creative pipeline already knows how to use (routed through the Bria
cutout), so nothing downstream changes: the product in the ad is a real product from the
store, not a fabricated one.

Mirrors the request shape of the async connector in
`apps/connectors/connectors/shopify/client.py` (read-only reference; apps/ is under the
code freeze and is NOT edited): base `https://{shop}/admin/api/{ver}`, header
`X-Shopify-Access-Token`, `products/{id}.json?fields=id,title,image` -> `image.src`.

`_api` and `_download` are module-level seams so tests run with zero network and $0.
Graceful, like Meta grounding: no creds or a store hiccup yields [] and a log line, never
a crash.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Shopify releases a version each quarter (YYYY-MM: -01/-04/-07/-10), supported ~12 months.
# 2026-07 is the current stable as of this writing; bump quarterly. NOTE: the frozen
# apps/connectors config still pins the stale "2024-10" -- a maintainer should bump it too.
DEFAULT_API_VERSION = "2026-07"


@dataclass
class ShopifyProduct:
    product_id: str
    title: str
    revenue: float
    units: int
    image_src: str | None = None      # durable Shopify CDN url
    local_path: str | None = None     # downloaded featured image (None if nothing usable)


# --- network seams (patched in tests) -----------------------------------------

def _api(url: str, params: dict, headers: dict) -> dict:
    import requests                     # lazy
    r = requests.get(url, params=params, headers=headers, timeout=60)
    if r.status_code >= 400:
        raise RuntimeError(f"Shopify API error ({r.status_code}): {r.text[:160]}")
    return r.json()


def _download(url: str, out_path) -> str:
    import requests                     # lazy
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(requests.get(url, timeout=120).content)
    return str(out)


# --- pure helpers --------------------------------------------------------------

def aggregate_products(orders) -> list[list]:
    """[[product_id, title, revenue, units]] ranked by revenue desc, from order line items.

    Bestseller ranking, the Shopify analogue of ranking Meta ads by ROAS. A line item
    with no product_id (a custom/deleted item) contributes nothing.
    """
    agg: dict[str, list] = {}
    for o in orders or []:
        for li in o.get("line_items", []) or []:
            pid = li.get("product_id")
            if not pid:
                continue
            pid = str(pid)
            try:
                rev = float(li.get("price") or 0) * int(li.get("quantity") or 0)
                units = int(li.get("quantity") or 0)
            except (TypeError, ValueError):
                rev, units = 0.0, 0
            title, r, u = agg.get(pid, (li.get("title", "?"), 0.0, 0))
            agg[pid] = (li.get("title", title), r + rev, u + units)
    ranked = sorted(([pid, t, r, u] for pid, (t, r, u) in agg.items()),
                    key=lambda x: x[2], reverse=True)
    return ranked


def _base(shop: str, api_version: str) -> str:
    return f"https://{shop}/admin/api/{api_version}"


# --- API calls -----------------------------------------------------------------

def fetch_recent_orders(token: str, shop: str, *, days: int = 30, limit: int = 250,
                        api_version: str = DEFAULT_API_VERSION) -> list[dict]:
    """One page of recent orders with only line_items (enough to rank bestsellers for a
    demo). The async connector paginates via the Link header; rnd stays single-page."""
    since = (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT00:00:00Z")
    body = _api(f"{_base(shop, api_version)}/orders.json",
                {"status": "any", "limit": limit, "fields": "id,created_at,line_items",
                 "created_at_min": since},
                {"X-Shopify-Access-Token": token})
    return body.get("orders", []) or []


def product_image_src(token: str, shop: str, product_id: str,
                      api_version: str = DEFAULT_API_VERSION) -> tuple[str | None, str]:
    """(featured image src, title) for one product. The exact call the apps connector uses."""
    body = _api(f"{_base(shop, api_version)}/products/{product_id}.json",
                {"fields": "id,title,image"}, {"X-Shopify-Access-Token": token})
    product = body.get("product", {}) or {}
    src = (product.get("image") or {}).get("src")
    return src, product.get("title", "?")


# --- orchestration -------------------------------------------------------------

def fetch_bestsellers(token: str | None, shop: str | None, *, out_dir, top_n: int = 3,
                      days: int = 30, api_version: str = DEFAULT_API_VERSION,
                      log=print) -> list[ShopifyProduct]:
    """Rank the store's products by revenue and download each bestseller's featured image.

    Returns the picked products (with local_path set when the image downloaded). Never
    blocks: missing creds or an API hiccup yields [] and a log line, exactly like Meta
    grounding degrades to ungrounded.
    """
    if not token or not shop:
        log("[shopify] PRODUCT SOURCE UNAVAILABLE: SHOPIFY_TOKEN/SHOPIFY_STORE not set; "
            "no product picked")
        return []
    out_dir = Path(out_dir)
    try:
        orders = fetch_recent_orders(token, shop, days=days, api_version=api_version)
    except Exception as e:  # noqa: BLE001 -- a store hiccup never blocks a run
        log(f"[shopify] PRODUCT SOURCE UNAVAILABLE: order fetch failed for {shop} "
            f"({e!s:.140}); no product picked")
        return []

    ranked = aggregate_products(orders)[:top_n]
    if not ranked:
        log(f"[shopify] no products found in the last {days}d of orders for {shop}")
        return []

    picks: list[ShopifyProduct] = []
    for i, (pid, title, revenue, units) in enumerate(ranked, 1):
        try:
            src, real_title = product_image_src(token, shop, pid, api_version)
            local = None
            if src:
                local = _download(src, out_dir / f"product_{i:02d}.png")
            picks.append(ShopifyProduct(pid, real_title or title, revenue, units, src, local))
        except Exception as e:  # noqa: BLE001 -- one bad product never sinks the batch
            log(f"[shopify]   product '{str(title)[:40]}' ({pid}) skipped: {e!s:.90}")
    n_img = sum(1 for p in picks if p.local_path)
    log(f"[shopify] {len(picks)} bestseller(s) from {shop}, {n_img} with a downloaded image")
    return picks
