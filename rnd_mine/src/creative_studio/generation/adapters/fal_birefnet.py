# src/creative_studio/generation/adapters/fal_birefnet.py
"""fal-ai/birefnet/v2 background-removal adapter (product cutouts).

Result shape verified against fal's own published schema for
`fal-ai/birefnet/v2` (fetched July 2026): the cutout is returned under a
SINGULAR `image` field (not `images`), defaulting to PNG -- confirmed to
match the working `image_providers.py::cutout()`'s primary lookup
(`res.get("image")`); that function's `(res.get("images") or [{}])[0]`
fallback is kept here too, purely defensively (this model does not appear to
ever emit an `images` array), mirroring the working code's own posture.

A `mask_image` field only appears when the request sets `output_mask=True`;
this adapter never requests one (neither does the working code), but if fal
attaches one anyway its url is surfaced in the metadata dict rather than
downloaded as a second stored asset -- Task 17's interface returns exactly
one r2 uri per call.
"""
from __future__ import annotations

from creative_studio.generation.adapters.base import MODEL_IDS, FalAdapter, FalAdapterError
from creative_studio.storage.r2 import R2Store

_CONTENT_TYPE_DEFAULT = "image/png"


async def remove_background(adapter: FalAdapter, r2: R2Store, image_url: str, key: str) -> tuple[str, dict]:
    """Remove the background from `image_url` and store the transparent PNG
    in R2 at `key`.

    Returns `(r2_uri, meta)`; `meta` carries `modelId` and, when fal's result
    includes a `mask_image`, its url as `maskUrl`.
    """
    model_id = MODEL_IDS["cutout"]
    arguments = {"image_url": image_url}

    result = await adapter.submit(model_id, arguments)

    image = result.get("image") or (result.get("images") or [{}])[0]
    if not image or not image.get("url"):
        raise FalAdapterError(
            f"fal background removal returned no image url for model {model_id!r}; "
            f"result keys: {sorted(result.keys())}"
        )

    data = await adapter.download(image["url"])
    content_type = image.get("content_type", _CONTENT_TYPE_DEFAULT)
    uri = r2.put_bytes(key, data, content_type)

    meta = {"modelId": model_id}
    mask = result.get("mask_image") or {}
    if mask.get("url"):
        meta["maskUrl"] = mask["url"]
    return uri, meta
