# src/creative_studio/ingestion/shopify.py
"""Live Shopify Admin GraphQL client + Product normalizer for the Creative Studio.

`ShopifyClient` talks to the merchant's real Shopify store (read-only GraphQL
queries). `normalize_product` maps a raw Shopify product node onto the
canonical `Product` contract (schema spec section 14 / "Shopify Mapping").
`mirror_product_assets` downloads each `pending:` original image to R2 so
downstream stages never re-fetch from Shopify's CDN.
"""
from __future__ import annotations

import logging
import mimetypes
import re
from pathlib import Path
from urllib.parse import urlparse

import httpx

from creative_studio.config import get_settings
from creative_studio.contracts import Product, new_id
from creative_studio.storage.r2 import R2Store, key_for

logger = logging.getLogger("creative_studio.ingestion")

_TAG_RE = re.compile(r"<[^>]+>")

_PRODUCTS_QUERY = """
query FetchProducts($first: Int!) {
  products(first: $first) {
    nodes {
      id
      title
      handle
      descriptionHtml
      vendor
      productType
      tags
      status
      featuredMedia {
        ... on MediaImage {
          id
          image { url width height }
        }
      }
      media(first: 10) {
        nodes {
          ... on MediaImage {
            id
            image { url width height }
          }
        }
      }
      variants(first: 20) {
        nodes {
          id
          sku
          title
          price
          selectedOptions { name value }
          image { url }
        }
      }
      collections(first: 10) {
        nodes { title }
      }
      priceRangeV2 {
        minVariantPrice { amount currencyCode }
      }
    }
  }
}
"""

_SHOP_QUERY = """
query FetchShop {
  shop {
    name
    url
    currencyCode
    description
  }
}
"""


class ShopifyError(Exception):
    """Raised when the Shopify Admin GraphQL API rejects a request.

    The message carries only the HTTP status and the first GraphQL error
    message (if any) -- never headers, never the access token.
    """


def _first_error_message(body) -> str | None:
    if not isinstance(body, dict):
        return None
    errors = body.get("errors")
    if not errors:
        return None
    if isinstance(errors, str):
        return errors
    if isinstance(errors, list):
        first = errors[0]
        return first.get("message", str(first)) if isinstance(first, dict) else str(first)
    return str(errors)


