"""Shared fixtures + a fake OpenRouter client (no network, no spend)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from schemas import AdConcept, BrandKit  # noqa: E402

# --- a fake OpenAI-compatible client that routes on the system prompt ---------

class _Msg:
    def __init__(self, content): self.content = content

class _Choice:
    def __init__(self, content): self.message = _Msg(content)

class _Resp:
    def __init__(self, content): self.choices = [_Choice(content)]

class _Completions:
    def __init__(self, router): self._router = router
    def create(self, *, model, messages, **kw):
        return _Resp(self._router(messages[0]["content"]))

class _Chat:
    def __init__(self, router): self.completions = _Completions(router)

class FakeClient:
    def __init__(self, router): self.chat = _Chat(router)


KIT_JSON = {
    "brand_name": "Lumen", "tagline": "Light, made simple.",
    "palette": [{"role": "primary", "hex": "#0FB5AE"},
                {"role": "accent", "hex": "#FFB703"},
                {"role": "bg", "hex": "#FFFFFF"}],
    "typography": {"heading_style": "geometric sans, bold", "body_style": "humanist sans"},
    "tone": "warm, confident, uncluttered",
    "voice_keywords": ["clear", "calm", "premium"],
    "dos": ["use lots of negative space", "keep one hero subject"],
    "donts": ["no clutter", "no neon gradients"],
    "visual_style": "clean studio, warm light, minimal props",
    "logo": {"brief": "a soft rounded lamp glyph beside the wordmark"},
}

CONCEPTS_JSON = {"concepts": [
    {"title": "Morning Glow", "scene": "product on a sunlit oak table, soft shadows"},
    {"title": "Night Calm", "scene": "product glowing on a dark bedside, cozy mood"},
    {"title": "Studio Hero", "scene": "product centered on seamless backdrop, rim light"},
    {"title": "In The Hand", "scene": "hands holding the product against a warm wall"},
]}


def _router(system_content: str) -> str:
    # the kit schema names "brand_name"; the concepts prompt never does.
    if "brand_name" in system_content:
        return json.dumps(KIT_JSON)
    return json.dumps(CONCEPTS_JSON)


@pytest.fixture
def fake_client():
    return FakeClient(_router)


@pytest.fixture
def brand_kit() -> BrandKit:
    return BrandKit.model_validate(KIT_JSON)


@pytest.fixture
def concepts() -> list[AdConcept]:
    return [AdConcept.model_validate(c) for c in CONCEPTS_JSON["concepts"]]


@pytest.fixture
def envelope_path(tmp_path) -> str:
    """A tiny Meta-style envelope written to disk (3 campaigns, distinct ROAS)."""
    def row(cid, name, spend, rev, purch, date="2026-05-01"):
        return {
            "campaign_id": cid, "campaign_name": name,
            "date_start": date, "date_stop": date,
            "spend": str(spend), "impressions": "10000", "reach": "8000",
            "frequency": "1.25", "clicks": "200", "ctr": "2", "cpc": "1",
            "inline_link_clicks": "150", "inline_link_click_ctr": "1.5",
            "actions": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purch)}],
            "action_values": [{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(rev)}],
        }
    envelope = {
        "meta": {"account_id": "act_1", "account_name": "Test Brand", "currency": "INR",
                 "date_range": {"since": "2026-05-01", "until": "2026-05-31"},
                 "level": "campaign", "source": "mock"},
        "data": [
            row("a", "Alpha", 100, 500, 5),    # roas 5.0
            row("b", "Beta", 200, 400, 4),     # roas 2.0
            row("c", "Gamma", 50, 300, 3, "2026-05-20"),  # roas 6.0, most recent
        ],
    }
    p = tmp_path / "env.json"
    p.write_text(json.dumps(envelope), encoding="utf-8")
    return str(p)
