"""Central config for the creative experiment: env, paths, model IDs.

Reads the repo-root `.env` (walks up the tree), same pattern as the ai-layer.
Model IDs are constants HERE, not in env, so a vendor rename is a one-line edit.
See dev_reports/ai_serv/creative/creative-vendor-research.md for the why behind
each ID/price.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

SRC_DIR = Path(__file__).resolve().parent           # rnd/creative/src
CREATIVE_DIR = SRC_DIR.parent                        # rnd/creative
DATA_DIR = CREATIVE_DIR / "data"
OUTPUT_DIR = CREATIVE_DIR / "output"
RND_DATA_DIR = CREATIVE_DIR.parent / "data"          # rnd/data (existing mock + real samples)
DEFAULT_DATA = RND_DATA_DIR / "mock_meta_ads.json"


def _find_env() -> Path | None:
    for parent in Path(__file__).resolve().parents:
        cand = parent / ".env"
        if cand.exists():
            return cand
    return None


_env = _find_env()
if _env:
    load_dotenv(_env)

# --- keys (image/video are NEW; add to repo-root .env before a live run) ------
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")         # Nano Banana 2 + Veo (google-genai)
FAL_KEY = os.getenv("FAL_KEY")                        # FLUX + Seedance (fal-client)
# Cloudflare Workers AI: a FREE, no-card image path (FLUX.1 schnell). Draft quality,
# testing-only -- see dev_reports/ai_serv/creative/free-and-no-billing-options.md.
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")

# --- model IDs (verified June 2026; see vendor research doc) ------------------
# Brain (text -> BrandKit/concepts) goes through OpenRouter, which already works.
TEXT_MODEL = "google/gemini-2.5-flash"

# Image: Nano Banana 2 primary (GA, no -preview), FLUX.2 pro fallback (fal).
IMAGE_PRIMARY_MODEL = "gemini-3.1-flash-image"
IMAGE_PRO_MODEL = "gemini-3-pro-image"               # best logo/text fidelity (opt-in)
IMAGE_FALLBACK_MODEL = "fal-ai/flux-2-pro"
# Cloudflare Workers AI (free). SDXL (not FLUX schnell) because it supports a real
# negative_prompt -- needed to actually suppress text/logos in the generated ads.
IMAGE_FREE_MODEL = "@cf/stabilityai/stable-diffusion-xl-base-1.0"

# Video: Veo 3.1 primary (still preview), Seedance 2.0 fallback (fal).
VIDEO_PRIMARY_MODEL = "veo-3.1-generate-preview"
VIDEO_FALLBACK_T2V = "bytedance/seedance-2.0/text-to-video"
VIDEO_FALLBACK_I2V = "bytedance/seedance-2.0/image-to-video"

TEXT_TEMPERATURE = 0.7        # brand identity is creative; concepts vary run-to-run
