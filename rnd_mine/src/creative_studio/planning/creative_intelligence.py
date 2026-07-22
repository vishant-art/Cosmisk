# src/creative_studio/planning/creative_intelligence.py
"""Creative Intelligence planner: assembles a `CreativeSpec`.

Calls the `creative_intelligence` prompt against the planner LLM to obtain
the eight creative-decision sections of a `CreativeSpec` (marketing
objective, product rationale, audience, messaging, creative direction,
platform target, voice strategy, planning constraints). The prompt's own
system message tells the model NOT to return envelope/metadata fields --
`id`, `schemaVersion`, `objectType`, `generationContext`, `references` are
stamped here in code, never by the LLM.
"""
from __future__ import annotations

import logging

from creative_studio.contracts import BrandContext, CamelModel, Campaign, CreativeSpec, Product, new_id
from creative_studio.planning.context_builder import build_context
from creative_studio.prompts.registry import PromptRegistry, render

logger = logging.getLogger("creative_studio.planning")


class _CreativeSpecPayload(CamelModel):
    """The exactly-8 LLM-owned sections of a `CreativeSpec` (see the prompt YAML)."""

    marketing_objective: dict
    product: dict
    audience: dict
    messaging: dict
    creative_direction: dict
    platform: dict
    voice_strategy: dict
    constraints: dict


async def plan_creative_spec(
    llm,
    registry: PromptRegistry,
    brand: BrandContext,
    product: Product,
    campaigns: list[Campaign],
    preference: str,
    platform: str = "Instagram",
    language: str = "English",
) -> CreativeSpec:
    """Plan a complete `CreativeSpec` for `product`, grounded in `brand`/`campaigns`.

    `generation_context` and `references` are filled here; the LLM supplies
    only the 8 creative-decision sections. `payload.product.productId` is
    force-corrected to `product.id` (with a logged warning) if the model
    echoed a different id back -- the contract's own validators enforce
    everything else.
    """
    defn = registry.load("creative_intelligence")

    context = build_context(brand, product, campaigns, preference)
    user = render(
        defn,
        context=context,
        preference=preference,
        platform=platform,
        language=language,
        product_id=product.id,
    )

    payload = await llm.complete_json(defn.system_prompt, user, _CreativeSpecPayload)

    product_section = dict(payload.product)
    if product_section.get("productId") != product.id:
        logger.warning(
            "plan_creative_spec: LLM returned product.productId=%r, overwriting with requested productId=%r",
            product_section.get("productId"),
            product.id,
        )
        product_section["productId"] = product.id

    return CreativeSpec(
        id=new_id("creative"),
        status="completed",
        source="planner",
        generation_context={
            "creativePreference": preference,
            "requestedPlatform": platform,
            "language": language,
        },
        marketing_objective=payload.marketing_objective,
        product=product_section,
        audience=payload.audience,
        messaging=payload.messaging,
        creative_direction=payload.creative_direction,
        platform=payload.platform,
        voice_strategy=payload.voice_strategy,
        constraints=payload.constraints,
        references={
            "brandId": brand.id,
            "productId": product.id,
            "campaignIds": [c.id for c in campaigns],
            "promptId": defn.prompt_id,
            "promptVersion": defn.version,
        },
    )
