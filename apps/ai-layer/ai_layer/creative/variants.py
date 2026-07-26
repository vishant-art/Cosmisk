"""Structural variants (T10): hold everything fixed, vary one axis.

This is an experiment design, not a feature. A variant SET is the independent variable of
an A/B/n test: N creatives identical except on one named axis, each tagged with (base,
axis, value) so a later performance difference is *attributable* rather than mush. The
single-axis discipline is enforced by `schemas.VariantSet`, not by convention.

NOT blocked on OQ1. OQ1 (do accounts have enough conversions to draw a causal conclusion)
gates T11's inference layer. T10 is the GENERATOR of the clean dataset that inference would
one day read. You build this first, to collect controlled data; without it, all you ever
have is observational winner-mining, which is exactly the selection-on-outcome problem
UGC-D5 was about, one level up.

Two kinds of axis:

  structural  hook_type -- regenerate the hook beat, re-render. Costs money per variant.
  edit        caption_style, aesthetic -- reprocess footage we already paid for. $0
              marginal model cost. "One Seedance render, cut N ways" (T7.5).

The edit path is the cheap one and it is realized here for real: caption variants re-burn
the SAME rendered timeline with different styles after a SINGLE shared ASR; aesthetic
variants re-grade it. Neither calls a generative model.
"""
from __future__ import annotations

import re
from pathlib import Path

from ai_layer.creative import captions as captions_mod  # noqa: E402
from ai_layer.creative import editor  # noqa: E402
from ai_layer.creative import story_brain  # noqa: E402
from ai_layer.creative import taxonomy  # noqa: E402
from ai_layer.creative import teardown  # noqa: E402
from ai_layer.creative.schemas import (  # noqa: E402
    BrandKit, CaptionStyle, CreativeTemplate, EditPlan, Script, UGCStyle, Variant,
    VariantSet,
)


def _slug(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(value).lower()).strip("_")


def build_variant(base_id: str, axis: str, value: str) -> Variant:
    """One tagged variant. `kind` is derived from the axis, never passed, so an edit axis
    can never be mislabelled structural."""
    from ai_layer.creative.schemas import _AXIS_KIND
    return Variant(variant_id=f"{base_id}__{axis}__{_slug(value)}",
                   base_id=base_id, axis=axis, value=str(value), kind=_AXIS_KIND[axis])


# --- caption-style presets (edit axis) --------------------------------------------------
# Legibility is fixed: white body, black stroke, above the safe zone. Only what a marketer
# would actually A/B is exposed -- position and the highlight colour.
_CAPTION_PRESETS: dict[str, dict] = {
    "bottom_white": dict(band_y=0.72, active_color="#FFD400"),
    "center_pop": dict(band_y=0.46, active_color="#FF3B30", max_font_pt=110),
    "lower_third": dict(band_y=0.80, active_color="#0FB5AE"),
}

# --- aesthetic presets (edit axis) ------------------------------------------------------
# ffmpeg-only grades, timing-preserving, so they are safe to apply to a finished (voiced,
# captioned) timeline without desyncing anything.
_AESTHETIC_PRESETS: dict[str, EditPlan] = {
    "clean": EditPlan(),
    "film_grain": EditPlan(style=UGCStyle(grain=0.35)),
    "warm_clip": EditPlan(style=UGCStyle(exposure_clip=0.06, grain=0.08)),
}


def caption_style(value: str) -> CaptionStyle:
    if value not in _CAPTION_PRESETS:
        raise ValueError(f"unknown caption style {value!r}; "
                         f"one of {sorted(_CAPTION_PRESETS)}")
    return CaptionStyle.model_validate(_CAPTION_PRESETS[value])


def aesthetic_plan(value: str) -> EditPlan:
    if value not in _AESTHETIC_PRESETS:
        raise ValueError(f"unknown aesthetic {value!r}; one of {sorted(_AESTHETIC_PRESETS)}")
    return _AESTHETIC_PRESETS[value]


# --- structural: hook variants (re-renders) ---------------------------------------------

