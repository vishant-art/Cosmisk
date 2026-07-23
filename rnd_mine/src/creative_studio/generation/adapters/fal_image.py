# src/creative_studio/generation/adapters/fal_image.py
"""fal-ai/flux-2-flex image generation adapter.

Argument shape is ported from the working, live-verified
`apps/ai-layer/ai_layer/creative/image_providers.py::_flux()`, cross-checked
against fal's own published schema for `fal-ai/flux-2-flex` (fetched July
2026): NO `negative_prompt` parameter exists on this model, and NO
`num_images` parameter is documented either. This is a deliberate delta from
the original task plan (which specced `{"prompt", "negative_prompt",
"image_size", "num_images"}`):

  - Only the raw positive `prompt` is sent. The negative list carried on
    `ImagePrompt` is deliberately NOT folded into the prompt text: FLUX
    ignores negative-prompt phrasing, and naming the forbidden tokens inline
    tends to PRIME the draw toward them rather than suppress them. The
    `negative_prompt` field stays on the prompt object for a future model or
    wrapper that gains a real negative channel, but it never reaches FLUX here.
  - `num_images` is omitted entirely; a single image is Flux's default and
    the working code never sets it.

`image_urls` (plural, a list) is the correct reference-conditioning field
name, confirmed by the working code's up-to-10-references usage; it is only
included in the arguments when `prompt.reference_image_urls` is non-empty.
"""
from __future__ import annotations

from creative_studio.generation.adapters.base import MODEL_IDS, FalAdapter, FalAdapterError
from creative_studio.generation.builders import ImagePrompt
from creative_studio.storage.r2 import R2Store

_CONTENT_TYPE_DEFAULT = "image/png"


async def generate_image(adapter: FalAdapter, r2: R2Store, prompt: ImagePrompt, key: str) -> tuple[str, dict]:
    """Generate one image from `prompt` and store it in R2 at `key`.

    Returns `(r2_uri, meta)` where `meta` always carries `modelId` and, when
    fal's result includes a `seed`, that too.
    """
    model_id = MODEL_IDS["image"]
    # FLUX ignores negative-prompt phrasing and naming forbidden tokens can prime
    # the draw, so the negative list is deliberately NOT folded into the prompt.
    # The negative_prompt field flows through the signature for future use if the
    # model or a wrapper gains a real negative-channel, but is not sent to FLUX.
    arguments: dict = {
        "prompt": prompt.prompt,
        "image_size": {"width": prompt.width, "height": prompt.height},
        "output_format": "png",
    }
    if prompt.reference_image_urls:
        arguments["image_urls"] = list(prompt.reference_image_urls)

    result = await adapter.submit(model_id, arguments)

    images = result.get("images") or []
    if not images or not images[0].get("url"):
        raise FalAdapterError(
            f"fal image generation returned no image url for model {model_id!r}; "
            f"result keys: {sorted(result.keys())}"
        )

    first = images[0]
    data = await adapter.download(first["url"])
    content_type = first.get("content_type", _CONTENT_TYPE_DEFAULT)
    uri = r2.put_bytes(key, data, content_type)

    meta = {"modelId": model_id}
    if "seed" in result:
        meta["seed"] = result["seed"]
    return uri, meta
