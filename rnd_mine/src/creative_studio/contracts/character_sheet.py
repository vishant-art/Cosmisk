# src/creative_studio/contracts/character_sheet.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

class CharacterSheet(ContractBase):
    object_type: str = "CharacterSheet"
    status: str = "draft"
    creative_spec_id: str
    identity: dict = Field(default_factory=dict)
    appearance: dict = Field(default_factory=dict)
    wardrobe: dict = Field(default_factory=dict)
    personality: dict = Field(default_factory=dict)
    expressions: dict = Field(default_factory=dict)
    speaking_style: dict = Field(default_factory=dict)
    reference_assets: dict = Field(default_factory=dict)
    conditioning: dict = Field(default_factory=dict)
    references: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        for field_name in ("identity", "appearance", "personality", "speaking_style"):
            if not getattr(self, field_name):
                raise ValueError(f"{field_name} must be a non-empty dict")
        if self.status == "completed":
            portrait = self.reference_assets.get("primaryPortrait") or {}
            if not portrait.get("r2Uri"):
                raise ValueError("reference_assets.primaryPortrait.r2Uri is required when status is completed")
        return self