class ShopifyClient:
    """Thin async client for the Shopify Admin GraphQL API."""

    def __init__(self, settings) -> None:
        self._settings = settings
        self._endpoint = (
            f"https://{settings.shopify_store}/admin/api/{settings.shopify_api_version}/graphql.json"
        )

    async def _query(self, query: str, variables: dict | None = None) -> dict:
        payload: dict = {"query": query}
        if variables is not None:
            payload["variables"] = variables
        headers = {
            "X-Shopify-Access-Token": self._settings.shopify_token,
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(self._endpoint, json=payload, headers=headers)

        try:
            body = response.json()
        except ValueError:
            body = None

        if response.status_code != 200:
            message = _first_error_message(body) or (response.text[:200] if response.text else "no response body")
            raise ShopifyError(f"Shopify GraphQL request failed: HTTP {response.status_code}: {message}")

        if isinstance(body, dict) and body.get("errors"):
            raise ShopifyError(f"Shopify GraphQL error: {_first_error_message(body)}")

        return (body or {}).get("data", {})

    async def fetch_products(self, limit: int = 25) -> list[dict]:
        """Fetch a single page of up to `limit` products (no cursor loop)."""
        data = await self._query(_PRODUCTS_QUERY, {"first": limit})
        return (data.get("products") or {}).get("nodes") or []

    async def fetch_shop(self) -> dict:
        """Fetch shop-level metadata (name, url, currencyCode, description)."""
        data = await self._query(_SHOP_QUERY)
        return data.get("shop") or {}


def _strip_html(html: str | None) -> str:
    if not html:
        return ""
    return _TAG_RE.sub("", html).strip()


def _extract_images(raw: dict) -> list[dict]:
    """Collect candidate images (id, sourceUrl, width, height) from `media` + `featuredMedia`."""
    images: list[dict] = []
    seen_ids: set[str] = set()

    for node in (raw.get("media") or {}).get("nodes") or []:
        if not isinstance(node, dict):
            continue
        image = node.get("image")
        if not image or not image.get("url"):
            continue
        node_id = node.get("id")
        images.append({
            "id": node_id,
            "sourceUrl": image["url"],
            "width": image.get("width"),
            "height": image.get("height"),
        })
        if node_id:
            seen_ids.add(node_id)

    featured = raw.get("featuredMedia") or {}
    featured_id = featured.get("id") if isinstance(featured, dict) else None
    featured_image = featured.get("image") if isinstance(featured, dict) else None
    if featured_image and featured_image.get("url") and featured_id not in seen_ids:
        images.insert(0, {
            "id": featured_id,
            "sourceUrl": featured_image["url"],
            "width": featured_image.get("width"),
            "height": featured_image.get("height"),
        })

    return images


def _build_original_assets(raw: dict) -> dict:
    candidates = _extract_images(raw)
    featured = raw.get("featuredMedia") or {}
    featured_id = featured.get("id") if isinstance(featured, dict) else None

    images = []
    for i, candidate in enumerate(candidates):
        is_featured = candidate["id"] == featured_id if featured_id else i == 0
        images.append({
            "sourceUrl": candidate["sourceUrl"],
            "width": candidate.get("width"),
            "height": candidate.get("height"),
            "r2Uri": f"pending:{candidate['sourceUrl']}",
            "featured": is_featured,
        })

    # Guarantee exactly one featured=True (constraint from schema spec section 14).
    featured_indices = [i for i, img in enumerate(images) if img["featured"]]
    if images and not featured_indices:
        images[0]["featured"] = True
    elif len(featured_indices) > 1:
        for i in featured_indices[1:]:
            images[i]["featured"] = False

    return {"images": images}


def normalize_product(raw: dict) -> Product:
    """Map a raw Shopify product GraphQL node onto the canonical `Product` contract.

    Missing optional fields are omitted or given sensible defaults. Missing
    title/price/images are NOT defaulted -- they propagate into `Product`'s
    own validator, which raises `pydantic.ValidationError`. That is correct
    behavior: a product without a title, price, or image is not usable.
    """
    money = (raw.get("priceRangeV2") or {}).get("minVariantPrice") or {}
    amount = money.get("amount")

    commercial: dict = {
        "title": raw.get("title"),
        "description": _strip_html(raw.get("descriptionHtml")),
        "price": str(amount) if amount is not None else None,
        "availability": "in_stock" if raw.get("status") == "ACTIVE" else "unavailable",
    }
    if money.get("currencyCode"):
        commercial["currency"] = money["currencyCode"]

    shopify_section = {
        "shopifyProductId": raw.get("id"),
        "handle": raw.get("handle"),
        "vendor": raw.get("vendor"),
        "productType": raw.get("productType"),
        "tags": list(raw.get("tags") or []),
        "status": raw.get("status"),
    }

    variants = []
    for v in (raw.get("variants") or {}).get("nodes") or []:
        if not isinstance(v, dict):
            continue
        options = {
            opt["name"]: opt["value"]
            for opt in (v.get("selectedOptions") or [])
            if isinstance(opt, dict) and "name" in opt
        }
        variant_image = v.get("image") or {}
        variants.append({
            "variantId": v.get("id"),
            "sku": v.get("sku"),
            "title": v.get("title"),
            "price": v.get("price"),
            "options": options,
            "imageUrl": variant_image.get("url"),
        })

    collections = [
        c["title"] for c in (raw.get("collections") or {}).get("nodes") or []
        if isinstance(c, dict) and c.get("title")
    ]

    provider_metadata = {
        "gid": raw.get("id"),
        "apiVersion": get_settings().shopify_api_version,
    }

    return Product(
        id=new_id("product"),
        source="shopify",
        shopify=shopify_section,
        commercial=commercial,
        variants=variants,
        collections=collections,
        original_assets=_build_original_assets(raw),
        provider_metadata=provider_metadata,
    )


def _guess_extension(url: str, content_type: str | None) -> str:
    suffix = Path(urlparse(url).path).suffix
    if suffix:
        return suffix
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if guessed:
            return guessed
    return ".jpg"


async def mirror_product_assets(product: Product, r2: R2Store, brand_id: str) -> Product:
    """Download every `pending:` original image and re-upload it to R2.

    Images that fail to download keep their `pending:` uri and a warning is
    logged; the function still returns a `Product` (never raises for a
    single failed image).
    """
    images = list(product.original_assets.get("images") or [])
    new_images = []

    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        for i, image in enumerate(images):
            uri = image.get("r2Uri", "")
            if not uri.startswith("pending:"):
                new_images.append(image)
                continue

            source_url = uri[len("pending:"):]
            try:
                response = await client.get(source_url)
                response.raise_for_status()
            except httpx.HTTPError as exc:
                logger.warning(
                    "mirror_product_assets: failed to download image %d for product %s: %s",
                    i, product.id, exc,
                )
                new_images.append(image)
                continue

            content_type = response.headers.get("content-type", "image/jpeg")
            ext = _guess_extension(source_url, content_type)
            key = key_for("product_original", brand_id=brand_id, product_id=product.id, filename=f"img{i}{ext}")
            r2_uri = r2.put_bytes(key, response.content, content_type)

            updated_image = dict(image)
            updated_image["r2Uri"] = r2_uri
            new_images.append(updated_image)

    updated_assets = dict(product.original_assets)
    updated_assets["images"] = new_images
    return product.model_copy(update={"original_assets": updated_assets})


if __name__ == "__main__":
    import argparse
    import asyncio
    import json

    async def _capture_fixture() -> None:
        settings = get_settings()
        client = ShopifyClient(settings)
        products = await client.fetch_products(limit=1)
        if not products:
            raise SystemExit("No products returned from the live store; cannot capture fixture")

        fixture_path = Path(__file__).parent / "fixtures" / "shopify_products.json"
        fixture_path.parent.mkdir(parents=True, exist_ok=True)
        fixture_path.write_text(json.dumps([products[0]], indent=2), encoding="utf-8")
        print(f"Captured 1 live product to {fixture_path}")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--capture-fixture", action="store_true",
        help="Fetch one live product and write it to ingestion/fixtures/shopify_products.json",
    )
    args = parser.parse_args()

    if args.capture_fixture:
        asyncio.run(_capture_fixture())
    else:
        parser.print_help()
