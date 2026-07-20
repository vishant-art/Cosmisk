"""The brand brain: identity, and only identity.

Turns the selected-campaign summary (optionally grounded in real winning-ad images)
into a validated BrandKit. Text generation goes through OpenRouter via `brain.chat_json`,
returned as strict JSON and validated against the schemas.

Split from the argument-making half in T6. The boundary is deliberate and it is not
planner/strategist/copywriter, which is an org chart. It is:

    brand_brain  -- IDENTITY.  Does not consume a CreativeTemplate.
    story_brain  -- ARGUMENT.  Concepts, script, storyboard, voiceover. Consumes it.

If you are about to add a function here that takes a `template=` argument, it belongs
in story_brain.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import brain  # noqa: E402
from schemas import BrandKit  # noqa: E402

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
    '  "tone_scales": {"formal_casual": 0, "serious_funny": 0, "reserved_bold": 0, "corporate_personal": 0},  // each 0-10\n'
    '  "always_use": [str],  // 5-15 on-voice words/phrases\n'
    '  "banned": [str],  // 10-20 words/phrases to never use (the AI-slop and off-brand ones)\n'
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
    "- Operational voice: score tone_scales 0-10 on each axis; always_use and banned are CONCRETE "
    "word lists an editor can enforce, not adjectives. Ban the generic AI-marketing words this "
    "brand would never say.\n"
    "- logo.brief: one memorable, reductive idea (a specific mark or monogram) -- no cliche "
    "swoosh, globe, generic leaf, or gradient blob.\n"
    "Every hex is a real 6-digit hex. Keep lists to 3-5 items."
)


def generate_brand_kit(client, summary: str, ground_images: list[str] | None = None
                       ) -> tuple[BrandKit, float]:
    """Design the brand identity, grounded in the account's real winners when we have them.

    `ground_images` are the winning ads' pixels. This vision pass is the only place the
    brain looks at what actually converted for this account, and it is on by default.
    """
    user = summary if not ground_images else brain.vision_user(
        summary, ground_images,
        "Ground the brand identity in these REAL winning ads from this account -- infer the "
        "actual palette, visual style, and product look from them, not just the numbers.")
    data, cost = brain.chat_json(client, _KIT_SYSTEM, user)
    return BrandKit.model_validate(data), cost
