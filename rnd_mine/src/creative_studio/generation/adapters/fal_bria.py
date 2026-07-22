# src/creative_studio/generation/adapters/fal_bria.py
"""fal-ai/bria/product-shot adapter, used here in its PLACEMENT mode: composite
an already-cutout product image into an already-rendered scene.

This is a DIFFERENT use of the model than the working
`apps/ai-layer/ai_layer/creative/image_providers.py::_product_shot()`, which
feeds it a raw product photo plus a text `scene_description` and lets it
invent a brand-new lifestyle scene around the product. Task 17's
`place_product` instead has a scene already generated (Task 17's own
`generate_image`) and a product cutout already extracted (`remove_background`
above), and needs the model's OTHER input mode: compositing onto a supplied
reference image. The working code never exercises this mode, so its argument
shape (`image_url` + `scene_description`) does not apply here; the plan doc's
guess (`{"image_url": scene, "ref_image_url": cutout,
"manual_placement_selection": "automatic"}`) also turned out to have the two
image fields swapped and "automatic" pinned to the wrong parameter.

Argument names below are verified against fal's own published schema for
`fal-ai/bria/product-shot` (fetched July 2026):

  - `image_url` (required): the PRODUCT image -> `product_cutout_url`.
  - `ref_image_url` (optional, mutually exclusive with `scene_description`):
    the background/scene image -> `scene_url`.
  - `placement_type`: `"original" | "automatic" | "manual_placement" |
    "manual_padding"`. `"automatic"` generates `num_results x 10` images (one
    per recommended position) -- 10x the cost of a single placement for no
    benefit here, since exactly one composited keyframe is wanted. Pinned
    instead to the model's own default, `"manual_placement"`.
  - `manual_placement_selection`: position enum for `manual_placement`
    (`"bottom_center"`, `"upper_left"`, ...). Pinned to the model's own
    default, `"bottom_center"`.

Both constants are named below specifically so a maintainer can revisit them
in one place after seeing real output from Task 26's supervised live run --
see the task-17 report for the full reasoning and the alternative.
"""
from __future__ import annotations

from creative_studio.generation.adapters.base import MODEL_IDS, FalAdapter, FalAdapterError
from creative_studio.storage.r2 import R2Store

_CONTENT_TYPE_DEFAULT = "image/png"
_PLACEMENT_TYPE = "manual_placement"
_PLACEMENT_SELECTION = "bottom_center"


async def place_product(
    adapter: FalAdapter, r2: R2Store, scene_url: str, product_cutout_url: str, key: str
) -> tuple[str, dict]:
    """Composite `product_cutout_url` onto `scene_url` and store the result in
    R2 at `key`.

    Returns `(r2_uri, meta)`; `meta` carries `modelId`.
    """
    model_id = MODEL_IDS["placement"]
    arguments = {
        "image_url": product_cutout_url,
        "ref_image_url": scene_url,
        "placement_type": _PLACEMENT_TYPE,
        "manual_placement_selection": _PLACEMENT_SELECTION,
    }

    result = await adapter.submit(model_id, arguments)

    images = result.get("images") or result.get("result", {}).get("images") or []
    if not images or not images[0].get("url"):
        raise FalAdapterError(
            f"fal product placement returned no image url for model {model_id!r}; "
            f"result keys: {sorted(result.keys())}"
        )

    first = images[0]
    data = await adapter.download(first["url"])
    content_type = first.get("content_type", _CONTENT_TYPE_DEFAULT)
    uri = r2.put_bytes(key, data, content_type)

    return uri, {"modelId": model_id}
