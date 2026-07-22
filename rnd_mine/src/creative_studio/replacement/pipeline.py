# src/creative_studio/replacement/pipeline.py
"""Product-truth replacement pipeline (Task 21): BiRefNet cutout extraction
+ BRIA placement of that cutout onto already-rendered scene keyframes.

Two stages, run at different points in the orchestration:

`prepare_product_assets` is the ONE-TIME, idempotent step -- `Product.has_cutout`
gates it, so a product that already carries a `transparentCutout` is returned
untouched (zero adapter/r2 calls, zero repeat spend). The first time it runs
for a product, it extracts a transparent cutout (`fal_birefnet.remove_background`)
from that product's featured original photo and stores it under the product's
own R2 prefix (`key_for("product_cutout", ...)`), independent of any single
generation run -- so every later generation for the same product reuses it.

`replace_on_keyframe` is the PER-SHOT step: composite the already-extracted
cutout onto an already-rendered scene keyframe (`fal_bria.place_product`),
producing the "product truth" replaced frame later steps (video) render
motion from. It requires `prepare_product_assets` to have already run
(`product.has_cutout` must already be true) -- there is no lazy, on-demand
cutout generation buried inside the per-shot path, so a caller that skips the
prepare step gets an immediate, clear `ValueError` instead of a silent extra
birefnet call (and its cost) on every shot.
"""
from __future__ import annotations

from creative_studio.contracts import Product
from creative_studio.generation.adapters.fal_birefnet import remove_background
from creative_studio.generation.adapters.fal_bria import place_product
from creative_studio.storage.r2 import key_for

# birefnet's own cutout defaults to PNG (see fal_birefnet.py); a `mask_image`
# is an alpha mask surfaced the same way when fal happens to attach one, so
# the same default content-type applies to it.
_MASK_CONTENT_TYPE = "image/png"


def _select_featured_image(product: Product) -> dict:
    """Pick the featured original image, falling back to the first image
    when none is marked `featured` (defensive: the contract itself does not
    enforce exactly-one-featured, only that the images list is non-empty)."""
    images = product.original_assets.get("images") or []
    for image in images:
        if image.get("featured"):
            return image
    return images[0]


def _source_url_for_birefnet(r2, image: dict) -> str:
    """Resolve the url birefnet should fetch the original photo from.

    A real `r2://` uri is presigned (birefnet needs a fetchable http(s) url,
    not our internal uri scheme); a `pending:`-prefixed uri (never mirrored
    to R2 yet, see `ingestion.shopify.mirror_product_assets`) uses the
    entry's own public `sourceUrl` directly. Anything else cannot be
    resolved to a fetchable url.
    """
    uri = image.get("r2Uri", "")
    if uri.startswith("r2://"):
        return r2.presign(r2.key_from_uri(uri))
    if uri.startswith("pending:"):
        return image["sourceUrl"]
    raise ValueError(f"cannot resolve a birefnet source url from r2Uri {uri!r}")


async def prepare_product_assets(adapter, r2, product: Product, brand_id: str) -> Product:
    """Ensure `product` carries a transparent cutout, generating one if absent.

    Idempotent: if `product.has_cutout` already, returns the SAME object
    (identity-preserving) and makes zero adapter/r2 calls. Otherwise extracts
    a cutout from the featured original image and returns a NEW, revalidated
    `Product` -- the input `product` is never mutated.
    """
    if product.has_cutout:
        return product

    image = _select_featured_image(product)
    source_url = _source_url_for_birefnet(r2, image)

    cutout_key = key_for("product_cutout", brand_id=brand_id, product_id=product.id)
    cutout_uri, meta = await remove_background(adapter, r2, source_url, cutout_key)

    derived_assets = {**product.derived_assets, "transparentCutout": cutout_uri}

    mask_url = meta.get("maskUrl")
    if mask_url:
        mask_bytes = await adapter.download(mask_url)
        mask_key = key_for("product_mask", brand_id=brand_id, product_id=product.id)
        mask_uri = r2.put_bytes(mask_key, mask_bytes, _MASK_CONTENT_TYPE)
        derived_assets["garmentMask"] = mask_uri

    placement_assets = {**product.placement_assets, "productCutout": cutout_uri}

    updated = product.model_copy(update={
        "derived_assets": derived_assets,
        "placement_assets": placement_assets,
    })
    return Product.model_validate(updated.to_doc())


async def replace_on_keyframe(
    adapter, r2, keyframe_uri: str, product: Product, generation_id: str, shot: int
) -> str:
    """Composite `product`'s transparent cutout onto an already-rendered
    scene keyframe, returning the r2:// uri of the replaced frame.

    Requires `product.has_cutout` -- raises `ValueError` naming the missing
    prerequisite otherwise. This function never generates a cutout itself;
    see `prepare_product_assets`.
    """
    if not product.has_cutout:
        raise ValueError("product has no transparent cutout; run prepare_product_assets first")

    scene_url = r2.presign(r2.key_from_uri(keyframe_uri))
    cutout_uri = product.derived_assets["transparentCutout"]
    cutout_url = r2.presign(r2.key_from_uri(cutout_uri))

    key = key_for("keyframe_replaced", generation_id=generation_id, shot=shot)
    uri, _meta = await place_product(
        adapter, r2, scene_url=scene_url, product_cutout_url=cutout_url, key=key,
    )
    return uri
