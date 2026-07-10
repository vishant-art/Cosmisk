"""Typed contracts for the creative experiment.

The BrandKit is the locked identity every generation references. It is produced
by the brain (brand_brain) as strict JSON and validated here, so downstream code
never handles free-form text.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

sys.path.insert(0, str(Path(__file__).resolve().parent))
from taxonomy import (  # noqa: E402
    AdFormat, CameraStyle, FramingStyle, HookType, LightingStyle,
)


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


# --- T1: the visual language, split by ACTUATOR --------------------------------

class UGCStyle(BaseModel):
    """How the creative should look, as a typed object rather than prompt vocabulary.

    The split is the point. `prompt:` fields are WISHES handed to a diffusion model,
    whose effect nobody can verify. `post:` fields are GUARANTEES applied by ffmpeg/PIL
    downstream, exact and asserted in tests. Mixing them in one flat bag is how you end
    up unable to say which half of your aesthetic is real.

    Bidirectional: a UGCStyle is an INPUT to generation (T1) and also an OUTPUT of
    teardown (T4), where the post-fields are measured off a winner's frames and the
    prompt-fields are closed-set classified. Same object, opposite directions.

    Deliberately absent: lens breathing. You cannot obtain it from a video model on
    request, and an unachievable field has no business in a typed contract.
    """
    # --- prompt: wishes. Optional, because an extracted style may not know them. ---
    camera: CameraStyle | None = None
    lighting: LightingStyle | None = None
    framing: FramingStyle | None = None
    # --- post: guarantees. ffmpeg/PIL, deterministic, applied by the editor (T7.5). ---
    micro_shake: float = 0.0         # px amplitude of synthetic handheld drift
    exposure_clip: float = 0.0       # 0-1 fraction of pixels pushed into highlight rolloff
    grain: float = 0.0               # 0-1 luma noise
    recompress: bool = False         # social-upload artifacting pass

    def to_prompt(self) -> str:
        """The prompt-side fragment only. Post-fields never enter a prompt: asking a
        model for 'grain' invites it to paint grain, which we then cannot remove."""
        bits = {"handheld": "shot handheld on a phone, natural camera movement",
                "selfie": "front-facing phone selfie, arm's length",
                "tripod": "locked-off camera on a tripod",
                "overhead": "shot from directly overhead"}
        lig = {"window": "lit by soft daylight from a nearby window",
               "overhead": "ordinary overhead room lighting",
               "golden_hour": "warm low-angle late-afternoon sun",
               "ring_light": "even frontal ring light"}
        frm = {"imperfect": "casually framed, slightly off-centre, unstyled",
               "centered": "centred, deliberate composition",
               "rule_of_thirds": "composed on the thirds"}
        parts = [bits.get(self.camera or ""), lig.get(self.lighting or ""),
                 frm.get(self.framing or "")]
        return ", ".join(p for p in parts if p)


# --- T4: creative teardown -----------------------------------------------------

class ShotBoundary(BaseModel):
    """One detected shot. Both fields MEASURED by frame differencing, never inferred."""
    index: int
    start_s: float
    duration_s: float


class CreativeTemplate(BaseModel):
    """The structural teardown of ONE real ad, used to condition new generation.

    Provenance discipline (roadmap T4). Every field is exactly one of:
      1. MEASURED from frames (frame differencing, pixel statistics)
      2. MEASURED from ASR (word-level timestamps, closed CTA lexicon)
      3. CLASSIFIED from a CLOSED SET (taxonomy.py)

    Nothing else ships. A VLM asked for `product_first_appears_s` will answer `2.1`,
    confidently, and be unfalsifiable. That is strictly worse than no number: it is a
    mediocre output wearing the costume of a rigorous one. `extra="forbid"` makes the
    rule mechanical rather than aspirational.
    """
    model_config = ConfigDict(extra="forbid")

    ad_id: str
    ad_name: str = ""
    # UGC-D5: a corpus selected on the outcome has no negative class. Both tails, always.
    cohort: Literal["winner", "loser"]

    # --- outcome (UGC-D6) ------------------------------------------------------
    # thumb-stop rate is creative-PROXIMAL: it measures the only thing a hook can
    # plausibly cause. ROAS sits downstream of landing page, price, LTV, attribution
    # window and promo calendar, so it is a sanity check here, never a training signal.
    thumb_stop_rate: float | None = None      # video_3_sec_watched / impressions
    thruplay_rate: float | None = None
    avg_watch_time_s: float | None = None
    roas: float | None = None
    spend: float = 0.0
    impressions: int = 0

    # --- 1. measured from frames ----------------------------------------------
    shot_count: int = 0
    shots: list[ShotBoundary] = Field(default_factory=list)
    avg_shot_length_s: float = 0.0
    time_to_first_cut_s: float = 0.0
    duration_s: float = 0.0
    style: UGCStyle | None = None              # post-fields measured; prompt-fields classified

    # --- 2. measured from ASR --------------------------------------------------
    spoken_hook: str | None = None            # words starting before the first cut
    words_per_minute: float | None = None
    cta_start_s: float | None = None          # first CTA_PHRASES match; None if none spoken

    # --- 3. classified, closed set only ----------------------------------------
    ad_format: AdFormat | None = None
    hook_type: HookType | None = None

    # --- explicitly absent -----------------------------------------------------
    # NO product_first_appears_s. NO b_roll_ratio. NO emotion_arc. NO shot purpose.
    # A VLM will happily invent all four. See the class docstring.

    def to_brief(self) -> str:
        """A compact, honest brief for the concept generator (T5).

        Only states what was actually established. A missing field is omitted rather
        than defaulted, so the brain is never told something we did not measure.
        """
        lines = [f"STRUCTURE OF A REAL {self.cohort.upper()} FROM THIS ACCOUNT "
                 f"(ad {self.ad_id}):"]
        if self.hook_type:
            lines.append(f"- opens with a '{self.hook_type}' hook")
        if self.spoken_hook:
            lines.append(f'- the first words spoken are: "{self.spoken_hook}"')
        if self.ad_format:
            lines.append(f"- format: {self.ad_format}")
        if self.shot_count:
            lines.append(f"- {self.shot_count} shots over {self.duration_s:.1f}s "
                         f"(avg shot {self.avg_shot_length_s:.1f}s)")
        if self.time_to_first_cut_s:
            lines.append(f"- first cut lands at {self.time_to_first_cut_s:.1f}s")
        if self.words_per_minute:
            lines.append(f"- spoken pace ~{self.words_per_minute:.0f} words/min")
        if self.cta_start_s is not None:
            lines.append(f"- the call to action is spoken at {self.cta_start_s:.1f}s")
        if self.thumb_stop_rate is not None:
            lines.append(f"- thumb-stop rate {self.thumb_stop_rate:.1%}")
        return "\n".join(lines)


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
    ad_copy: CopySet | None = None       # the copy on this ad (reused for video overlay/VO)


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
