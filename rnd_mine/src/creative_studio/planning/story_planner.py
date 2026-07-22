# src/creative_studio/planning/story_planner.py
"""Story Planner: assembles a `ShotSpec`.

Calls the `story_planner` prompt to obtain the six creative-decision
sections of a `ShotSpec` (story structure, timing, global style, the 3
shots, transition rules, rendering rules), grounded in a completed
`CreativeSpec` and a `CharacterSheet` persona.

`timing`/`shots` are typed with the contracts' own `Timing`/`Shot` models
(not bare dicts), so a malformed shot -- missing dialogue, wrong shot count
or order, mistimed durations -- fails validation at the payload stage,
before it ever reaches the `ShotSpec` contract's own cross-field checks.
"""
from __future__ import annotations

import json

from creative_studio.contracts import CamelModel, CharacterSheet, CreativeSpec, Shot, ShotSpec, Timing, new_id
from creative_studio.prompts.registry import PromptRegistry, render


class _ShotSpecPayload(CamelModel):
    """The exactly-6 LLM-owned sections of a `ShotSpec` (see the prompt YAML)."""

    story_structure: dict
    timing: Timing
    global_style: dict
    shots: list[Shot]
    transition_rules: dict
    rendering_rules: dict


async def plan_shot_spec(
    llm,
    registry: PromptRegistry,
    spec: CreativeSpec,
    sheet: CharacterSheet,
) -> ShotSpec:
    """Plan the complete 3-shot `ShotSpec` storyboard for `spec` and `sheet`.

    `creative_spec_id`, `character_id`, `references`, and the envelope
    fields are filled here; the LLM supplies only the 6 creative-decision
    sections.
    """
    defn = registry.load("story_planner")

    user = render(
        defn,
        creative_spec=json.dumps(spec.to_doc(), ensure_ascii=False),
        character_sheet=json.dumps(sheet.to_doc(), ensure_ascii=False),
    )

    payload = await llm.complete_json(defn.system_prompt, user, _ShotSpecPayload)

    return ShotSpec(
        id=new_id("shotspec"),
        creative_spec_id=spec.id,
        character_id=sheet.id,
        source="planner",
        story_structure=payload.story_structure,
        timing=payload.timing,
        global_style=payload.global_style,
        shots=payload.shots,
        transition_rules=payload.transition_rules,
        rendering_rules=payload.rendering_rules,
        references={
            "creativeSpecId": spec.id,
            "characterId": sheet.id,
            "promptId": defn.prompt_id,
            "promptVersion": defn.version,
        },
    )
