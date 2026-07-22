# tests/prompts/test_registry.py
"""Unit tests for the prompt registry (`PromptDefinition`, `PromptRegistry`, `render`).

These tests only read local YAML files under
`creative_studio/prompts/definitions/` -- no network calls, no LLM calls.
"""
from __future__ import annotations

import pytest

from creative_studio.prompts.registry import PromptDefinition, PromptRegistry, render

EXPECTED_OUTPUT_TYPES = {
    "creative_intelligence": "CreativeSpec",
    "character_generator": "CharacterSheet",
    "story_planner": "ShotSpec",
}


def _defn(**over) -> PromptDefinition:
    d = dict(
        prompt_id="test_prompt",
        version=1,
        model_hint="openai/gpt-5.4-mini",
        purpose="test",
        system_prompt="test system prompt",
        template="Context: <<context>>",
        output_object_type="Test",
        changelog=["v1: initial"],
    )
    d.update(over)
    return PromptDefinition(**d)


def test_loads_all_three():
    registry = PromptRegistry()

    for prompt_id, expected_type in EXPECTED_OUTPUT_TYPES.items():
        defn = registry.load(prompt_id)

        assert isinstance(defn, PromptDefinition)
        assert defn.prompt_id == prompt_id
        assert defn.version == 1
        assert defn.model_hint == "openai/gpt-5.4-mini"
        assert defn.purpose
        assert defn.system_prompt
        assert defn.template
        assert defn.output_object_type == expected_type
        assert defn.changelog == ["v1: initial"]


def test_render_substitutes_and_json_braces_safe():
    defn = _defn(template='Context: <<name>>\nSchema: {"key": "value"}')

    result = render(defn, name="lemon", unused_extra="ignored")

    assert result == 'Context: lemon\nSchema: {"key": "value"}'


def test_render_value_containing_marker_is_not_resubstituted():
    defn = _defn(template="A <<a>> B <<b>>")

    result = render(defn, a="<<b>>", b="real")

    assert result == "A <<b>> B real"


def test_render_leftover_marker_raises():
    defn = _defn(template="Context: <<context>>")

    with pytest.raises(ValueError) as exc_info:
        render(defn)

    assert "context" in str(exc_info.value)


def test_unknown_id_raises():
    registry = PromptRegistry()

    with pytest.raises(ValueError) as exc_info:
        registry.load("does_not_exist")

    assert "does_not_exist" in str(exc_info.value)


def test_prompts_declare_json_only_and_hard_rules():
    registry = PromptRegistry()

    creative_intelligence = registry.load("creative_intelligence")
    assert "JSON" in creative_intelligence.system_prompt
    assert "camelCase" in creative_intelligence.system_prompt

    character_generator = registry.load("character_generator")
    assert "wardrobe" in character_generator.system_prompt.lower()

    story_planner = registry.load("story_planner")
    assert "Hook" in story_planner.system_prompt
    assert "shotDurations" in story_planner.system_prompt
