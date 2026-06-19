"""Typed contracts for the creative experiment.

The BrandKit is the locked identity every generation references. It is produced
by the brain (brand_brain) as strict JSON and validated here, so downstream code
never handles free-form text.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class PaletteColor(BaseModel):
    role: Literal["primary", "secondary", "accent", "bg"]
    hex: str = Field(pattern=r"^#?[0-9A-Fa-f]{6}$")

    def css(self) -> str:
        return self.hex if self.hex.startswith("#") else f"#{self.hex}"


class Logo(BaseModel):
    brief: str                       # how the logo should look (fed to the image model)
    asset_path: str | None = None    # filled once the logo image is generated


class BrandKit(BaseModel):
    brand_name: str
    tagline: str
    palette: list[PaletteColor]
    typography: dict                 # {"heading_style": str, "body_style": str} (descriptors in v1)
    tone: str
    voice_keywords: list[str]
    dos: list[str]
    donts: list[str]
    visual_style: str                # e.g. "clean studio, warm light, minimal props"
    logo: Logo

    def palette_str(self) -> str:
        return ", ".join(f"{c.role} {c.css()}" for c in self.palette)


class AdConcept(BaseModel):
    title: str                       # short label for the ad idea
    scene: str                       # visual scene description (becomes the image prompt core)


class AssetRecord(BaseModel):
    kind: Literal["logo", "image", "video"]
    provider: str
    model: str
    path: str
    cost_usd: float = 0.0
    fell_back_from: str | None = None
    concept_title: str | None = None


class RunManifest(BaseModel):
    run_id: str
    account_name: str
    select_strategy: str
    mode: Literal["auto", "review"]
    status: Literal["awaiting_review", "complete"]
    brand_kit: BrandKit | None = None
    assets: list[AssetRecord] = Field(default_factory=list)
    total_cost_usd: float = 0.0
