# src/creative_studio/contracts/product.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

class Product(ContractBase):
    object_type: str = "Product"
    shopify: dict = Field(default_factory=dict)
    commercial: dict = Field(default_factory=dict)
    variants: list[dict] = Field(default_factory=list)
    collections: list[str] = Field(default_factory=list)
    original_assets: dict = Field(default_factory=dict)
    derived_assets: dict = Field(default_factory=dict)
    placement_assets: dict = Field(default_factory=dict)
    ai_metadata: dict = Field(default_factory=dict)
    provider_metadata: dict = Field(default_factory=dict)

    @property
    def has_cutout(self) -> bool:
        return bool(self.derived_assets.get("transparentCutout"))

    @model_validator(mode="after")
    def _rules(self):
        if not self.commercial.get("title") or not self.commercial.get("price"):
            raise ValueError("commercial.title and commercial.price are required")
        images = self.original_assets.get("images")
        if not images:
            raise ValueError("original_assets.images must be a non-empty list")
        for image in images:
            if not isinstance(image, dict) or not image.get("r2Uri"):
                raise ValueError("each image in original_assets.images requires a non-empty r2Uri")
        return self
