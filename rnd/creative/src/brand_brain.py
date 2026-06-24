"""The brain: turn the selected-campaign summary into a structured BrandKit and a
set of ad concepts. Text generation goes through OpenRouter (already wired and
paid), returned as strict JSON and validated against the schemas.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config  # noqa: E402
import ledger  # noqa: E402
from schemas import AdConcept, BrandKit, CopySet  # noqa: E402

_KIT_SYSTEM = (
    "You are an elite brand strategist and art director. From the ad-account summary, "
    "FIRST infer the brand's category, its audience, and what the winning campaigns reveal "
    "about what those customers actually respond to. THEN design a distinctive, ownable brand "
    "identity that fits -- intuitive and strategically grounded, never generic, derivative, or "
    "stock. Return STRICT JSON only (no prose, no markdown fences). Schema:\n"
    "{\n"
    '  "brand_name": str, "tagline": str,\n'
    '  "palette": [{"role": "primary|secondary|accent|bg", "hex": "#RRGGBB"}],  // 3-5 colors\n'
    '  "typography": {"heading_style": str, "body_style": str},\n'
    '  "tone": str, "voice_keywords": [str],\n'
    '  "dos": [str], "donts": [str],\n'
    '  "visual_style": str,  // e.g. "clean studio, warm light, minimal props"\n'
    '  "logo": {"brief": str}  // ONE strong, renderable mark concept\n'
    "}\n"
    "Make it SMART, not safe:\n"
    "- Palette: intentional and category-right, with real contrast. Avoid the obvious cliche "
    "(default SaaS teal/orange, lazy luxury black+gold) unless it is genuinely the best call. "
    "Give a clear primary, a supporting secondary, one accent, and a background.\n"
    "- Tone, voice, dos, donts: specific to THIS brand and audience -- concrete and VISUAL "
    "(things an art director can act on), never interchangeable boilerplate or platitudes.\n"
    "- logo.brief: one memorable, reductive idea (a specific mark or monogram) -- no cliche "
    "swoosh, globe, generic leaf, or gradient blob.\n"
    "Every hex is a real 6-digit hex. Keep lists to 3-5 items."
)

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


def _fallback_copy(kit: BrandKit, i: int) -> CopySet:
    """A valid, on-brand placeholder so a missing concept never blocks a run."""
    return CopySet(headline=kit.tagline, cta_label="Shop now", angle=f"placeholder {i + 1}")


def _chat_json(client, system: str, user: str) -> tuple[dict, float]:
    """One OpenRouter call constrained to a JSON object; tolerant of stray fences.
    Returns (parsed, cost_usd) -- cost is OpenRouter's authoritative usage.cost."""
    resp = client.chat.completions.create(
        model=config.TEXT_MODEL,
        temperature=config.TEXT_TEMPERATURE,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system},
                  {"role": "user", "content": user}],
    )
    text = (resp.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):text.rfind("}") + 1]
    return json.loads(text), ledger.response_cost(resp)


def generate_brand_kit(client, summary: str) -> tuple[BrandKit, float]:
    data, cost = _chat_json(client, _KIT_SYSTEM, summary)
    return BrandKit.model_validate(data), cost


def generate_concepts(client, kit: BrandKit, summary: str, n: int) -> tuple[list[AdConcept], float]:
    user = (
        f"BRAND KIT:\n{kit.model_dump_json(indent=2)}\n\n"
        f"ACCOUNT CONTEXT:\n{summary}\n\nPropose exactly {n} concepts."
    )
    data, cost = _chat_json(client, _CONCEPTS_SYSTEM.replace("{n}", str(n)), user)
    concepts = [AdConcept.model_validate(c) for c in data.get("concepts", [])]
    if not concepts:
        concepts = [AdConcept(title=f"Concept {i+1}", scene=kit.visual_style,
                              ad_copy=_fallback_copy(kit, i)) for i in range(n)]
    return concepts[:n], cost
