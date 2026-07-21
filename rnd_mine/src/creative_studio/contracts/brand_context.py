# src/creative_studio/contracts/brand_context.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

class BrandContext(ContractBase):
    object_type: str = "BrandContext"
    business: dict = Field(default_factory=dict)
    branding: dict = Field(default_factory=dict)
    audience: dict = Field(default_factory=dict)
    creative_guidelines: dict = Field(default_factory=dict)
    historical_insights: dict = Field(default_factory=dict)
    platform_connections: dict = Field(default_factory=dict)
    user_preferences: dict = Field(default_factory=dict)
    embeddings: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if not self.business.get("brandName") or not self.business.get("industry"):
            raise ValueError("business.brandName and business.industry are required")
        if not any(v.get("connected") for v in self.platform_connections.values() if isinstance(v, dict)):
            raise ValueError("at least one connected platform required")
        return self