def hook_variant_set(client, kit: BrandKit, base_script: Script, hook_types: list[str],
                     *, base_id: str, template: CreativeTemplate | None = None
                     ) -> tuple[VariantSet, dict[str, Script], float]:
    """N scripts, each opening on a different hook approach, everything after identical.

    Returns (the experiment record, {variant_id: Script}, total LLM cost). The scripts are
    matched: any two differ ONLY in their first beat. Each is rendered downstream via the
    normal T7 path, so this axis costs a full render per variant.
    """
    if len(hook_types) < 2:
        raise ValueError("a variant set needs at least two hook types to compare")
    variants, scripts, total = [], {}, 0.0
    for ht in hook_types:
        script, cost = story_brain.revary_hook(client, kit, base_script, ht,
                                               template=template)
        total += cost
        var = build_variant(base_id, "hook_type", ht)
        variants.append(var)
        scripts[var.variant_id] = script
    return VariantSet(base_id=base_id, axis="hook_type", variants=variants), scripts, total


# --- edit: caption-style variants ($0 marginal model cost) ------------------------------

def caption_variant_set(base_clip, script_text: str, values: list[str], *, base_id: str,
                        out_dir, transcribe=None, kit: BrandKit | None = None,
                        strict: bool = True, led=None, log=print
                        ) -> tuple[VariantSet, dict[str, str]]:
    """Re-burn captions on ONE finished clip with N styles. One ASR, shared across all.

    The base clip must already carry the voiceover (captions are timed to the audio that
    ships, T3). We ASR it once and burn the same cues N ways, so the marginal cost of each
    additional caption variant is an ffmpeg pass: zero model spend.
    """
    if len(values) < 2:
        raise ValueError("a variant set needs at least two caption styles to compare")
    base_clip = Path(base_clip)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not editor.probe(base_clip)["has_audio"]:
        raise ValueError("caption variants need a voiced base clip; this one is silent")
    if transcribe is None:
        from ai_layer.creative import video_providers
        transcribe = video_providers.transcribe_words

    wav = teardown.extract_audio(base_clip, out_dir / f"{base_clip.stem}_vary.wav")
    if not wav:
        raise ValueError("could not demux audio from the base clip")
    words, cost = transcribe(wav)          # <-- the ONE ASR, shared by every variant
    if led is not None:
        led.record("variant_asr", "fal", "fal-ai/whisper", cost, base=base_id)
    cues, _drift = captions_mod.plan(script_text, words, strict=strict)

    variants, clips = [], {}
    for v in values:
        var = build_variant(base_id, "caption_style", v)
        out = out_dir / f"{var.variant_id}.mp4"
        editor.burn_captions(base_clip, out, cues, style=caption_style(v), log=log)
        variants.append(var)
        clips[var.variant_id] = str(out)
    return VariantSet(base_id=base_id, axis="caption_style", variants=variants), clips


# --- edit: aesthetic variants ($0 marginal model cost) ----------------------------------

def aesthetic_variant_set(base_clip, values: list[str], *, base_id: str, out_dir, log=print
                          ) -> tuple[VariantSet, dict[str, str]]:
    """Re-grade ONE finished clip N ways. Timing-preserving, so the voiceover and captions
    stay in sync; pure ffmpeg, so zero model spend."""
    if len(values) < 2:
        raise ValueError("a variant set needs at least two aesthetics to compare")
    base_clip = Path(base_clip)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    variants, clips = [], {}
    for v in values:
        var = build_variant(base_id, "aesthetic", v)
        out = out_dir / f"{var.variant_id}.mp4"
        editor.apply_plan(base_clip, out, aesthetic_plan(v), log=log)
        variants.append(var)
        clips[var.variant_id] = str(out)
    return VariantSet(base_id=base_id, axis="aesthetic", variants=variants), clips


# --- the experiment record --------------------------------------------------------------

def write_record(out_dir, variant_set: VariantSet, artifacts: dict[str, str],
                 *, extra: dict | None = None) -> str:
    """Persist the set plus a variant_id -> artifact map. This is what T11 joins against:
    a published ad's meta_ad_id is stamped back onto its variant_id, and the (axis, value)
    is right here. Without it, N ads that shipped are N unattributable numbers."""
    import json
    out = Path(out_dir) / f"variants_{variant_set.axis}.json"
    payload = {"set": variant_set.model_dump(), "artifacts": artifacts}
    if extra:
        payload["meta"] = extra
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return str(out)
