"""The story brain: the argument, not the identity (T5, T6).

Everything that consumes a `CreativeTemplate` lives here. That is the module boundary,
not planner/strategist/copywriter, which is an org chart.

  generate_concepts    -- N ad ideas, grounded in a real winner's structure (T5)
  generate_script      -- the spoken argument, as ordered beats (T6)
  generate_storyboard  -- the shot list that renders those beats (T6)
  generate_vo_script   -- legacy single-shot voiceover, used when no Script exists

The script is the primary artifact. A static ad's artifact is a composed frame; a UGC
ad's is a sequence, decided before a pixel is rendered. That is the whole difference
between producing an advertisement and producing content that happens to be one.

Durations are NOT trusted from the model. It proposes hints; storyboard.fit_durations
scales them to hit the target exactly. Coverage IS trusted from the model, and checked:
a missing beat is a failed plan, retried once with the violation as a hint, never
repaired by inventing a shot.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import brain  # noqa: E402
import config  # noqa: E402
import storyboard as sb_mod  # noqa: E402
import taxonomy  # noqa: E402
from schemas import (  # noqa: E402
    AdConcept, BrandKit, CopySet, CreativeTemplate, Script, ScriptBeat, Shot, Storyboard,
)

_BEATS = ", ".join(taxonomy.values(taxonomy.BeatPurpose))
_CAMERAS = ", ".join(taxonomy.values(taxonomy.ShotCamera))
_PRODUCT = ", ".join(taxonomy.values(taxonomy.ProductVisibility))


# --- concepts (T5) --------------------------------------------------------------

_CONCEPTS_SYSTEM = (
    "You are a senior advertising art director. Given a brand kit and what's working in the "
    "account, propose {n} image-ad concepts that are distinct, intuitive, and scroll-stopping "
    "-- each a DIFFERENT strategic angle (e.g. hero-product, in-use lifestyle, problem/solution, "
    "social proof, bold visual metaphor, pattern interrupt). Return STRICT JSON only:\n"
    '{"concepts": [{"title": str, "scene": str, "ad_copy": '
    '{"headline": str, "cta_label": str, "angle": str, "subhead": str|null, "legal": str|null}}]}\n'
    "Each `scene` is a vivid, art-directed brief for ONE still: a concrete hero subject, a "
    "specific setting, intentional composition and camera angle, motivated lighting, and a clear "
    "mood -- the kind of frame that stops a feed. Avoid generic stock setups (smiling person at "
    "a laptop, plain product-on-white, soulless corporate scenes). The scene must contain NO text "
    "and NO logo -- describe only the visual (copy and logo are composited later).\n"
    "`ad_copy` is the words placed over the scene afterwards, NOT drawn by the image model:\n"
    "- headline: <=6 words, specific and on-voice, the single hook. No clickbait, no hedging.\n"
    "- cta_label: 1-3 words, an action (Shop now, Get yours, Book a call).\n"
    "- angle: the strategic reason this creative exists (the angle name above).\n"
    "- subhead: optional one short supporting line, or null.\n"
    "- legal: optional fine print (e.g. *T&C apply), or null.\n"
    "Keep the concepts visually varied but unmistakably the same brand."
)

# Appended when a CreativeTemplate is supplied (T5). This is the seam: it is what turns
# "copy what the winners LOOK like" into "reuse what they DO".
_STRUCTURE_SYSTEM = (
    "\n\nYou will also be given the measured STRUCTURE of a real ad from this account, "
    "together with how it performed. Treat it as evidence about this audience, not as "
    "a thing to copy. Reuse what carried the result -- the hook category, the pacing, "
    "the order in which the argument is made. Change the surface: the angle, the scene, "
    "the words. If the structure came from a LOSER, do the opposite of what it did.\n"
    "Set each concept's `angle` to name the structural choice you inherited."
)


def _fallback_copy(kit: BrandKit, i: int) -> CopySet:
    """A valid, on-brand placeholder so a missing concept never blocks a run."""
    return CopySet(headline=kit.tagline, cta_label="Shop now", angle=f"placeholder {i + 1}")


def _structure_block(template: CreativeTemplate | None) -> str:
    """The template's brief, or nothing. Never a placeholder: a fabricated structure
    would be indistinguishable from a measured one at the point of use."""
    return f"\n\n{template.to_brief()}" if template else ""


def generate_concepts(client, kit: BrandKit, summary: str, n: int,
                      template: CreativeTemplate | None = None, prior=None, graph=None
                      ) -> tuple[list[AdConcept], float]:
    """Propose n ad concepts, optionally grounded in the measured structure of a real
    ad from this account (T5).

    `template` is the seam. Before it existed, this function decided the hook, the
    headline, the CTA and the scene having never once seen a winning ad: it received
    a brand kit and a summary string, text only.
    """
    system = _CONCEPTS_SYSTEM.replace("{n}", str(n))
    if template:
        system += _STRUCTURE_SYSTEM
    user = (
        f"BRAND KIT:\n{kit.model_dump_json(indent=2)}\n\n"
        f"ACCOUNT CONTEXT:\n{summary}"
        f"{_structure_block(template)}{_prior_block(prior)}{_graph_block(graph)}"
        f"\n\nPropose exactly {n} concepts."
    )
    data, cost = brain.chat_json(client, system, user)
    concepts = [AdConcept.model_validate(c) for c in data.get("concepts", [])]
    if not concepts:
        concepts = [AdConcept(title=f"Concept {i+1}", scene=kit.visual_style,
                              ad_copy=_fallback_copy(kit, i)) for i in range(n)]
    return concepts[:n], cost


# --- script (T6) -----------------------------------------------------------------

_SCRIPT_SYSTEM = (
    "You are a direct-response copywriter who writes short-form video ads that do not "
    "look like ads. Write the SPOKEN script for a {sec}-second creator-style video, as "
    "ordered beats. Return STRICT JSON only:\n"
    '{"beats": [{"purpose": str, "text": str}]}\n'
    f"`purpose` MUST be one of: {_BEATS}. Use each at most once, in a sensible order.\n"
    "The FIRST beat is always `hook`, and it must earn the next two seconds on its own: "
    "a real sentence a person would say out loud, not a slogan. No 'Introducing'. No "
    "'Are you tired of'. No brand name in the hook.\n"
    "The LAST beat should be `cta` unless there is a strong reason otherwise.\n"
    "Total spoken length ~{words} words MAX -- it has to FIT {sec} seconds when read "
    "aloud at a natural pace. Write speech, not prose: contractions, short clauses, no "
    "stage directions, no narrator labels, no emoji."
)


def _prior_block(prior) -> str:
    """What this account has MEASURED, as opposed to what a winner's structure suggests.

    The template block says "here is how a winner was built". This says "here is what
    actually moved the number when we changed one thing on purpose". The second is stronger
    evidence and is stated as such -- but only when it cleared the significance bar, because
    CreativePrior.to_brief() returns "" otherwise, and an empty prior injects nothing.
    """
    if prior is None:
        return ""
    brief = prior.to_brief()
    return f"\n\n{brief}" if brief else ""


def _graph_block(graph) -> str:
    """What winners do differently from losers, atom by atom (T12).

    WEAKER EVIDENCE THAN _prior_block, and it must stay clearly weaker at the point of use.
    A prior finding comes from a variant set: one axis changed on purpose, everything else
    held, so the difference is CAUSED by that axis. A graph atom comes from observing that
    winners happen to use it more -- and winners differ from losers in a hundred other ways
    (budget, audience, product, luck). Ordered after the prior, and its own first line says
    "correlation, not a proven cause", because a model handed two blocks of evidence will
    otherwise weight them the same.
    """
    if graph is None:
        return ""
    brief = graph.to_brief()
    return f"\n\n{brief}" if brief else ""


def _voice_block(creator) -> str:
    """How the creator talks, for the SCRIPT. The persona's speech half only: the LLM can
    honour 'filler words' exactly, and a video model cannot render it at all."""
    return f"\n\n{creator.to_voice_brief()}" if creator is not None else ""


def _who_block(creator) -> str:
    """Who the creator IS, for the STORYBOARD. Without it the director invents a new person
    for every `subject` line, and five shots describe five different people."""
    if creator is None:
        return ""
    return (f"\n\nTHE CREATOR ON CAMERA (the SAME person in every shot -- write every "
            f"`subject` around them, never a different person):\n{creator.to_visual_prompt()}")


def generate_script(client, kit: BrandKit, summary: str, *, seconds: int = 20,
                    template: CreativeTemplate | None = None,
                    creator=None, prior=None, graph=None) -> tuple[Script, float]:
    """The spoken argument, as ordered beats. Grounded in a real ad's structure when one
    was measured: if a winner opened on a pattern interrupt at 168 words per minute,
    that is evidence about this audience, and it belongs in the prompt.

    `creator` steers HOW it is written (energy, filler words). This is the reliable half of
    a persona: an LLM asked for false starts produces false starts, where a diffusion model
    asked for a specific face mostly does not."""
    words = max(8, int(seconds * 2.4))            # ~145 words/min spoken
    system = (_SCRIPT_SYSTEM.replace("{sec}", str(seconds)).replace("{words}", str(words)))
    if template:
        system += _STRUCTURE_SYSTEM
    user = (f"BRAND: {kit.brand_name} -- {kit.tagline}\n"
            f"TONE: {kit.tone}. VOICE: {', '.join(kit.voice_keywords)}\n"
            f"DO: {'; '.join(kit.dos)}\nDON'T: {'; '.join(kit.donts)}\n\n"
            f"ACCOUNT CONTEXT:\n{summary}{_structure_block(template)}"
            f"{_prior_block(prior)}{_graph_block(graph)}{_voice_block(creator)}")
    data, cost = brain.chat_json(client, system, user)
    return Script(beats=[ScriptBeat.model_validate(b) for b in data.get("beats", [])]), cost


# --- storyboard (T6) --------------------------------------------------------------

_STORYBOARD_SYSTEM = (
    "You are a director breaking a script into a shot list for a creator-style video ad. "
    "Return STRICT JSON only:\n"
    '{"shots": [{"purpose": str, "duration_s": number, "camera": str, "subject": str, '
    '"product_visible": str, "motion": str, "dialogue": str|null}]}\n'
    f"`purpose` MUST be one of: {_BEATS} -- and every beat in the script MUST be covered "
    "by at least one shot. `purpose` is how a shot is tied back to the line it renders.\n"
    f"`camera` MUST be one of: {_CAMERAS}.\n"
    f"`product_visible` MUST be one of: {_PRODUCT}.\n"
    "The FIRST shot renders the hook. The LAST shot renders the CTA.\n"
    "`subject` is a concrete visual brief for that shot: who or what is on screen, where, "
    "doing what. `motion` is what moves. `dialogue` is the line spoken during the shot, "
    "taken from the script, or null for a silent shot.\n"
    "Shots are SHORT: {lo}-{hi} seconds each. Cut every couple of seconds; that pacing is "
    "what the audience expects, not a limit of the camera. Aim for {n_lo}-{n_hi} shots "
    "totalling about {sec} seconds. Treat `duration_s` as a proposal: it will be scaled."
)


def _build_shots(raw: list[dict]) -> list[Shot]:
    """Validate each shot against the closed sets. An off-set label is a failed plan."""
    shots = []
    for i, r in enumerate(raw, 1):
        try:
            shots.append(Shot.model_validate(r))
        except Exception as e:  # noqa: BLE001
            raise sb_mod.StoryboardError(f"shot {i} is invalid: {e!s:.160}") from e
    if not shots:
        raise sb_mod.StoryboardError("no shots returned")
    return shots


def generate_storyboard(client, kit: BrandKit, script: Script, *, seconds: int = 20,
                        template: CreativeTemplate | None = None, retries: int = 1,
                        max_clip: float | None = None, creator=None, prior=None,
                        graph=None, log=print
                        ) -> tuple[Storyboard, float]:
    """Break the script into shots, then FIT and VALIDATE deterministically.

    The model's `duration_s` is a hint, rescaled by storyboard.fit_durations so the piece
    lands on `seconds` exactly. Coverage is not rescalable: if a beat has no shot, we
    retry once with the violation as a hint and then raise. Inventing the missing shot
    would put a fabricated beat next to written ones with nothing to tell them apart.
    """
    max_clip = config.VIDEO_MAX_CLIP_SECONDS if max_clip is None else max_clip
    lo, hi = config.STORY_MIN_SHOT_SECONDS, min(max_clip, config.STORY_TYPICAL_SHOT_MAX)
    n_lo = max(len(script.beats), int(seconds / hi) or 1)
    n_hi = max(n_lo, int(seconds / lo))

    system = (_STORYBOARD_SYSTEM
              .replace("{lo}", f"{lo:g}").replace("{hi}", f"{hi:g}")
              .replace("{n_lo}", str(n_lo)).replace("{n_hi}", str(min(n_hi, config.STORY_MAX_SHOTS)))
              .replace("{sec}", str(seconds)))
    base_user = (f"BRAND: {kit.brand_name}. TONE: {kit.tone}.\n"
                 f"SCRIPT:\n" +
                 "\n".join(f"  [{b.purpose}] {b.text}" for b in script.beats) +
                 _structure_block(template) + _prior_block(prior) + _graph_block(graph)
                 + _who_block(creator))

    total_cost, hint = 0.0, ""
    for attempt in range(retries + 1):
        data, cost = brain.chat_json(client, system, base_user + hint)
        total_cost += cost
        try:
            shots = _build_shots(data.get("shots", []))
            board = sb_mod.build(shots, script, target=float(seconds), max_clip=max_clip)
            return board, total_cost
        except sb_mod.StoryboardError as e:
            if attempt >= retries:
                raise
            log(f"[storyboard] rejected ({e}); retrying")
            hint = f"\n\nYOUR PREVIOUS ATTEMPT WAS REJECTED: {e}\nFix exactly that."
    raise sb_mod.StoryboardError("unreachable")


# --- structural variants (T10) ------------------------------------------------------

# What each hook type means, in prose the model can act on. The closed set is in taxonomy;
# these are its instructions. Kept here because they are prompt copy, not data.
_HOOK_GUIDANCE = {
    "pattern_interrupt": "something visually or tonally jarring that stops the scroll",
    "question": "open by asking the viewer a direct question",
    "bold_claim": "a strong assertion stated flat, no hedging",
    "pov": "a 'POV: you just...' framing, present tense",
    "authority_stat": "lead with a specific number, a credential, or a study",
    "visual_only": "a line that describes what is shown rather than making an argument",
    "controversy": "a contrarian or mildly forbidden take",
    "social_proof": "everyone is doing this / reviews / a crowd",
    "narrative": "begin a story already in motion",
    "direct_address": "speak straight to camera using 'you'",
}

_REHOOK_SYSTEM = (
    "You rewrite the OPENING LINE of a short video ad. You are given the current hook and "
    "the rest of the script, which does NOT change. Rewrite ONLY the hook, using a "
    "specific approach:\n"
    "APPROACH ({hook_type}): {guidance}.\n"
    "The new hook must earn the next two seconds on its own: a real sentence a person would "
    "say out loud, no brand name, no 'Introducing', no 'Are you tired of'. It must lead "
    "naturally into the line that follows it. Return STRICT JSON: {\"text\": str}."
)


def revary_hook(client, kit: BrandKit, script: Script, hook_type: str, *,
                template: CreativeTemplate | None = None) -> tuple[Script, float]:
    """Regenerate ONLY the hook beat, in a specified hook style. Everything else is held
    byte-identical (T10).

    This is the structural-variant primitive. To learn whether a pattern-interrupt hook
    beats a bold-claim hook for this audience, you need two ads that are identical except
    for the hook. This produces exactly that: the returned script shares every beat after
    the first with the input, and differs only in the opening line.
    """
    ht = taxonomy.coerce(taxonomy.HookType, hook_type, field="hook_type")
    system = (_REHOOK_SYSTEM.replace("{hook_type}", ht)
              .replace("{guidance}", _HOOK_GUIDANCE[ht]))
    rest = "\n".join(f"  [{b.purpose}] {b.text}" for b in script.beats[1:])
    user = (f"BRAND: {kit.brand_name}. TONE: {kit.tone}.\n"
            f"CURRENT HOOK: {script.beats[0].text}\n"
            f"THE REST OF THE SCRIPT (unchanged):\n{rest}"
            f"{_structure_block(template)}")
    data, cost = brain.chat_json(client, system, user)
    text = (data.get("text") or "").strip()
    if not text:
        raise ValueError(f"rehook for {ht!r} returned no text")
    new_hook = ScriptBeat(purpose="hook", text=text)
    return Script(beats=[new_hook, *script.beats[1:]]), cost


# --- shot repair (T9.5, rung 3) -----------------------------------------------------

_REPLAN_SYSTEM = (
    "You are a director whose shot failed a quality check. Design a REPLACEMENT shot "
    "that renders the SAME script beat a different way. Return STRICT JSON, one object:\n"
    '{"purpose": str, "duration_s": number, "camera": str, "subject": str, '
    '"product_visible": str, "motion": str, "dialogue": str|null}\n'
    "`purpose` MUST equal the failed shot's purpose. That is not negotiable: the beat "
    "still has to be rendered, and a shot serving a different beat is not a repair.\n"
    f"`camera` MUST be one of: {_CAMERAS}.\n"
    f"`product_visible` MUST be one of: {_PRODUCT}.\n"
    "Keep `duration_s` and `dialogue` as they were. Change the VISUAL approach: a "
    "different subject, framing or motion that avoids whatever the check objected to. "
    "Do not simply reword the old subject."
)


class ShotRepairError(RuntimeError):
    """The replacement shot was not a repair."""


def replan_shot(client, kit: BrandKit, shot: Shot, *, reason: str,
                template: CreativeTemplate | None = None) -> tuple[Shot, float]:
    """Rung 3: a DIFFERENT shot serving the same beat.

    The purpose is a foreign key to a ScriptBeat (T6), and it is what makes this rung
    possible at all: you can only regenerate a shot in isolation if you know what it was
    for. A replacement that changes the purpose is rejected, because it silently drops
    the beat and the coverage invariant would only notice much later.
    """
    user = (f"BRAND: {kit.brand_name}. TONE: {kit.tone}.\n"
            f"THE FAILED SHOT:\n{shot.model_dump_json(indent=2)}\n\n"
            f"WHY IT FAILED: {reason}"
            f"{_structure_block(template)}")
    data, cost = brain.chat_json(client, _REPLAN_SYSTEM, user)
    try:
        replacement = Shot.model_validate({**data, "duration_s": shot.duration_s})
    except Exception as e:  # noqa: BLE001
        raise ShotRepairError(f"replacement shot is invalid: {e!s:.160}") from e
    if replacement.purpose != shot.purpose:
        raise ShotRepairError(
            f"replacement serves the {replacement.purpose!r} beat, not {shot.purpose!r}. "
            f"That drops a beat instead of repairing a shot.")
    return replacement, cost


# --- voiceover --------------------------------------------------------------------

_VO_SYSTEM = (
    "You are an advertising copywriter writing a SHORT spoken VOICEOVER script for a "
    "{sec}-second video ad. Natural spoken-word, one or two sentences, ~{words} words MAX "
    "(it must fit the time when read aloud), on-brand for the given tone, ending on the call "
    "to action. No stage directions, no narrator labels. Return STRICT JSON: {\"script\": str}."
)


def generate_vo_script(client, kit: BrandKit, hook: str, cta: str = "",
                       seconds: int = 10) -> tuple[str, float]:
    """Legacy single-shot voiceover, for runs with no Script artifact. When a Script
    exists, prefer `script.spoken()`: it is the same text the caption drift gate checks
    against, so the two cannot disagree."""
    words = max(6, int(seconds * 2.4))            # ~145 words/min spoken
    system = _VO_SYSTEM.replace("{sec}", str(seconds)).replace("{words}", str(words))
    user = (f"BRAND: {kit.brand_name} -- tone: {kit.tone}. "
            f"HOOK: {hook}. CALL TO ACTION: {cta or 'shop now'}.")
    try:
        data, cost = brain.chat_json(client, system, user)
        script = (data.get("script") or "").strip()
    except Exception:                              # noqa: BLE001 -- never block the video
        script, cost = "", 0.0
    return (script or f"{hook}. {cta}".strip(" .") + ".", cost)
