# src/creative_studio/contracts/creative_spec.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

class CreativeSpec(ContractBase):
    object_type: str = "CreativeSpec"
    generation_context: dict = Field(default_factory=dict)
    marketing_objective: dict = Field(default_factory=dict)
    product: dict = Field(default_factory=dict)
    audience: dict = Field(default_factory=dict)
    messaging: dict = Field(default_factory=dict)
    creative_direction: dict = Field(default_factory=dict)
    platform: dict = Field(default_factory=dict)
    voice_strategy: dict = Field(default_factory=dict)
    constraints: dict = Field(default_factory=dict)
    references: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if not self.generation_context.get("creativePreference") or not self.generation_context.get("language"):
            raise ValueError("generation_context.creativePreference and generation_context.language are required")
        if not self.product.get("productId"):
            raise ValueError("product.productId is required")
        if not self.messaging.get("cta"):
            raise ValueError("messaging.cta is required")
        self.constraints["showBrandLogo"] = False
        return self
