"""Typed contracts for the creative experiment.

The BrandKit is the locked identity every generation references. It is produced
by the brain (brand_brain) as strict JSON and validated here, so downstream code
never handles free-form text.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from ai_layer.creative.taxonomy import (
    AdFormat, BeatPurpose, CameraStyle, CreatorAge, CreatorEnergy, CreatorFiller,
    CreatorGender, CreatorGesture, FramingStyle, HookType, LightingStyle,
    ProductVisibility, ShotCamera, VariantAxis,
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


# --- the creator persona: WHO is on camera, held constant -----------------------

class CreatorKit(BaseModel):
    """The person in the ad. `BrandKit` is what the brand is; this is who speaks for it.

    Split by ACTUATOR, the same discipline as UGCStyle, because the three halves are
    honoured by three different systems with three different levels of reliability:

      visual:   age/gender/appearance/wardrobe/setting -> the VIDEO model. A WISH. The
                model may ignore it, and across N shots it usually drifts. This is the
                hard problem; `face_ref` + persona seeding (sequencer) is the attempt.
      speech:   energy/filler_words/gesture            -> the SCRIPT brain. A WISH, but a
                reliable one: an LLM asked for filler words produces filler words.
      voice_id: the TTS voice                          -> MiniMax. A GUARANTEE, exact, and
                already structurally consistent because ONE voiceover is generated for the
                whole timeline (pipeline.finish_timeline), never spliced per shot.

    So voice consistency is solved by construction; face consistency is not, and the
    schema says so rather than implying all three are equally real.

    Cross-run by definition: the same creator fronts many ads. Persisted as
    `creator_kit.json` in the run dir and echoed on the job, so a caller can hand the same
    persona back on the next run.
    """
    name: str                              # a label, e.g. "Maya" -- not rendered, just identity
    # --- visual: handed to the video model. A wish. ---
    age_range: CreatorAge = "25-34"
    gender: CreatorGender = "unspecified"
    appearance: str = ""                   # free-text visual brief, like Shot.subject
    wardrobe: str = ""
    setting: str = ""                      # the creator's recurring room/location
    face_ref: str | None = None            # a still of this person, to condition renders
    # --- speech: handed to the script brain. A wish, reliably honoured. ---
    energy: CreatorEnergy = "warm"
    filler_words: CreatorFiller = "some"
    gesture: CreatorGesture = "occasional"
    # --- voice: handed to TTS. A guarantee. Empty = the config default. ---
    voice_id: str = ""

    @field_validator("appearance", "wardrobe", "setting")
    @classmethod
    def _tidy(cls, v: str) -> str:
        return _collapse(v)

    def to_visual_prompt(self) -> str:
        """WHO the camera sees. Goes into every shot prompt so five shots describe one
        person rather than five. Says nothing about how they talk: a diffusion model
        cannot render 'uses filler words', and asking it to is how you get subtitles."""
        who = " ".join(p for p in [
            self.age_range.replace("-", " to ") + "-year-old" if self.age_range else "",
            self.gender if self.gender != "unspecified" else "person",
        ] if p)
        bits = [f"The same {who}", self.appearance]
        if self.wardrobe:
            bits.append(f"wearing {self.wardrobe}")
        if self.setting:
            bits.append(f"in {self.setting}")
        gest = {"rare": "still, hands mostly out of frame",
                "occasional": "occasional natural hand gestures",
                "frequent": "talking with their hands, gesturing constantly"}[self.gesture]
        return ", ".join(b for b in bits if b) + f". {gest.capitalize()}. " \
               "The SAME person, unchanged, in every shot."

    def to_voice_brief(self) -> str:
        """HOW they talk. Goes to the script brain, not the video model."""
        fill = {"none": "no filler words; clean, edited speech",
                "some": "the odd filler word ('honestly', 'like'), the way people actually talk",
                "many": "lots of filler words and false starts, very unpolished"}[self.filler_words]
        return (f"THE CREATOR SPEAKING: {self.name}, a {self.energy} "
                f"{self.gender if self.gender != 'unspecified' else 'person'}. "
                f"Write in their voice: {fill}.")


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


# --- T10: structural variants ----------------------------------------------------

# Which axes need a re-render, and which are free post-processing on footage we already
# paid for. "Vary the edit, not the render" (T7.5): one Seedance render, cut N ways.
_AXIS_KIND: dict[str, str] = {
    "hook_type": "structural",     # a different opening changes what is on screen
    "caption_style": "edit",       # same footage, different burn
    "aesthetic": "edit",           # same footage, different grade
}


class Variant(BaseModel):
    """One member of a matched set: identical to its siblings except on one axis.

    `variant_id` is durable, because it is the key that joins this creative to the ad Meta
    eventually runs (its meta_ad_id) and therefore to the performance that answers "did
    this axis value win". A random uuid would sever that join; a slug of (base, axis,
    value) preserves it.
    """
    variant_id: str
    base_id: str
    axis: VariantAxis
    value: str
    kind: Literal["edit", "structural"]

    @model_validator(mode="after")
    def _kind_matches_axis(self):
        expected = _AXIS_KIND[self.axis]
        if self.kind != expected:
            raise ValueError(f"axis {self.axis!r} is {expected}, not {self.kind!r}")
        return self


class VariantSet(BaseModel):
    """A controlled experiment: N creatives that differ on exactly ONE axis (T10).

    This is not a bag of ideas. It is the independent variable of an A/B/n test, and the
    invariants below are what make a later performance difference *attributable*. Vary two
    axes and you cannot say which one moved the number; ship two identical values and one
    of them teaches nothing. Both are rejected here rather than discovered in the data.
    """
    base_id: str
    axis: VariantAxis
    variants: list[Variant] = Field(min_length=2)

    @model_validator(mode="after")
    def _one_axis_distinct_values(self):
        for v in self.variants:
            if v.axis != self.axis:
                raise ValueError(
                    f"a variant set varies ONE axis ({self.axis!r}); found {v.axis!r}. "
                    f"A difference across two axes is attributable to neither.")
            if v.base_id != self.base_id:
                raise ValueError(f"variant {v.variant_id!r} has base {v.base_id!r}, "
                                 f"not {self.base_id!r}")
        values = [v.value for v in self.variants]
        if len(set(values)) != len(values):
            raise ValueError("variant values must be distinct; two identical variants "
                             "are one datapoint wearing two labels")
        return self


# --- T11: the closed loop. What we made -> what it did -> what we learn. ----------

class VariantOutcome(BaseModel):
    """One shipped variant and what it actually did. The join the whole experiment exists
    for: `variant_id` says WHAT WE CHANGED, `meta_ad_id` says WHICH AD IT BECAME, and the
    metrics say WHAT HAPPENED.

    `thumb_stop_rate` is the label, not `roas`. A hook can plausibly cause someone to stop
    scrolling; it cannot cause the landing page, the price, the LTV or the promo calendar,
    all of which sit between the creative and a sale. Training on ROAS trains on the funnel.
    ROAS rides along as a sanity check and is never the signal.
    """
    variant_id: str
    base_id: str
    axis: VariantAxis
    value: str
    kind: Literal["edit", "structural"]
    artifact_path: str | None = None
    # None until an operator publishes the ad and stamps it back. There is no auto-publisher.
    meta_ad_id: str | None = None
    # None until harvested. None means "not observed", NOT zero -- see meta_creatives.metrics_of.
    thumb_stop_rate: float | None = None
    thruplay_rate: float | None = None
    impressions: int = 0
    spend: float = 0.0
    roas: float | None = None

    @property
    def observed(self) -> bool:
        return self.thumb_stop_rate is not None and self.impressions > 0


class ArmResult(BaseModel):
    """One arm of one experiment: an (axis, value) with its realized thumb-stop."""
    axis: VariantAxis
    value: str
    thumb_stop_rate: float
    impressions: int
    n_ads: int = 1


class AxisFinding(BaseModel):
    """A comparison WITHIN one variant set: same base, same axis, one thing different.

    This is the only place a causal claim is licensed. Two ads that differ on one axis and
    were served by the same account in the same window differ *because of that axis*. Two
    ads from different runs differ for a hundred reasons, and averaging them is how you end
    up believing something an A/B test would have killed.
    """
    base_id: str
    axis: VariantAxis
    winner: str
    loser: str
    winner_rate: float
    loser_rate: float
    lift: float                      # winner_rate - loser_rate, in absolute rate points
    significant: bool                # two-proportion z-test cleared the threshold
    impressions: int                 # total across both arms


class CreativePrior(BaseModel):
    """What this account has actually learned, rendered for the brain (T11).

    Deliberately conservative. An arm below the impression floor is not reported at all,
    and a difference that fails the significance test is reported as UNDECIDED rather than
    as a winner. The alternative -- shipping "pattern_interrupt wins" off 40 impressions --
    is a mediocre output wearing the costume of a rigorous one, which is exactly what the
    teardown's provenance discipline exists to prevent. `to_brief()` returns "" when there
    is nothing credible to say, and `story_brain` then injects nothing.
    """
    brand_id: str
    findings: list[AxisFinding] = Field(default_factory=list)
    arms: list[ArmResult] = Field(default_factory=list)
    n_observed: int = 0               # variants with realized metrics
    n_published: int = 0              # variants with a meta_ad_id but no metrics yet
    n_total: int = 0

    def to_brief(self) -> str:
        """The evidence block. Empty when nothing has cleared the bar -- and empty is the
        honest answer for a new account, not a reason to invent one."""
        decided = [f for f in self.findings if f.significant]
        if not decided and not self.arms:
            return ""
        lines = ["WHAT HAS ACTUALLY WORKED FOR THIS ACCOUNT (measured, not assumed):"]
        for f in decided:
            lines.append(
                f"- on '{f.axis}', {f.winner!r} beat {f.loser!r}: "
                f"{f.winner_rate:.1%} vs {f.loser_rate:.1%} thumb-stop "
                f"({f.lift:+.1%}, {f.impressions:,} impressions). Prefer {f.winner!r}.")
        undecided = [f for f in self.findings if not f.significant]
        for f in undecided:
            lines.append(
                f"- on '{f.axis}', {f.winner!r} vs {f.loser!r} is UNDECIDED "
                f"({f.winner_rate:.1%} vs {f.loser_rate:.1%}, only {f.impressions:,} "
                f"impressions). Do not treat this as a preference.")
        if not decided and undecided:
            lines.append("Nothing has reached significance yet. Keep varying; do not "
                         "over-fit to the numbers above.")
        return "\n".join(lines)


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
