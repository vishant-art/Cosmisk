"""Shared fixtures + a fake OpenRouter client (no network, no spend)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from schemas import AdConcept, BrandKit, CopySet  # noqa: E402

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

def _copy(headline, cta, angle):
    return {"headline": headline, "cta_label": cta, "angle": angle}

CONCEPTS_JSON = {"concepts": [
    {"title": "Morning Glow", "scene": "product on a sunlit oak table, soft shadows",
     "ad_copy": _copy("Wake to warm light", "Shop now", "in-use lifestyle")},
    {"title": "Night Calm", "scene": "product glowing on a dark bedside, cozy mood",
     "ad_copy": _copy("Calm, on a dimmer", "Discover", "mood/benefit")},
    {"title": "Studio Hero", "scene": "product centered on seamless backdrop, rim light",
     "ad_copy": _copy("Light, made simple", "See the range", "hero-product")},
    {"title": "In The Hand", "scene": "hands holding the product against a warm wall",
     "ad_copy": _copy("Fits your everyday", "Get yours", "human scale")},
]}


SCRIPT_JSON = {"beats": [
    {"purpose": "hook", "text": "I genuinely thought this was a scam."},
    {"purpose": "problem", "text": "My hallway was always dark."},
    {"purpose": "demo", "text": "You just twist it and it warms up."},
    {"purpose": "proof", "text": "Three weeks in and I have not touched the switch."},
    {"purpose": "cta", "text": "Shop the new collection."},
]}

STORYBOARD_JSON = {"shots": [
    {"purpose": "hook", "duration_s": 2, "camera": "selfie", "subject": "woman to camera",
     "product_visible": "absent", "motion": "walks in", "dialogue": "I genuinely thought this was a scam."},
    {"purpose": "problem", "duration_s": 3, "camera": "handheld_wide", "subject": "dark hallway",
     "product_visible": "absent", "motion": "pan", "dialogue": "My hallway was always dark."},
    {"purpose": "demo", "duration_s": 4, "camera": "macro", "subject": "hands twisting the lamp",
     "product_visible": "hero", "motion": "twist", "dialogue": "You just twist it and it warms up."},
    {"purpose": "proof", "duration_s": 3, "camera": "close_up", "subject": "her face, lit warm",
     "product_visible": "background", "motion": "smile", "dialogue": "Three weeks in."},
    {"purpose": "cta", "duration_s": 2, "camera": "selfie", "subject": "product held up",
     "product_visible": "hero", "motion": "hold", "dialogue": "Shop the new collection."},
]}


def _router(system_content: str) -> str:
    # route on a token unique to each system prompt.
    if "VOICEOVER" in system_content:
        return json.dumps({"script": "Discover timeless craftsmanship. Shop the new collection."})
    if "shot list" in system_content:
        return json.dumps(STORYBOARD_JSON)
    if "SPOKEN script" in system_content:
        return json.dumps(SCRIPT_JSON)
    if "brand_name" in system_content:
        return json.dumps(KIT_JSON)
    return json.dumps(CONCEPTS_JSON)


@pytest.fixture
def script():
    from schemas import Script
    return Script.model_validate(SCRIPT_JSON)


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
def copyset() -> CopySet:
    return CopySet(headline="Light, made simple", subhead="For every room",
                   cta_label="Shop now", legal="*T&C apply", angle="hero-product")


# --- a synthesized MP4 with cuts at KNOWN timestamps --------------------------
# Written at test time with the ffmpeg binary imageio-ffmpeg already bundles. Nothing
# is checked into git, so nothing can be silently gitignored, and shot detection gets
# a ground truth to assert against instead of a vibe. Silent by construction: the ASR
# path must degrade to None rather than invent a hook.

SYNTH_FPS = 10
SYNTH_SHOT_SECONDS = 1.0
SYNTH_COLORS = [(220, 30, 30), (30, 200, 60), (40, 60, 230)]   # cuts at t=1.0, t=2.0


@pytest.fixture
def synth_video(tmp_path) -> str:
    """3 solid-colour shots x 1.0s @ 10fps. Cuts at 1.0s and 2.0s. No audio track."""
    import imageio_ffmpeg
    import numpy as np

    size = (64, 64)
    out = tmp_path / "synth.mp4"
    writer = imageio_ffmpeg.write_frames(str(out), size, fps=SYNTH_FPS, macro_block_size=1)
    writer.send(None)
    for color in SYNTH_COLORS:
        frame = np.zeros((size[1], size[0], 3), dtype=np.uint8)
        frame[:, :] = color
        for _ in range(int(SYNTH_FPS * SYNTH_SHOT_SECONDS)):
            writer.send(frame.tobytes())
    writer.close()
    return str(out)


@pytest.fixture
def other_video(tmp_path) -> str:
    """A second clip with the SAME geometry as synth_video, for transitions."""
    import imageio_ffmpeg
    import numpy as np
    out = tmp_path / "other.mp4"
    w = imageio_ffmpeg.write_frames(str(out), (64, 64), fps=SYNTH_FPS, macro_block_size=1)
    w.send(None)
    for _ in range(int(SYNTH_FPS * 3)):
        w.send(np.full((64, 64, 3), 180, dtype=np.uint8).tobytes())
    w.close()
    return str(out)


@pytest.fixture
def noisy_video(tmp_path) -> str:
    """Textured frames. A solid-colour clip compresses to almost nothing at any CRF, so
    it cannot show whether `recompress` actually threw bits away."""
    import imageio_ffmpeg
    import numpy as np
    out = tmp_path / "noisy.mp4"
    rng = np.random.default_rng(0)
    w = imageio_ffmpeg.write_frames(str(out), (96, 96), fps=SYNTH_FPS, macro_block_size=1)
    w.send(None)
    for _ in range(int(SYNTH_FPS * 2)):
        w.send(rng.integers(0, 255, (96, 96, 3), dtype=np.uint8).tobytes())
    w.close()
    return str(out)


@pytest.fixture
def fake_words() -> list[dict]:
    """Word-level ASR output, as fal Whisper returns it once normalized."""
    raw = [("I", 0.0), ("genuinely", 0.2), ("did", 0.5), ("not", 0.7), ("expect", 0.9),
           ("this", 1.2), ("to", 1.4), ("work", 1.6), ("so", 2.0), ("shop", 2.3),
           ("now", 2.6)]
    return [{"text": t, "start": s, "end": s + 0.18} for t, s in raw]


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
