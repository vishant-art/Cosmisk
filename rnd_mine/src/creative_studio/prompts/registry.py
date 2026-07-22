# src/creative_studio/prompts/registry.py
"""Versioned prompt registry for the Creative Studio planning layer.

Each planner prompt (Creative Intelligence, Character Generator, Story
Planner) is authored as a YAML file under `prompts/definitions/` rather than
inline in code, per the "version everything" principle in
`Prompt Architecture & Planning Layer.md` (S16/18). `PromptRegistry` loads and
caches those definitions; `render` fills the template's `<<name>>`
placeholders.

Placeholder syntax is deliberately `<<name>>`, not `str.format` braces:
every template embeds a literal JSON skeleton (`{...}`), so `str.format`
would collide with that JSON's own braces.
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml
from pydantic import BaseModel

_PLACEHOLDER_RE = re.compile(r"<<([a-zA-Z_][a-zA-Z0-9_]*)>>")


class PromptDefinition(BaseModel):
    prompt_id: str
    version: int
    model_hint: str
    purpose: str
    system_prompt: str
    template: str
    output_object_type: str
    changelog: list[str]


class PromptRegistry:
    """Loads and caches `PromptDefinition`s from YAML files on disk."""

    def __init__(self, definitions_dir: Path | None = None):
        self._definitions_dir = definitions_dir or (Path(__file__).parent / "definitions")
        self._cache: dict[str, PromptDefinition] = {}

    def load(self, prompt_id: str) -> PromptDefinition:
        if prompt_id in self._cache:
            return self._cache[prompt_id]

        path = self._definitions_dir / f"{prompt_id}.yaml"
        if not path.exists():
            raise ValueError(
                f"Unknown prompt id '{prompt_id}': no {path.name} found in {self._definitions_dir}"
            )

        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        defn = PromptDefinition.model_validate(raw)
        self._cache[prompt_id] = defn
        return defn


def render(defn: PromptDefinition, **vars: object) -> str:
    """Fill `<<name>>` placeholders in `defn.template` with `str(value)`.

    Extra supplied vars that don't appear in the template are ignored.
    Any `<<name>>` marker still present after substitution raises `ValueError`
    naming every leftover marker.

    Substitution is single-pass: a value containing a literal `<<...>>` marker
    is treated as inert text and not re-substituted.
    """
    # Find all placeholder names that are not in vars before doing any substitution
    all_placeholders = _PLACEHOLDER_RE.findall(defn.template)
    leftover = sorted(set(name for name in all_placeholders if name not in vars))

    if leftover:
        raise ValueError(f"Unresolved template placeholder(s): {', '.join(leftover)}")

    # Single-pass substitution: values are treated as inert text
    def _sub(match: re.Match) -> str:
        name = match.group(1)
        if name in vars:
            return str(vars[name])
        return match.group(0)

    text = _PLACEHOLDER_RE.sub(_sub, defn.template)
    return text
