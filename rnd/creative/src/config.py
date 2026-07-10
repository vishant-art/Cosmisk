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

# Meta grounding (Phase 9.1). META_ACCESS_TOKEN pulls the winner cohort; META_AD_ACCOUNT
# is the act_<id> to pull it from. When the account is set, a normal run attempts
# grounding by default (no --meta-account flag needed) and degrades gracefully to
# UNGROUNDED if the token is missing/expired -- the fetch never blocks a run.
META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN")
META_AD_ACCOUNT = os.getenv("META_AD_ACCOUNT")        # e.g. act_1234567890

# Shopify product source (Phase 9.6). With both set, a run sources the product image from
# the store's bestseller instead of fabricating one, and degrades gracefully to "no
# product" when unset -- same posture as Meta grounding.
SHOPIFY_STORE = os.getenv("SHOPIFY_STORE")            # e.g. my-shop.myshopify.com
SHOPIFY_TOKEN = os.getenv("SHOPIFY_TOKEN")            # Admin API access token
SHOPIFY_API_VERSION = os.getenv("SHOPIFY_API_VERSION", "2024-10")

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
VIDEO_DURATION_DEFAULT = 10           # seconds

# Seedance accepts a DISCRETE set of durations, not a range. 7, 9, 11, 13 and 14 are
# rejected by the API. Verified against fal's model page, July 2026.
VIDEO_ALLOWED_DURATIONS = (4, 5, 6, 8, 10, 12, 15)
VIDEO_MIN_CLIP_SECONDS = 4            # the renderer's floor

# THE PACING/BILLING CONFLICT. Short-form pacing wants shots of 1.2-4.0s
# (STORY_TYPICAL_SHOT_MAX). The renderer will not produce a clip shorter than 4s. So a
# 2-second shot is GENERATED at 4 seconds, BILLED at 4 seconds, and trimmed to 2. Cutting
# every two seconds costs double.
#
# This is a property of the renderer, not of the storyboard, and the storyboard must not
# be bent to accommodate it: pacing is a creative decision and billing is not. The
# sequencer snaps up, trims down, and records both numbers in the ledger so the waste is
# visible rather than absorbed. It also puts a real number on UGC-D1: a single-pass
# 30-second model would not merely be more convenient, it would be cheaper per second of
# finished ad than shot-by-shot rendering at this floor.

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

# --- script + storyboard (T6) --------------------------------------------------
# Shot lengths are a PACING convention, not a model limit. Cutting every couple of
# seconds is what the audience expects; VIDEO_MAX_CLIP_SECONDS is a separate, moving
# ceiling imposed by whichever renderer is current. Keep the two ideas apart, or a
# 30-second-native model arrives and the shot planner still thinks in 8s slices.
STORY_DEFAULT_SECONDS = 20
STORY_MIN_SHOT_SECONDS = 1.2
STORY_TYPICAL_SHOT_MAX = 4.0    # what a director should aim for, not what a model allows
STORY_MAX_SHOTS = 12

# --- captions (T3, an editor operation per UGC-D8) ----------------------------
# Burned-in per-word captions are the single strongest signal that a clip is creator
# content rather than an ad. They are also the architecture's own thesis applied to
# the time axis: the model never renders the text, the compositor does, deterministically,
# and it is verified. A caption must match the audio to the word, and no video model
# will ever do that.
CAPTION_WORDS_PER_CUE = 3      # TikTok-native: 1-3 words on screen at a time
CAPTION_MAX_GAP_S = 0.6        # a silence longer than this breaks the cue (sentence end)
CAPTION_MAX_CUE_S = 2.0        # no cue lingers longer than this, even mid-phrase
CAPTION_TAIL_S = 0.35          # how long the final cue holds after the last word ends
CAPTION_FPS = 24               # caption overlay framerate (independent of the clip's)

# Caption text sits ABOVE the bottom safe zone (9:16 reserves 0.20 for platform UI).
CAPTION_BAND_Y = 0.60          # top of the caption band, relative to height
CAPTION_BAND_H = 0.16
CAPTION_MAX_FONT_PT = 96
CAPTION_COLOR = "#FFFFFF"
CAPTION_ACTIVE_COLOR = "#FFD400"   # overridden by the brand kit's accent when present
CAPTION_STROKE_FRAC = 0.10     # outline width as a fraction of font px

