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
from schemas import AdConcept, BrandKit  # noqa: E402

_KIT_SYSTEM = (
    "You are a brand designer. From the ad-account summary you are given, INVENT a "
    "coherent brand identity for this brand and return it as STRICT JSON only (no "
    "prose, no markdown fences). Ground your choices in what the data shows is "
    "working, but the visual identity is your creative invention. Schema:\n"
    "{\n"
    '  "brand_name": str, "tagline": str,\n'
    '  "palette": [{"role": "primary|secondary|accent|bg", "hex": "#RRGGBB"}],  // 3-5 colors\n'
    '  "typography": {"heading_style": str, "body_style": str},\n'
    '  "tone": str, "voice_keywords": [str],\n'
    '  "dos": [str], "donts": [str],\n'
    '  "visual_style": str,  // e.g. "clean studio, warm light, minimal props"\n'
    '  "logo": {"brief": str}  // a vivid description an image model can render\n'
    "}\n"
    "Every hex must be a real 6-digit hex. Keep lists to 3-5 items."
)

_CONCEPTS_SYSTEM = (
    "You are an art director. Given a brand kit and what's working in the account, "
    "propose {n} distinct image-ad concepts as STRICT JSON only:\n"
    '{"concepts": [{"title": str, "scene": str}]}\n'
    "Each `scene` is a concrete visual description (subject, setting, composition, "
    "mood) for a single still ad -- no text overlays (copy is added later). Make the "
    "concepts visually varied but unmistakably the same brand."
)


def _chat_json(client, system: str, user: str) -> dict:
    """One OpenRouter call constrained to a JSON object; tolerant of stray fences."""
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
    return json.loads(text)


def generate_brand_kit(client, summary: str) -> BrandKit:
    data = _chat_json(client, _KIT_SYSTEM, summary)
    return BrandKit.model_validate(data)


def generate_concepts(client, kit: BrandKit, summary: str, n: int) -> list[AdConcept]:
    user = (
        f"BRAND KIT:\n{kit.model_dump_json(indent=2)}\n\n"
        f"ACCOUNT CONTEXT:\n{summary}\n\nPropose exactly {n} concepts."
    )
    data = _chat_json(client, _CONCEPTS_SYSTEM.replace("{n}", str(n)), user)
    concepts = [AdConcept.model_validate(c) for c in data.get("concepts", [])]
    return concepts[:n] if concepts else [
        AdConcept(title=f"Concept {i+1}", scene=kit.visual_style) for i in range(n)
    ]
