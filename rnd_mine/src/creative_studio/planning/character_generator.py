# src/creative_studio/planning/character_generator.py
"""Character Generator planner: assembles a `CharacterSheet`.

Calls the `character_generator` prompt to obtain the six creative-decision
sections of a `CharacterSheet` (identity, appearance, wardrobe, personality,
expressions, speaking style) for ONE reusable on-camera persona, grounded in
a completed `CreativeSpec` and a compact brand summary.

The sheet is assembled with `status="draft"`: no portrait exists yet (that
is a later, image-adapter stage), so `reference_assets` is left empty and the
contract's "completed" portrait rule never applies here.
"""
from __future__ import annotations

import json

from creative_studio.contracts import BrandContext, CamelModel, CharacterSheet, CreativeSpec, new_id
from creative_studio.prompts.registry import PromptRegistry, render


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
