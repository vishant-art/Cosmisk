# src/creative_studio/planning/character_generator.py
"""Character Generator planner: assembles and finalizes a `CharacterSheet`.

`plan_character_sheet` calls the `character_generator` prompt to obtain the
six creative-decision sections of a `CharacterSheet` (identity, appearance,
wardrobe, personality, expressions, speaking style) for ONE reusable
on-camera persona, grounded in a completed `CreativeSpec` and a compact
brand summary. The sheet is assembled with `status="draft"`: no portrait
exists yet, so `reference_assets` is left empty and the contract's
"completed" portrait rule never applies at this stage.

`finalize_character` (Task 18) is the later, image-adapter stage: it takes
that draft sheet, attaches a primary portrait, and stamps `status=
"completed"` -- the point at which the contract's portrait rule does apply.
"""
from __future__ import annotations

import json

from creative_studio.contracts import BrandContext, CamelModel, CharacterSheet, CreativeSpec, new_id, utc_now
from creative_studio.generation.adapters.fal_image import generate_image
from creative_studio.generation.builders import NEGATIVE_PROMPT, ImagePrompt, build_portrait_prompt
from creative_studio.prompts.registry import PromptRegistry, render
from creative_studio.storage.r2 import key_for


class _CharacterPayload(CamelModel):
    """The exactly-6 LLM-owned sections of a `CharacterSheet` (see the prompt YAML)."""

    identity: dict
    appearance: dict
    wardrobe: dict
    personality: dict
    expressions: dict
    speaking_style: dict


async def plan_character_sheet(
    llm,
    registry: PromptRegistry,
    spec: CreativeSpec,
    brand: BrandContext,
) -> CharacterSheet:
    """Cast one reusable `CharacterSheet` persona for `spec`, grounded in `brand`.

    `creative_spec_id`, `references`, and the envelope fields are filled
    here; the LLM supplies only the 6 creative-decision sections.
    """
    defn = registry.load("character_generator")

    brand_summary = {"branding": brand.branding, "audience": brand.audience}
    user = render(
        defn,
        creative_spec=json.dumps(spec.to_doc(), ensure_ascii=False),
        brand_summary=json.dumps(brand_summary, ensure_ascii=False),
    )

    payload = await llm.complete_json(defn.system_prompt, user, _CharacterPayload)

    return CharacterSheet(
        id=new_id("character"),
        creative_spec_id=spec.id,
        status="draft",
        source="planner",
        identity=payload.identity,
        appearance=payload.appearance,
        wardrobe=payload.wardrobe,
        personality=payload.personality,
        expressions=payload.expressions,
        speaking_style=payload.speaking_style,
        references={
            "creativeSpecId": spec.id,
            "brandId": brand.id,
            "promptId": defn.prompt_id,
            "promptVersion": defn.version,
        },
    )


async def finalize_character(sheet: CharacterSheet, adapter, r2, generation_id: str, live: bool) -> CharacterSheet:
    """Attach a primary portrait to a draft `sheet` and mark it "completed".

    Dry (`live=False`): makes NO adapter/r2 calls at all -- stamps a
    `"dry-run:portrait"` placeholder so downstream orchestration and
    contract validation can be exercised for free, without spending money.

    Live: builds the portrait prompt (Task 16's `build_portrait_prompt`) and
    renders a SQUARE 1024x1024 portrait -- the schema spec's primary-portrait
    example is square, unlike the 1080x1920 vertical `ImagePrompt` default
    used for in-shot keyframes -- via the fal image adapter, storing it at
    `key_for("portrait", generation_id=...)`.

    Never mutates `sheet` (its `reference_assets` dict included): the update
    is applied via `model_copy(update=...)` against a brand-new
    `reference_assets` dict, then re-validated through
    `CharacterSheet.model_validate(...to_doc())` since `model_copy` does not
    run the model's validators on its own.
    """
    if live:
        prompt_text = build_portrait_prompt(sheet)
        key = key_for("portrait", generation_id=generation_id)
        prompt = ImagePrompt(
            prompt=prompt_text,
            negative_prompt=NEGATIVE_PROMPT,
            width=1024,
            height=1024,
        )
        uri, meta = await generate_image(adapter, r2, prompt, key)
        primary_portrait = {
            "assetId": new_id("asset"),
            "r2Uri": uri,
            "resolution": "1024x1024",
            "isPrimary": True,
            "model": meta.get("modelId"),
        }
    else:
        primary_portrait = {"r2Uri": "dry-run:portrait", "isPrimary": True}

    reference_assets = {**sheet.reference_assets, "primaryPortrait": primary_portrait}

    updated = sheet.model_copy(update={
        "status": "completed",
        "updated_at": utc_now(),
        "reference_assets": reference_assets,
    })
    return CharacterSheet.model_validate(updated.to_doc())
