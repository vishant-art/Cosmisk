# src/creative_studio/contracts/campaign.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

class Campaign(ContractBase):
    object_type: str = "Campaign"
    campaign_info: dict = Field(default_factory=dict)
    platforms: dict = Field(default_factory=dict)
    products: list[str] = Field(default_factory=list)
    audience: dict = Field(default_factory=dict)
    creative_summary: dict = Field(default_factory=dict)
    performance: dict = Field(default_factory=dict)
    learnings: dict = Field(default_factory=dict)
    assets: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if not self.campaign_info.get("campaignName") or not self.campaign_info.get("objective"):
            raise ValueError("campaign_info.campaignName and campaign_info.objective are required")
        if not any(v for v in self.platforms.values()):
            raise ValueError("at least one enabled platform required")
        return self
