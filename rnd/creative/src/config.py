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

# --- keys -----------------------------------------------------------------------
# Text brain + VLM verifier go through OpenRouter; ALL image/video generation goes
# through fal (the only generation provider -- see the rebuild plan, decision D1).
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
FAL_KEY = os.getenv("FAL_KEY")                        # FLUX.2 + Bria + Seedance (fal-client)

# --- model IDs (verified June 2026; see vendor research doc) ------------------
# Brain (text -> BrandKit/concepts) and the VLM critic go through OpenRouter.
TEXT_MODEL = "google/gemini-2.5-flash"
VISION_MODEL = "google/gemini-2.5-flash"             # verifier critic (multimodal)

# Image (fal-only). flux-2-flex is the brand-scene primary (typography + up to 10
# reference images); flux-2-pro is the simpler fallback; bria product-shot drops a
# real product into a generated scene; flux fill outpaints one bg to other ratios.
IMAGE_MODEL_FLEX = "fal-ai/flux-2-flex"
IMAGE_MODEL_PRO = "fal-ai/flux-2-pro"
IMAGE_MODEL_PRODUCT = "fal-ai/bria/product-shot"
IMAGE_OUTPAINT_MODEL = "fal-ai/flux-pro/v1/fill"
IMAGE_CUTOUT_MODEL = "fal-ai/birefnet/v2"            # background removal (product cutout)

# Video (fal-only). Seedance 2.0: image-to-video (seed = the text-free background),
# reference-to-video (product/brand refs), text-to-video (no seed; last resort).
# Seedance emits synced native audio when generate_audio=true (default on, free).
VIDEO_I2V = "bytedance/seedance-2.0/image-to-video"
VIDEO_REF2V = "bytedance/seedance-2.0/reference-to-video"
VIDEO_T2V = "bytedance/seedance-2.0/text-to-video"
VIDEO_DURATION_DEFAULT = 10           # seconds (Seedance accepts ~4-15)

# Per-clip ceiling a Storyboard shot may request. NOT a hard-coded 8: Seedance 2.5
# announces native 30s clips, and welding today's cap into the shot planner would
# enshrine a constraint that is dissolving. Short shots are a PACING convention that
# happens to agree with the cap. See roadmap decision UGC-D1.
VIDEO_MAX_CLIP_SECONDS = 15

# Speech-to-text: word-level timestamps drive caption burn-in (T3) and the teardown's
# spoken-hook / WPM / CTA-timing fields (T4). `chunk_level="word"` is what makes it useful.
ASR_MODEL = "fal-ai/whisper"
ASR_CHUNK_LEVEL = "word"

# Voiceover audio (fal-hosted TTS, NOT ElevenLabs) + the fal muxer that lays an
# audio track onto a video without re-rendering frames (~$0.0002/s).
VIDEO_TTS_MODEL = "fal-ai/minimax/speech-02-hd"   # voice_id below; confirm live
VIDEO_TTS_VOICE = "Wise_Woman"
AUDIO_MERGE_MODEL = "fal-ai/ffmpeg-api/merge-audio-video"

TEXT_TEMPERATURE = 0.7        # brand identity is creative; concepts vary run-to-run
CLASSIFY_TEMPERATURE = 0.0    # teardown classification is a lookup, not a creative act

# --- teardown: frame-difference shot detection (T4) ---------------------------
# No cv2, no scenedetect. Mean absolute inter-frame difference on a strided-down
# grayscale frame, in 0-255 units. A hard cut lands far above this; camera motion
# and lighting change land far below. Tuned against synthesized hard cuts in the
# test suite, then sanity-checked on real winner MP4s.
TEARDOWN_CUT_THRESHOLD = 18.0
TEARDOWN_MIN_SHOT_SECONDS = 0.35   # below this, a "cut" is a flash/flicker, not a shot
TEARDOWN_SAMPLE_FPS = 8            # temporal subsample; cuts survive, cost drops
TEARDOWN_GRID = 48                 # strided-down frame edge (px) for the diff metric
TEARDOWN_MAX_KEYFRAMES = 9         # contact-sheet tiles handed to the VLM (3x3)

# --- UGCStyle presets (T1) ----------------------------------------------------
# The `prompt:` half are wishes the model may ignore. The `post:` half are ffmpeg/PIL
# guarantees applied by the editor (T7.5). Presets live here, not in env, matching the
# model-ID convention: a taste change is a one-line edit.
UGC_STYLE_DEFAULT = {
    "camera": "handheld", "lighting": "window", "framing": "imperfect",
    "micro_shake": 1.5, "exposure_clip": 0.02, "grain": 0.04, "recompress": True,
}
STUDIO_STYLE = {          # the old default, kept for product/catalogue work
    "camera": "tripod", "lighting": "ring_light", "framing": "centered",
    "micro_shake": 0.0, "exposure_clip": 0.0, "grain": 0.0, "recompress": False,
}
