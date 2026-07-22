# tests/replacement/test_pipeline.py
"""Unit tests for the product-truth replacement pipeline (Task 21):
BiRefNet cutout extraction (`prepare_product_assets`) + BRIA placement of
that cutout onto an already-rendered scene keyframe (`replace_on_keyframe`).

Drives both functions through a local `FakeAdapter` (mirrors
`tests/generation/test_fal_adapters.py::FakeFalAdapter` -- records every
`(model_id, arguments)` submit call and every download url, returns one
canned result per instance, shaped exactly like the real fal responses per
that module's docstring) and the shared `FakeR2` double from the
project-root conftest. No fal_client, no httpx, no boto3, no network --
these tests can never spend money.
"""
from __future__ import annotations

import pytest

from creative_studio.contracts import Product
from creative_studio.generation.adapters.base import MODEL_IDS
from creative_studio.replacement.pipeline import prepare_product_assets, replace_on_keyframe

BRAND_ID = "brand1"

_ORIGINAL_URI = "r2://test-bucket/creative-studio/brands/brand1/products/product1/original/img0.jpg"
_SOURCE_URL = "https://cdn.shopify.com/files/product.jpg"


class FakeAdapter:
    """Records every `(model_id, arguments)` submit call and every download
    url. Returns the single canned `result` dict for every `submit` call
    (each test constructs its own instance, since each pipeline function
    submits to exactly one model)."""

    def __init__(self, result: dict) -> None:
        self.result = result
        self.calls: list[tuple[str, dict]] = []
        self.download_urls: list[str] = []

    async def submit(self, model_id: str, arguments: dict) -> dict:
        self.calls.append((model_id, arguments))
        return self.result

    async def download(self, url: str) -> bytes:
        self.download_urls.append(url)
        return b"fake-bytes"


def _make_product(**overrides) -> Product:
    images = overrides.pop("images", None)
    if images is None:
        images = [{"sourceUrl": _SOURCE_URL, "r2Uri": _ORIGINAL_URI, "featured": True}]
    data: dict = dict(
        id="product1",
        commercial={"title": "Silk Kurta", "price": "49.99"},
        original_assets={"images": images},
    )
    data.update(overrides)
    return Product(**data)


# ---------------------------------------------------------------------------
# prepare_product_assets
# ---------------------------------------------------------------------------

async def test_prepare_idempotent(fake_r2):
    """A product that already has a cutout is returned unchanged -- same
    object identity -- and the function never touches the adapter or R2."""
    product = _make_product(
        derived_assets={"transparentCutout": "r2://test-bucket/creative-studio/brands/brand1/products/product1/cutouts/cutout.png"},
    )
    adapter = FakeAdapter({})  # would raise/misbehave if actually called

    result = await prepare_product_assets(adapter, fake_r2, product, BRAND_ID)

    assert result is product
    assert adapter.calls == []
    assert adapter.download_urls == []
    assert fake_r2.put_calls == []


async def test_prepare_generates_cutout(fake_r2):
    """A product without a cutout: the featured image's real r2:// uri is
    presigned and sent to birefnet; the returned product carries the new
    cutout uri in both derived_assets and placement_assets; the ORIGINAL
    product is left unmutated."""
    product = _make_product()
    adapter = FakeAdapter({"image": {"url": "https://fal.media/files/x/cutout.png", "content_type": "image/png"}})

    result = await prepare_product_assets(adapter, fake_r2, product, BRAND_ID)

    expected_presigned = fake_r2.presign(fake_r2.key_from_uri(_ORIGINAL_URI))
    assert adapter.calls == [(MODEL_IDS["cutout"], {"image_url": expected_presigned})]
    assert adapter.download_urls == ["https://fal.media/files/x/cutout.png"]

    expected_key = "creative-studio/brands/brand1/products/product1/cutouts/cutout.png"
    assert fake_r2.put_calls == [(expected_key, "image/png")]
    expected_cutout_uri = f"r2://test-bucket/{expected_key}"

    assert result.derived_assets["transparentCutout"] == expected_cutout_uri
    assert result.placement_assets["productCutout"] == expected_cutout_uri
    assert "garmentMask" not in result.derived_assets
    assert result.has_cutout is True

    # revalidates cleanly (Product.model_validate round-trip)
    assert result.id == product.id

    # original untouched
    assert result is not product
    assert product.derived_assets == {}
    assert product.placement_assets == {}
    assert product.has_cutout is False


