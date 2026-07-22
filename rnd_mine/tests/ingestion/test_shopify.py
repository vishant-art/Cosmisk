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


# ---------------------------------------------------------------------------
# Mirror asset tests: no network, no real R2.
# ---------------------------------------------------------------------------

async def test_mirror_partial_failure_keeps_pending(monkeypatch):
    """Test that mirror_product_assets preserves pending URIs for failed images."""
    import httpx
    from creative_studio.ingestion.shopify import mirror_product_assets, _fetch_bytes

    # Build a Product with 3 images
    raw = {
        "id": "gid://shopify/Product/test123",
        "title": "Test Product",
        "handle": "test-product",
        "status": "ACTIVE",
        "featuredMedia": {
            "id": "gid://shopify/MediaImage/1",
            "image": {"url": "https://cdn.example/img0.png", "width": 800, "height": 800},
        },
        "media": {
            "nodes": [
                {
                    "id": "gid://shopify/MediaImage/1",
                    "image": {"url": "https://cdn.example/img0.png", "width": 800, "height": 800},
                },
                {
                    "id": "gid://shopify/MediaImage/2",
                    "image": {"url": "https://cdn.example/img1.png", "width": 800, "height": 800},
                },
                {
                    "id": "gid://shopify/MediaImage/3",
                    "image": {"url": "https://cdn.example/img2.png", "width": 800, "height": 800},
                },
            ]
        },
        "priceRangeV2": {
            "minVariantPrice": {"amount": "19.99", "currencyCode": "USD"}
        }
    }

    product = normalize_product(raw)
    original_images = product.original_assets["images"]
    assert len(original_images) == 3

    # Mock _fetch_bytes: img0 succeeds, img1 fails, img2 succeeds
    call_count = [0]

    async def mock_fetch_bytes(client, url):
        idx = call_count[0]
        call_count[0] += 1

        if idx == 0:
            return b"ok0", "image/png"
        elif idx == 1:
            raise httpx.HTTPError("download boom")
        else:  # idx == 2
            return b"ok2", "image/png"

    monkeypatch.setattr("creative_studio.ingestion.shopify._fetch_bytes", mock_fetch_bytes)

    # Mock R2: img0 succeeds, img2 fails
    class FakeR2:
        def __init__(self):
            self.upload_count = 0

        def put_bytes(self, key, data, content_type):
            count = self.upload_count
            self.upload_count += 1

            if count == 0:
                return f"r2://bucket/{key}"
            else:  # count == 1 (img2)
                raise RuntimeError("upload failed")

    fake_r2 = FakeR2()

    # Call mirror_product_assets
    result = await mirror_product_assets(product, fake_r2, "brand123")

    # Assert: function returns a Product (no raise)
    assert isinstance(result, Product)

    result_images = result.original_assets["images"]
    assert len(result_images) == 3

    # img0: download succeeded, upload succeeded -> r2Uri changed
    assert result_images[0]["r2Uri"].startswith("r2://")
    assert not result_images[0]["r2Uri"].startswith("pending:")

    # img1: download failed -> r2Uri still pending
    assert result_images[1]["r2Uri"].startswith("pending:")

    # img2: download succeeded, upload failed -> r2Uri still pending
    assert result_images[2]["r2Uri"].startswith("pending:")

    # Featured flag unchanged
    assert result_images[0]["featured"] is True
    assert result_images[1]["featured"] is False
    assert result_images[2]["featured"] is False

    # Original product unmutated
    assert product.original_assets["images"] == original_images
