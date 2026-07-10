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
    AdFormat, BeatPurpose, CameraStyle, FramingStyle, HookType, LightingStyle,
    ProductVisibility, ShotCamera,
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


# --- T6: the script is the creative; the video is a rendering of it ------------

class ScriptBeat(BaseModel):
    """One unit of the argument. `purpose` is what it is FOR; `text` is what is said."""
    purpose: BeatPurpose
    text: str

    @field_validator("text")
    @classmethod
    def _nonempty(cls, v: str) -> str:
        v = _collapse(v)
        if not v:
            raise ValueError("a beat with no words is not a beat")
        return v


class Script(BaseModel):
    """The spoken argument, ordered. This, not the image, is the creative.

    A static ad's artifact is a composed frame. A UGC ad's artifact is a sequence, and
    the sequence is decided here, before a single pixel is rendered. The renderer moves
    down the stack and becomes a detail.
    """
    beats: list[ScriptBeat] = Field(min_length=1)

    def spoken(self) -> str:
        """The voiceover text. Also the ground truth the caption drift gate checks
        against (T3), which is why it is joined once, here, and not reassembled later."""
        return " ".join(b.text for b in self.beats)

    def purposes(self) -> set[str]:
        return {b.purpose for b in self.beats}

    @field_validator("beats")
    @classmethod
    def _opens_on_a_hook(cls, v: list[ScriptBeat]) -> list[ScriptBeat]:
        # Universally true of short-form: the first two seconds earn the next two.
        if v and v[0].purpose != "hook":
            raise ValueError(f"a script must open on a hook, not {v[0].purpose!r}")
        return v


class Shot(BaseModel):
    """One clip in the storyboard. `purpose` is a foreign key to the ScriptBeat it
    renders, which is what makes shot-level repair possible (T9.5): you can only
    regenerate a shot in isolation if you know what it was for."""
    purpose: BeatPurpose
    duration_s: float = Field(gt=0)
    camera: ShotCamera
    subject: str                       # free-text visual brief, like AdConcept.scene
    product_visible: ProductVisibility
    motion: str = ""
    dialogue: str | None = None


class Storyboard(BaseModel):
    """A shot list that sums to the target and covers every beat.

    Portable across renderers by construction. Nothing here knows that Seedance 2.0
    caps a clip at ~15s or that Seedance 2.5 promises 30s native; the cap is a config
    constant applied when the durations are fitted. If a 30-second single-pass model
    lands, the same Storyboard renders as one call instead of six and nothing above
    the renderer changes. See UGC-D1.
    """
    shots: list[Shot] = Field(min_length=1)
    target_seconds: float
    # T9.5 blast radius. Sequential render gives shot-to-shot continuity via ref2v but
    # makes a repair cascade forward; independent keeps repairs local. Default to local
    # until the continuity check in T9 is trustworthy enough to justify the cascade.
    render_mode: Literal["independent", "sequential"] = "independent"

    @property
    def duration_s(self) -> float:
        return round(sum(s.duration_s for s in self.shots), 3)

    def purposes(self) -> set[str]:
        return {s.purpose for s in self.shots}

    def covers(self, script: Script) -> set[str]:
        """Beats with no shot to render them. Empty set means the storyboard is whole."""
        return script.purposes() - self.purposes()


# --- T9.5: shot recovery ---------------------------------------------------------

RepairAction = Literal["retry", "reprompt", "replan", "drop"]


class RepairStep(BaseModel):
    """One rung of the ladder, attempted. Kept whether or not it worked.

    NOTE, deliberate deviation from the roadmap, which proposed a `Shot.repair_attempts`
    counter. Repairs are a RUNTIME fact. Putting the count on `Shot` would make
    storyboard.json differ depending on how many times a render happened to fail, and
    the plan would stop being reproducible. The plan is what we meant; the log is what
    happened. They are different artifacts and they are stored separately.
    """
    shot_index: int
    attempt: int
    action: RepairAction
    reason: str                      # the QA detail that triggered this rung
    resolved: bool = False


class RepairLog(BaseModel):
    steps: list[RepairStep] = Field(default_factory=list)
    dropped: list[int] = Field(default_factory=list)   # indices in the ORIGINAL board
    renders: int = 0
    exhausted: list[int] = Field(default_factory=list)  # shots the ladder could not fix

    @property
    def clean(self) -> bool:
        return not self.exhausted


# --- T3: burned-in per-word captions (an editor operation, UGC-D8) -------------

