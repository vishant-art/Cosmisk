# tests/ingestion/test_shopify.py
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from pydantic import ValidationError

from creative_studio.config import get_settings
from creative_studio.contracts import Product
from creative_studio.ingestion.shopify import ShopifyClient, normalize_product

FIXTURE_PATH = (
    Path(__file__).resolve().parents[2]
    / "src" / "creative_studio" / "ingestion" / "fixtures" / "shopify_products.json"
)


def _load_fixture_product() -> dict:
    with open(FIXTURE_PATH, "r", encoding="utf-8") as f:
        products = json.load(f)
    assert isinstance(products, list) and products, "fixture must be a non-empty list"
    return products[0]


# ---------------------------------------------------------------------------
# Normalizer tests against the captured fixture: no network involved.
# ---------------------------------------------------------------------------

def test_normalize_product_from_fixture():
    raw = _load_fixture_product()

    product = normalize_product(raw)

    assert isinstance(product, Product)
    assert product.commercial["title"]
    assert product.commercial["price"]

    images = product.original_assets["images"]
    assert len(images) >= 1

    featured_count = sum(1 for img in images if img.get("featured") is True)
    assert featured_count == 1

    for img in images:
        assert img["r2Uri"].startswith("pending:")

    assert product.shopify["shopifyProductId"] == raw["id"]
    assert product.source == "shopify"


def test_normalize_missing_price_raises():
    raw = {
        "id": "gid://shopify/Product/0000000000",
        "title": "Minimal Product Without Price",
        "handle": "minimal-product-without-price",
        "status": "ACTIVE",
        "featuredMedia": {
            "id": "gid://shopify/MediaImage/1",
            "image": {"url": "https://cdn.shopify.com/example/a.jpg", "width": 800, "height": 800},
        },
        "media": {
            "nodes": [
                {
                    "id": "gid://shopify/MediaImage/1",
                    "image": {"url": "https://cdn.shopify.com/example/a.jpg", "width": 800, "height": 800},
                }
            ]
        },
        # priceRangeV2 deliberately omitted -> commercial.price is None.
    }

    with pytest.raises(ValidationError):
        normalize_product(raw)


# ---------------------------------------------------------------------------
# Live smoke: exercises the real Shopify store. Read-only GraphQL queries are
# cheap/free. Skips when the Shopify token is not configured, mirroring
# tests/storage/test_r2.py's live-guard pattern.
# ---------------------------------------------------------------------------

def _resolve_shopify_token() -> str:
    try:
        return get_settings().shopify_token
    except Exception:
        return os.environ.get("SHOPIFY_TOKEN", "")


skip_unless_live_shopify = pytest.mark.skipif(
    not _resolve_shopify_token(),
    reason="SHOPIFY_TOKEN not set; skipping live Shopify GraphQL test",
)


@skip_unless_live_shopify
async def test_fetch_products_live():
    client = ShopifyClient(get_settings())

    products = await client.fetch_products(limit=3)

    assert isinstance(products, list)
    assert len(products) >= 1
    assert products[0]["title"]


@skip_unless_live_shopify
async def test_fetch_shop_live():
    client = ShopifyClient(get_settings())

    shop = await client.fetch_shop()

    assert shop["name"]
