"""Typed contracts for the creative experiment.

The BrandKit is the locked identity every generation references. It is produced
by the brain (brand_brain) as strict JSON and validated here, so downstream code
never handles free-form text.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


def _collapse(v: str) -> str:
    """Trim and collapse internal whitespace (LLMs love stray newlines/spaces)."""
    return " ".join(v.split())


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


class CopySet(BaseModel):
    """The ad's words, as first-class fields. Headline/CTA/angle are required;
    the image model never renders these -- the compositor places them in post."""
    headline: str
    cta_label: str
    angle: str                       # the strategic reason this creative exists
    subhead: str | None = None
    legal: str | None = None

    @field_validator("headline", "cta_label", "angle")
    @classmethod
    def _required_nonempty(cls, v: str) -> str:
        v = _collapse(v)
        if not v:
            raise ValueError("must not be empty")
        return v

    @field_validator("subhead", "legal")
    @classmethod
    def _optional_blank_to_none(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _collapse(v) or None


class AdConcept(BaseModel):
    title: str                       # short label for the ad idea
    scene: str                       # text-free visual brief (becomes the image prompt core)
    ad_copy: CopySet                 # the words placed over the scene by the compositor


class LayoutBox(BaseModel):
    """One placed element, in relative (0-1) canvas coords, top-left origin."""
    role: Literal["headline", "subhead", "cta", "logo", "legal", "product"]
    x: float
    y: float
    w: float
    h: float
    align: Literal["left", "center", "right"] = "left"
    z: int = 0
    max_font_pt: int | None = None   # ceiling for the auto-fit loop
    scrim: bool = False              # paint a contrast panel behind this box


class LayoutSpec(BaseModel):
    """A full placement plan for one aspect ratio. Deterministic, template-bounded."""
    fmt: str                         # "1:1" | "4:5" | "9:16" | "16:9"
    width: int
    height: int
    safe_zone: dict                  # {top,bottom,left,right} as 0-1 fractions
    boxes: list[LayoutBox] = Field(default_factory=list)

    def box(self, role: str) -> LayoutBox | None:
        return next((b for b in self.boxes if b.role == role), None)

    def copy_bbox(self) -> tuple[float, float, float, float]:
        """Bounding box (x,y,w,h) covering the text elements -- the saliency target."""
        txt = [b for b in self.boxes if b.role in ("headline", "subhead", "cta", "legal")]
        if not txt:
            return (0.0, 0.0, 1.0, 1.0)
        x0 = min(b.x for b in txt)
        y0 = min(b.y for b in txt)
        x1 = max(b.x + b.w for b in txt)
        y1 = max(b.y + b.h for b in txt)
        return (x0, y0, x1 - x0, y1 - y0)


class CompositedAd(BaseModel):
    """A finished static ad: a text-free background with copy/logo composited on."""
    path: str
    fmt: str
    width: int
    height: int
    background_path: str
    concept_title: str | None = None
    scrim_used: bool = False


class QACheck(BaseModel):
    name: str
    passed: bool
    detail: str = ""
    cost_usd: float = 0.0            # nonzero only for the VLM critic (an LLM call)


class QAReport(BaseModel):
    """Verdict of the QA gate. The pipeline ships only `pass`; `fail` loops or rejects."""
    checks: list[QACheck] = Field(default_factory=list)
    verdict: Literal["pass", "fail"]
    retry_hint: str | None = None
    cost_usd: float = 0.0            # sum of check costs (the VLM critic)

    @property
    def approved(self) -> bool:
        return self.verdict == "pass"


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
    formats: list[str] = Field(default_factory=list)
    ads: list[CompositedAd] = Field(default_factory=list)
    qa_reports: list[QAReport] = Field(default_factory=list)
    rejected: list[str] = Field(default_factory=list)   # concept titles that failed QA
    total_cost_usd: float = 0.0