class CaptionWord(BaseModel):
    """One spoken word with its MEASURED span. Timing always comes from ASR; the text
    comes from our script when the two agree, because we know how the brand is spelled
    and Whisper does not."""
    text: str
    start: float
    end: float


class CaptionCue(BaseModel):
    """A group of 1-3 words shown together, with one word highlighted as it is spoken.

    `end` is the moment the cue leaves the screen, which is the NEXT cue's start rather
    than the last word's end. Captions that vanish between phrases flicker.
    """
    words: list[CaptionWord]
    start: float
    end: float

    @property
    def text(self) -> str:
        return " ".join(w.text for w in self.words)

    def active_index(self, t: float) -> int:
        """Which word is being spoken at time `t`. Between words the previous word stays
        lit rather than the caption going dark, which is what a reader expects."""
        idx = 0
        for i, w in enumerate(self.words):
            if t >= w.start:
                idx = i
        return idx


class CaptionStyle(BaseModel):
    """How captions are drawn. All of it deterministic: this is the compositor's job,
    not the video model's."""
    band_y: float = 0.60
    band_h: float = 0.16
    max_font_pt: int = 96
    color: str = "#FFFFFF"
    active_color: str = "#FFD400"
    stroke_frac: float = 0.10

    @classmethod
    def from_kit(cls, kit: "BrandKit | None" = None, **kw) -> "CaptionStyle":
        """Legibility is fixed (white on a black stroke, over unknown footage); only the
        highlight colour is the brand's. A brand-coloured caption body would fail
        contrast over half the frames it lands on."""
        if kit is not None:
            accent = next((c.css() for c in kit.palette if c.role == "accent"), None)
            if accent:
                kw.setdefault("active_color", accent)
        return cls(**kw)


# --- T7.5: the deterministic editor --------------------------------------------

class SfxCue(BaseModel):
    """One sound effect at one moment. Synthesized, not licensed (see sfx.py)."""
    at_s: float = Field(ge=0)
    kind: Literal["punch", "whoosh", "click"]
    gain_db: float = -8.0


class EditPlan(BaseModel):
    """What the editor does to one clip. Every field is an ffmpeg guarantee.

    Nothing here is a wish. `UGCStyle.prompt` fields went to the image model and may or
    may not have been honoured; `UGCStyle.post` fields land HERE and are applied exactly.
    That is the whole reason the two halves are separate types (T1).
    """
    style: UGCStyle | None = None
    punch_to: float = Field(default=1.0, ge=1.0, le=2.0)   # final zoom; 1.0 = static
    speed: float = Field(default=1.0, gt=0.25, le=4.0)
    sfx: list[SfxCue] = Field(default_factory=list)

    @property
    def is_noop(self) -> bool:
        s = self.style
        return (self.punch_to == 1.0 and self.speed == 1.0 and not self.sfx
                and (s is None or (s.micro_shake == 0 and s.grain == 0
                                   and s.exposure_clip == 0 and not s.recompress)))


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
    # T9: a check that could not run is NOT a check that passed. In strict mode an
    # inconclusive result fails the gate, because fail-closed means "we could not prove
    # this is good", not "we found nothing wrong while looking the other way".
    inconclusive: bool = False
    # T9.5: could a re-render plausibly change this verdict?
    #
    # False when the check could not run because an INPUT is missing, not because the
    # render was bad: a shot that promises a hero product with no cutout to match it
    # against will report the same thing forever. Re-rendering it is not a repair, it is
    # paying Seedance to tell you the same thing four times. Such a check still fails the
    # gate; it just must not drive the ladder.
    repairable: bool = True
    # T9.5: which shot to repair. None = the check is about the timeline as a whole.
    shot_index: int | None = None


class QAReport(BaseModel):
    """Verdict of the QA gate. The pipeline ships only `pass`; `fail` loops or rejects."""
    checks: list[QACheck] = Field(default_factory=list)
    verdict: Literal["pass", "fail"]
    retry_hint: str | None = None
    cost_usd: float = 0.0            # sum of check costs (the VLM critic)

    @property
    def approved(self) -> bool:
        return self.verdict == "pass"

    def failures(self) -> list[QACheck]:
        return [c for c in self.checks if not c.passed]

    def inconclusive(self) -> list[QACheck]:
        return [c for c in self.checks if c.inconclusive]

    def failed_shots(self) -> list[int]:
        """Shots a repair pass should target (T9.5). Sorted, deduplicated."""
        return sorted({c.shot_index for c in self.failures() if c.shot_index is not None})


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