async def test_prepare_generates_cutout_with_mask(fake_r2):
    """When the birefnet result exposes a mask (`meta["maskUrl"]`), the
    pipeline downloads it and stores it as derived_assets.garmentMask."""
    product = _make_product()
    adapter = FakeAdapter({
        "image": {"url": "https://fal.media/files/x/cutout.png", "content_type": "image/png"},
        "mask_image": {"url": "https://fal.media/files/x/mask.png"},
    })

    result = await prepare_product_assets(adapter, fake_r2, product, BRAND_ID)

    # remove_background's own cutout download happens first, then the
    # pipeline's extra mask download.
    assert adapter.download_urls == [
        "https://fal.media/files/x/cutout.png",
        "https://fal.media/files/x/mask.png",
    ]
    mask_key = "creative-studio/brands/brand1/products/product1/masks/mask.png"
    assert (mask_key, "image/png") in fake_r2.put_calls
    assert result.derived_assets["garmentMask"] == f"r2://test-bucket/{mask_key}"


async def test_prepare_uses_source_url_for_pending(fake_r2):
    """A `pending:`-prefixed r2Uri (image never mirrored to R2 yet) sends
    the entry's public sourceUrl straight to birefnet -- no presign."""
    product = _make_product(images=[{
        "sourceUrl": _SOURCE_URL,
        "r2Uri": f"pending:{_SOURCE_URL}",
        "featured": True,
    }])
    adapter = FakeAdapter({"image": {"url": "https://fal.media/files/x/cutout.png"}})

    await prepare_product_assets(adapter, fake_r2, product, BRAND_ID)

    assert adapter.calls == [(MODEL_IDS["cutout"], {"image_url": _SOURCE_URL})]


async def test_prepare_falls_back_to_first_image_when_none_featured(fake_r2):
    """No image is marked `featured`: falls back to the first image in the list."""
    product = _make_product(images=[
        {"sourceUrl": "https://cdn.shopify.com/files/first.jpg", "r2Uri": "pending:https://cdn.shopify.com/files/first.jpg"},
        {"sourceUrl": "https://cdn.shopify.com/files/second.jpg", "r2Uri": "pending:https://cdn.shopify.com/files/second.jpg"},
    ])
    adapter = FakeAdapter({"image": {"url": "https://fal.media/files/x/cutout.png"}})

    await prepare_product_assets(adapter, fake_r2, product, BRAND_ID)

    assert adapter.calls == [(MODEL_IDS["cutout"], {"image_url": "https://cdn.shopify.com/files/first.jpg"})]


async def test_prepare_raises_for_unrecognized_uri_scheme(fake_r2):
    """An r2Uri that is neither `r2://` nor `pending:` cannot be resolved to
    a birefnet source url -- raises ValueError, no adapter call made."""
    product = _make_product(images=[{
        "sourceUrl": _SOURCE_URL,
        "r2Uri": "https://not-a-recognized-scheme/product.jpg",
        "featured": True,
    }])
    adapter = FakeAdapter({"image": {"url": "https://fal.media/files/x/cutout.png"}})

    with pytest.raises(ValueError):
        await prepare_product_assets(adapter, fake_r2, product, BRAND_ID)

    assert adapter.calls == []


# ---------------------------------------------------------------------------
# replace_on_keyframe
# ---------------------------------------------------------------------------

async def test_replace_on_keyframe(fake_r2):
    """Bria receives image_url == presigned CUTOUT and ref_image_url ==
    presigned SCENE (keyframe) -- pins the product-vs-scene mapping end to
    end -- and the composited frame is stored at the keyframe_replaced key."""
    cutout_uri = "r2://test-bucket/creative-studio/brands/brand1/products/product1/cutouts/cutout.png"
    product = _make_product(derived_assets={"transparentCutout": cutout_uri})
    keyframe_uri = "r2://test-bucket/creative-studio/runs/gen1/keyframes/shot2/raw.png"
    adapter = FakeAdapter({"images": [{"url": "https://fal.media/files/x/placed.png", "content_type": "image/png"}]})

    result = await replace_on_keyframe(adapter, fake_r2, keyframe_uri, product, "gen1", 2)

    expected_scene = fake_r2.presign(fake_r2.key_from_uri(keyframe_uri))
    expected_cutout = fake_r2.presign(fake_r2.key_from_uri(cutout_uri))
    assert adapter.calls == [(
        MODEL_IDS["placement"],
        {
            "image_url": expected_cutout,
            "ref_image_url": expected_scene,
            "placement_type": "manual_placement",
            "manual_placement_selection": "bottom_center",
        },
    )]
    assert result == "r2://test-bucket/creative-studio/runs/gen1/keyframes/shot2/replaced.png"


async def test_replace_requires_cutout(fake_r2):
    """No transparentCutout on the product: raises ValueError naming the
    missing prerequisite, no adapter call made."""
    product = _make_product()  # no derived_assets.transparentCutout
    adapter = FakeAdapter({})

    with pytest.raises(ValueError, match="prepare_product_assets"):
        await replace_on_keyframe(adapter, fake_r2, "r2://test-bucket/x.png", product, "gen1", 1)

    assert adapter.calls == []
