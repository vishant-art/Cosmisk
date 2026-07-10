"""Closed taxonomies for creative teardown (T4).

Every classified field in a CreativeTemplate draws from a set defined HERE. Nothing
is free text. A model that answers outside the set is a failed call, not a new
category -- `coerce()` raises rather than inventing a label.

Why closed. The teardown's whole value is that its output is trustworthy enough to
condition generation on. An open vocabulary lets a VLM emit "aspirational lifestyle
montage w/ soft-sell undertones", which is unfalsifiable, unaggregatable, and
useless as a prior. A closed set is comparable across 600 ads.

The format/hook catalogs mirror the ones Creatify open-sourced in
`creatify-ai/video-ad-reverse-engineer` (12 formats, 10 hooks), which is itself a
reference-based classification system with no ML in it.

See dev_reports/ai_serv/creative/creative-ugc-orchestration-roadmap.md, T4.
"""
from __future__ import annotations

from typing import Literal, get_args

# --- what KIND of ad it is (12) -----------------------------------------------
AdFormat = Literal[
    "ugc_testimonial",      # creator talking to camera about the product
    "product_demo",         # the product being used, shown working
    "before_after",         # explicit state change, split or sequential
    "unboxing",             # arrival / reveal / first look
    "listicle",             # "3 reasons", enumerated beats
    "founder_story",        # first-person origin / why-we-made-it
    "problem_solution",     # pain established, then relieved
    "comparison",           # us vs them, or old way vs new way
    "tutorial",             # how-to, instructional
    "lifestyle_montage",    # cut sequence, aspirational, low dialogue
    "static_hero",          # single composed frame, minimal motion
    "screen_recording",     # app/site capture
]

# --- how it OPENS (10). The first 2 seconds decide everything. -----------------
HookType = Literal[
    "pattern_interrupt",    # something visually or tonally jarring
    "question",             # opens by asking
    "bold_claim",           # a strong assertion, stated flat
    "pov",                  # "POV: you just..."
    "authority_stat",       # a number, a credential, a study
    "visual_only",          # no speech in the opening beat
    "controversy",          # a contrarian or forbidden take
    "social_proof",         # "everyone is...", reviews, crowds
    "narrative",            # begins a story mid-motion
    "direct_address",       # "you", spoken straight to camera
]

# --- UGCStyle prompt-side vocabulary (T1). Wishes, not guarantees. ------------
CameraStyle = Literal["handheld", "selfie", "tripod", "overhead"]
LightingStyle = Literal["window", "overhead", "golden_hour", "ring_light"]
FramingStyle = Literal["imperfect", "centered", "rule_of_thirds"]

# --- script + storyboard (T6) -------------------------------------------------
# What a beat is FOR. Closed, because Shot.purpose is a foreign key to it: free-text
# purpose degenerates into the model writing "build trust" on every shot, at which
# point it is decoration and cannot drive shot-level recovery (T9.5).
BeatPurpose = Literal[
    "hook",        # the first 2 seconds. Earns the next 2.
    "problem",     # name the pain
    "agitate",     # make the pain concrete
    "demo",        # the product, working
    "proof",       # evidence: before/after, review, number
    "objection",   # pre-empt the reason not to buy
    "cta",         # the ask
]

# How a single shot is framed. Distinct from UGCStyle.camera, which is the CAPTURE
# aesthetic of the whole piece; this is the framing of one shot within it.
ShotCamera = Literal[
    "selfie", "handheld_wide", "close_up", "macro",
    "over_shoulder", "overhead", "pov",
]

# Whether the product is on screen, and how hard it is being sold in that shot.
ProductVisibility = Literal["hero", "background", "absent"]

# --- temporal QA (T9) ----------------------------------------------------------
# What a vision critic is permitted to complain about. Closed, for the same reason the
# teardown's sets are closed: an open vocabulary produces "the pacing feels slightly
# off in the middle third", which is unfalsifiable and cannot gate anything.
QaIssue = Literal[
    "none",
    "text_garbled",        # the model drew letters despite the negative prompt
    "product_missing",     # the shot promised a product and there isn't one
    "face_distorted",
    "extra_limb",          # the classic generative tell
    "caption_overlap",     # captions collide with burned-in copy or the safe zone
    "unreadable_caption",
    "continuity_break",    # shot N+1 does not follow from shot N
    "frozen_frame",        # a shot that never moves
]

# --- structural variants (T10) -------------------------------------------------
# The ONE thing a variant set is allowed to vary. Closed, because the whole value of a
# variant set is that a performance difference between its members is attributable to a
# single named cause. Vary two axes and you have learned nothing; vary an unnamed one and
# you cannot aggregate it across accounts (the T11 dataset). This set is the experiment's
# independent variable, enumerated.
VariantAxis = Literal[
    "hook_type",       # structural: regenerate the hook beat, hold the rest. Re-renders.
    "caption_style",   # edit: re-burn captions on the same footage. $0 marginal model cost.
    "aesthetic",       # edit: re-grade the same footage. $0 marginal model cost.
]

# --- CTA detection lexicon -----------------------------------------------------
# `cta_start_s` is MEASURED: the timestamp of the first spoken phrase matching this
# lexicon. If nothing matches, the field is None. We never guess a CTA moment.
CTA_PHRASES: tuple[str, ...] = (
    "shop now", "shop the", "get yours", "buy now", "order now", "order yours",
    "link in bio", "link below", "learn more", "try it", "try now", "click the",
    "swipe up", "grab yours", "grab it", "check it out", "sign up", "book a",
    "download the", "use code", "head to",
)


def values(tp) -> tuple[str, ...]:
    """The permitted labels of a Literal alias, for prompt injection and validation."""
    return get_args(tp)


class TaxonomyError(ValueError):
    """A model returned a label outside the closed set."""


def coerce(tp, raw: str, *, field: str) -> str:
    """Normalize and validate one classified label. Raises rather than inventing.

    Tolerates whitespace/case/hyphen drift ('Pattern Interrupt' -> 'pattern_interrupt')
    because that is transcription noise, not a new category. Anything else is a
    failed classification and the caller must treat it as such.
    """
    allowed = values(tp)
    norm = str(raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if norm not in allowed:
        raise TaxonomyError(
            f"{field}: {raw!r} is not one of {allowed}. Refusing to invent a category."
        )
    return norm