# Fail-closed caption/audio agreement. We ASR our OWN voiceover, so drift this large
# means something is genuinely wrong (wrong audio file, wrong language, TTS failure),
# not that Whisper had an off day. A caption that says something other than the audio
# is worse than no caption. See verify_agreement().
CAPTION_MAX_DRIFT = 0.35

# --- temporal QA gate (T9) ----------------------------------------------------
# Four of five checks are arithmetic. That is the whole differentiator: every competitor
# puts a human here, because verifying a temporal artifact is unsolved. It is only
# tractable for us because the editor PLACED the cuts, wrote the captions, and knows
# the shot durations. We are not detecting our own work; we are asserting it.
QA_SHOT_DURATION_TOL_S = 0.15    # a rendered shot may drift this far from the plan
QA_CUT_TOL_S = 0.30              # a detected cut may land this far from a planned one

# Continuity across a cut, as the zero-mean normalized CORRELATION of the frames either
# side. Not a perceptual hash: dHash cannot do this job. Measured on realistic footage,
# a duplicate shot re-graded brighter scored 0.141 and an unrelated scene scored 0.141
# on the same dHash scale. The classes overlap completely, at every hash size.
# Correlation is affine-intensity invariant by construction, which is exactly the
# invariance the question needs.
#
# Measured (luminance correlation, realistic smooth footage):
#   identical frame          1.000    duplicate, shot never advanced
#   duplicate re-graded -60  0.999
#   continuous, small change 0.968
#   continuous, 6px pan      0.903
#   continuous, 12px pan     0.806
#   unrelated scene          0.226 - 0.702
QA_STALL_CORR = 0.98        # at or above: nothing changed across the cut
QA_CONTINUITY_MIN_CORR = 0.75   # below, in SEQUENTIAL mode: the model lost the thread

# A frozen shot is a DIFFERENT question, measured against the shot's FIRST frame rather
# than against each frame's predecessor. Consecutive frames of any real footage correlate
# above 0.98 (a 1px/frame pan measures 0.998 adjacent), so an adjacent-frame test calls
# all real video frozen. Against the first frame the classes separate:
#   frozen                     1.0000
#   frozen + our micro_shake   0.9972   cosmetic shake must not rescue a stalled render
#   frozen + our punch-in      1.0000   a punch-in on a still is still a still
#   slow pan, 1px/frame        0.7852
#   pan, 3px/frame             0.3841
QA_FROZEN_CORR = 0.99
# A flat frame has zero variance, so correlation is undefined. Below this the continuity
# comparison is INCONCLUSIVE, not failed: two different solid-colour scenes are a
# legitimate cut that no correlation can see.
QA_MIN_FRAME_STD = 2.0

# Masked normalized cross-correlation of the product cutout against sampled frames.
# Correlates GRADIENT MAGNITUDE, not luminance: a smooth product template correlates
# with any smooth background (measured 0.90 for an absent product), while its edge
# structure does not. Masked by the cutout's alpha so the transparent surround, which
# is background by definition, contributes nothing.
# Measured with this metric: product present = 0.61, absent = 0.18, unrelated = 0.18.
QA_PRODUCT_MIN_SCORE = 0.35
QA_PRODUCT_FRAME_WIDTH = 96      # frames are downscaled before matching
QA_PRODUCT_SCALES = (0.30, 0.42, 0.55)   # template width as a fraction of the frame
QA_PRODUCT_SAMPLE_FPS = 2

# --- shot recovery (T9.5) ------------------------------------------------------
# Escalate, do not loop. A model that produced a bad shot from a prompt will usually
# produce another bad shot from the same prompt, so retrying more than once is paying
# twice for the same mistake.
#
#   0 retry     the same prompt (models are stochastic; once is worth it)
#   1 reprompt  the same shot, prompt seeded with the QA hint
#   2 replan    a DIFFERENT shot serving the same beat purpose
#   3 drop      remove the shot, redistribute its seconds across the neighbours
#
# Rung 3 is what stops one bad beat from burning the budget.
RECOVERY_LADDER = ("retry", "reprompt", "replan", "drop")
# A global ceiling across the whole board, so a systematically broken renderer costs a
# bounded amount rather than N * ladder_depth.
RECOVERY_MAX_TOTAL_RENDERS = 40

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
