# src/creative_studio/contracts/shot_spec.py
from __future__ import annotations
from typing import Literal
from pydantic import Field, model_validator
from .base import ContractBase, CamelModel

class Timing(CamelModel):
    total_duration: float
    shot_durations: list[float]

class Shot(CamelModel):
    shot_number: int
    purpose: Literal["Hook", "Product", "CTA"]
    duration: float
    narrative: dict; camera: dict; character: dict; product: dict
    dialogue: dict; audio: dict = Field(default_factory=dict)
    composition: dict = Field(default_factory=dict); constraints: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if not self.dialogue.get("spokenText"):
            raise ValueError("dialogue.spokenText required")
        return self

class ShotSpec(ContractBase):
    object_type: str = "ShotSpec"
    creative_spec_id: str
    character_id: str
    story_structure: dict = Field(default_factory=dict)
    timing: Timing
    global_style: dict
    shots: list[Shot]
    transition_rules: dict = Field(default_factory=dict)
    rendering_rules: dict = Field(default_factory=dict)
    references: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if [s.purpose for s in self.shots] != ["Hook", "Product", "CTA"]:
            raise ValueError("exactly 3 shots in Hook, Product, CTA order")
        if [s.shot_number for s in self.shots] != [1, 2, 3]:
            raise ValueError("shot numbers must be 1,2,3")
        durations_match = len(self.shots) == len(self.timing.shot_durations) and all(
            abs(float(s.duration) - float(d)) <= 0.01
            for s, d in zip(self.shots, self.timing.shot_durations)
        )
        if not durations_match:
            raise ValueError("timing.shotDurations must match shot durations")
        if not (9.5 <= sum(self.timing.shot_durations) <= 10.5):
            raise ValueError("total duration must be 10s ± 0.5")
        return self
