"""Hermetic, $0, no-network dry-run of the Creative Studio HTTP API.

Drives `ai_layer.api:app` in-process via FastAPI TestClient and produces REAL (tiny)
images, video clips and audio, while spending ZERO dollars and making ZERO network
calls. The REAL pipeline runs (sequencer, recovery ladder, editor ffmpeg ops, caption
burn-in, SFX synthesis, ledger); only the LOW provider/brain seams are mocked, and the
media those mocks emit is genuine so the editor/caption/concat code paths run for real.

This is the $0 sibling of `creative_api_liverun.py`: same app, same routes, same
pipeline, but every paid seam is mocked so it proves the WIRING and the money-gating
without spending. Use it to smoke the full creative surface for free before a live run.

Output goes to `apps/ai-layer/live_runs/dryrun_<stamp>/` (gitignored), or pass an
explicit output base dir as the first CLI arg.

Run (cwd = apps/ai-layer):
  ../../cos/Scripts/python.exe tools/creative_api_dryrun.py
  ../../cos/Scripts/python.exe tools/creative_api_dryrun.py /some/other/out_base
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

# ---------------------------------------------------------------------------
# 0. Paths + a fresh run output dir (gitignored live_runs/, or argv[1] base)
# ---------------------------------------------------------------------------
_AILAYER = Path(__file__).resolve().parents[1]          # apps/ai-layer
_OUT_BASE = Path(sys.argv[1]) if len(sys.argv) > 1 else _AILAYER / "live_runs"
STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
OUTPUT_DIR = _OUT_BASE / f"dryrun_{STAMP}"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
REPORT_PATH = OUTPUT_DIR / "DRYRUN_REPORT.md"

# Keys that must never be live. Popped BEFORE import (defensive) and AGAIN after import
# (config.py runs load_dotenv at import time, which repopulates os.environ from repo .env).
SECRET_KEYS = [
    "OPENROUTER_API_KEY", "FAL_KEY", "FAL_ADMIN_KEY",
    "META_ACCESS_TOKEN", "META_AD_ACCOUNT",
    "SHOPIFY_TOKEN", "SHOPIFY_STORE", "AI_LAYER_API_KEY",
]


def _strip_env():
    for k in SECRET_KEYS:
        os.environ.pop(k, None)


_strip_env()
# Point the creative OUTPUT_DIR (and the StaticFiles mount) at our scratch dir from
# the very first import, so generated assets land here and asset URLs resolve.
os.environ["CREATIVE_OUTPUT_DIR"] = str(OUTPUT_DIR)

# ---------------------------------------------------------------------------
# 1. Imports (config.py load_dotenv fires here and repopulates os.environ)
# ---------------------------------------------------------------------------
import imageio_ffmpeg  # noqa: E402
import numpy as np  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from ai_layer import config as ai_config  # noqa: E402
from ai_layer.creative import (  # noqa: E402
    config as ccfg,
    fal_billing,
    image_providers,
    logo as logo_mod,
    pipeline,
    verifier,
    verifier_video,
    video_providers,
)
from ai_layer.creative.schemas import QACheck, QAReport  # noqa: E402
from ai_layer.api import app  # noqa: E402

# ---------------------------------------------------------------------------
# 2. Kill every credential: strip env AGAIN + null the config module attrs
#    (they are captured at import time, so delenv alone is not enough).
# ---------------------------------------------------------------------------
_strip_env()
os.environ["CREATIVE_OUTPUT_DIR"] = str(OUTPUT_DIR)

ai_config.AI_LAYER_API_KEY = None          # opens the X-API-Key gate
ai_config.OPENROUTER_API_KEY = None
ai_config.META_ACCESS_TOKEN = None
for _attr in ("OPENROUTER_API_KEY", "FAL_KEY", "META_ACCESS_TOKEN", "META_AD_ACCOUNT",
              "SHOPIFY_TOKEN", "SHOPIFY_STORE"):
    setattr(ccfg, _attr, None)
ccfg.OUTPUT_DIR = OUTPUT_DIR               # belt & suspenders (env already set it)

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()

# ---------------------------------------------------------------------------
# 3. A fake OpenAI-compatible client that routes on the system prompt.
#    (Same shape as tests/creative/conftest.py's FakeClient + _router, extended so
#    the script/storyboard honour the pinned shot count n_shots.)
# ---------------------------------------------------------------------------
class _Msg:
    def __init__(self, content): self.content = content


class _Choice:
    def __init__(self, content): self.message = _Msg(content)


class _Resp:
    # Deliberately NOT a pydantic model -> ledger.response_cost(resp) hits its
    # try/except and returns 0.0, so every LLM row is $0.
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

_PURPOSE_TEXT = {
    "hook": "I honestly did not think this would work.",
    "problem": "My mornings were always a scramble.",
    "demo": "You just twist the top and it warms up.",
    "proof": "Three weeks in and I have not touched a switch.",
    "agitate": "Everything else I tried felt like a chore.",
    "objection": "I know, it sounds a little too easy.",
    "cta": "Shop the new collection today.",
}
_PURPOSE_CAM = {"hook": "selfie", "problem": "handheld_wide", "demo": "macro",
                "proof": "close_up", "agitate": "handheld_wide",
                "objection": "selfie", "cta": "selfie"}
_PURPOSE_PROD = {"hook": "absent", "problem": "absent", "demo": "hero",
                 "proof": "background", "agitate": "absent",
                 "objection": "absent", "cta": "background"}


def _purposes_for(n: int) -> list[str]:
    n = max(1, int(n))
    if n == 1:
        return ["hook"]
    if n == 2:
        return ["hook", "cta"]
    middle = ["problem", "demo", "proof", "agitate", "objection"][:n - 2]
    return ["hook"] + middle + ["cta"]


def _build_script(n: int) -> dict:
    return {"beats": [{"purpose": p, "text": _PURPOSE_TEXT[p]} for p in _purposes_for(n)]}


def _build_board(n: int) -> dict:
    shots = []
    for p in _purposes_for(n):
        subj = ("the product held in one hand, filling the frame"
                if _PURPOSE_PROD[p] == "hero"
                else f"a person in a bright kitchen, {p} beat")
        shots.append({"purpose": p, "duration_s": 4, "camera": _PURPOSE_CAM[p],
                      "subject": subj, "product_visible": _PURPOSE_PROD[p],
                      "motion": "a slow handheld push in", "dialogue": _PURPOSE_TEXT[p]})
    return {"shots": shots}


def _router(system: str) -> str:
    if "VOICEOVER" in system:
        return json.dumps({"script": "Discover the difference. Shop the new collection."})
    if "OPENING LINE" in system:
        return json.dumps({"text": "Here is the part nobody tells you."})
    if "REPLACEMENT shot" in system:
        return json.dumps({"purpose": "demo", "duration_s": 4.0, "camera": "close_up",
                           "subject": "a different angle of the product", "product_visible": "hero",
                           "motion": "hands enter frame", "dialogue": None})
    if "shot list" in system:                      # storyboard
        m = re.search(r"Aim for\s+(\d+)\s*-\s*(\d+)\s+shots", system)
        return json.dumps(_build_board(int(m.group(2)) if m else 3))
    if "SPOKEN script" in system:                  # script
        m = re.search(r"AT MOST\s+(\d+)\s+beats", system)
        return json.dumps(_build_script(int(m.group(1)) if m else 3))
    if "brand_name" in system:                     # brand kit
        return json.dumps(KIT_JSON)
    return json.dumps(CONCEPTS_JSON)               # concepts (default)


# ---------------------------------------------------------------------------
# 4. Low provider seams -> real media, $0, no network.
# ---------------------------------------------------------------------------
_ASPECT_SIZE = {"1:1": (1024, 1024), "4:5": (1024, 1280), "9:16": (1080, 1920),
                "16:9": (1920, 1080), "5:4": (1280, 1024)}
_VID_W, _VID_H = 180, 320       # exact 9:16, tiny, even dims for yuv420p
_VID_FPS = 24


def _draw_png(path, size, rgba=False):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    mode = "RGBA" if rgba else "RGB"
    im = Image.new(mode, size, (238, 236, 230, 255) if rgba else (238, 236, 230))
    d = ImageDraw.Draw(im)
    w, h = size
    d.ellipse([w * 0.22, h * 0.20, w * 0.78, h * 0.66],
              fill=(206, 122, 58, 255) if rgba else (206, 122, 58))
    d.rectangle([0, int(h * 0.74), w, h], fill=(28, 38, 58, 255) if rgba else (28, 38, 58))
    im.save(path)
    return str(path)


def fake_image_gwf(prompt, out_path, **kw):
    size = _ASPECT_SIZE.get(kw.get("aspect", "1:1"), (1024, 1024))
    _draw_png(out_path, size)
    return {"provider": "flux", "model": "fal-ai/flux-2-flex",
            "path": str(out_path), "cost_usd": 0.0}


def fake_cutout(src_path, out_path):
    _draw_png(out_path, (600, 600), rgba=True)
    return {"provider": "birefnet", "model": "fal-ai/birefnet/v2",
            "path": str(out_path), "cost_usd": 0.0}


def _write_video(out_path, seconds):
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    n = max(2, int(round(float(seconds) * _VID_FPS)))
    writer = imageio_ffmpeg.write_frames(str(out_path), (_VID_W, _VID_H),
                                         fps=_VID_FPS, macro_block_size=1)
    writer.send(None)
    yy, xx = np.mgrid[0:_VID_H, 0:_VID_W].astype(np.float32)
    for i in range(n):
        base = ((xx / _VID_W) * 130 + (yy / _VID_H) * 80 + i * 4.0) % 255.0
        img = base.astype(np.uint8)
        frame = np.dstack([img, np.roll(img, 13, 0), np.roll(img, 7, 1)])
        writer.send(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())
    writer.close()


def fake_video_gwf(prompt, out_path, *, image=None, refs=None, aspect="9:16",
                   duration=10, resolution="720p", fast=False,
                   generate_audio=True, log=print, **kw):
    _write_video(out_path, duration)
    return {"provider": "seedance", "model": "bytedance/seedance-2.0/text-to-video",
            "path": str(out_path), "cost_usd": 0.0, "audio": False}


def fake_voiceover(text, out_path, *, voice=None, log=print, **kw):
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    words = max(1, len(str(text).split()))
    dur = min(14.0, max(2.0, words * 0.4))
    subprocess.run([FFMPEG, "-y", "-f", "lavfi", "-i",
                    f"sine=frequency=320:duration={dur:g}",
                    "-ac", "1", "-ar", "44100", str(out)],
                   capture_output=True, check=False)
    # Sidecar: our mocked ASR reads this so caption text matches the script (drift ~0),
    # which lets the REAL caption planner/burn-in run instead of the drift gate refusing.
    Path(str(out) + ".txt").write_text(str(text), encoding="utf-8")
    return {"provider": "minimax-tts", "model": ccfg.VIDEO_TTS_MODEL,
            "path": str(out), "cost_usd": 0.0}


def fake_transcribe(audio_path, *, log=print, **kw):
    sidecar = Path(str(audio_path) + ".txt")
    text = sidecar.read_text(encoding="utf-8") if sidecar.exists() else "shop the new collection"
    words, t = [], 0.1
    for tok in text.split():
        words.append({"text": tok, "start": round(t, 3), "end": round(t + 0.28, 3)})
        t += 0.34
    return words, 0.0


def fake_merge(video_path, audio_path, out_path, *, seconds=0, log=print, **kw):
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([FFMPEG, "-y", "-i", str(video_path), "-i", str(audio_path),
                    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
                    "-shortest", str(out)], capture_output=True, check=False)
    return {"provider": "fal-ffmpeg", "model": ccfg.AUDIO_MERGE_MODEL,
            "path": str(out), "cost_usd": 0.0}


def fake_affordable(n, **kw):
    return {"enabled": True, "ok": True, "balance": 999.0,
            "needed": round(n * fal_billing.SEEDANCE_CLIP_USD + 0.30, 4), "shortfall": 0.0}


def fake_static_verify(ad, spec, copy, *, client=None, run_vlm=False,
                       vision_model=None, expect_logo=True):
    return QAReport(checks=[QACheck(name="ok", passed=True)], verdict="pass")


def fake_video_verify(clip, board, script=None, **kw):
    return QAReport(checks=[QACheck(name="ok", passed=True)], verdict="pass")


def fake_verify_shot(clip, shot, index, **kw):
    return [QACheck(name="ok", passed=True)]


def fake_logo(kit, out_path, **kw):
    _draw_png(out_path, (400, 400))
    try:
        kit.logo.asset_path = str(out_path)
    except Exception:
        pass
    return {"provider": "flux", "model": "m", "path": str(out_path), "cost_usd": 0.0}


# ---------------------------------------------------------------------------
# 5. Install the patches (module attributes; picked up at call time everywhere,
#    including sequencer's `providers.*` / `verifier_video.*` references).
# ---------------------------------------------------------------------------
pipeline._client = lambda: FakeClient(_router)
image_providers.generate_with_fallback = fake_image_gwf
image_providers.cutout = fake_cutout
# image_providers.outpaint LEFT REAL: blur-reframe is pure Pillow, offline, $0.
video_providers.generate_with_fallback = fake_video_gwf
video_providers.generate_voiceover = fake_voiceover
video_providers.transcribe_words = fake_transcribe
video_providers.merge_audio_onto_video = fake_merge
fal_billing.affordable = fake_affordable
verifier.verify = fake_static_verify
verifier_video.verify = fake_video_verify
verifier_video.verify_shot = fake_verify_shot
logo_mod.generate_logo = fake_logo

# ---------------------------------------------------------------------------
# 6. Drive the API.
# ---------------------------------------------------------------------------
client = TestClient(app)
DUMMY_PRODUCT = OUTPUT_DIR / "_dummy_product.png"
_draw_png(DUMMY_PRODUCT, (512, 512))

RESULTS = {"errors": []}


def _poll(job_id, timeout=180.0):
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        last = client.get(f"/creative/jobs/{job_id}", timeout=300).json()
        if last.get("status") in ("complete", "failed"):
            return last
        time.sleep(0.2)
    return last


def run_scenario():
    started = time.time()

    # (a) health -> confirms auth is OPEN (no key set)
    h = client.get("/health").json()
    RESULTS["health"] = h

    # (b) STATIC ADS ---------------------------------------------------------
    brief = {
        "brand_name": "Lumen",
        "product_name": "Lumen Twist Lamp",
        "product_description": "A warm, dimmable smart lamp you twist to set the mood.",
        "target_audience": "design-minded renters in small apartments",
        "key_features": ["twist to dim", "warm 2700K glow", "no app required"],
        "price": "$79",
    }
    body = {"brief": brief, "images": 3, "formats": ["1:1", "4:5", "9:16"],
            "with_video": False, "product_image": str(DUMMY_PRODUCT)}
    r = client.post("/creative/generate", json=body, timeout=300)
    r.raise_for_status()
    job_id = r.json()["job_id"]
    RESULTS["job_id"] = job_id
    static = _poll(job_id)
    RESULTS["static_status"] = static
    if static.get("status") != "complete":
        RESULTS["errors"].append(f"static job status={static.get('status')} "
                                 f"error={static.get('error')}")

    # (c) VIDEO PLAN ($0, LLM only) -----------------------------------------
    r = client.post("/creative/video/plan",
                    json={"job_id": job_id, "seconds": 12, "n_shots": 3,
                          "direction": "cozy handheld, warm morning light, slow"},
                    timeout=300)
    r.raise_for_status()
    plan = r.json()
    RESULTS["plan"] = plan
    q = plan.get("quote", {})
    if q.get("clips") != 3:
        RESULTS["errors"].append(f"plan quote clips={q.get('clips')} (expected 3)")
    exp_usd = round(3 * fal_billing.SEEDANCE_CLIP_USD, 4)
    if abs(float(q.get("estimated_usd", 0)) - exp_usd) > 1e-6:
        RESULTS["errors"].append(f"plan estimated_usd={q.get('estimated_usd')} "
                                 f"(expected ~{exp_usd})")

    # (d) VIDEO RENDER (paid path, but all seams $0) ------------------------
    r = client.post("/creative/video/generate",
                    json={"job_id": job_id, "voiceover": True, "captions": True,
                          "sfx": True, "aspect": "9:16", "resolution": "720p"},
                    timeout=300)
    r.raise_for_status()
    RESULTS["video_generate_ack"] = r.json()
    video = _poll(job_id)
    RESULTS["video_status"] = video
    if video.get("status") != "complete":
        RESULTS["errors"].append(f"video job status={video.get('status')} "
                                 f"error={video.get('error')}")

    RESULTS["wall_clock_s"] = round(time.time() - started, 2)


# ---------------------------------------------------------------------------
# 7. Verification helpers + report.
# ---------------------------------------------------------------------------
def read_ledger(run_dir: Path):
    led = run_dir / "ledger.jsonl"
    rows, total_nontotal = [], 0.0
    nonzero = []
    if led.exists():
        for line in led.read_text("utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            rows.append(row)
            c = float(row.get("cost_usd", 0.0) or 0.0)
            if c != 0.0:
                nonzero.append(row)
            if row.get("op") != "TOTAL":
                total_nontotal += c
    return rows, round(total_nontotal, 6), nonzero


def categorize(ext: str) -> str:
    ext = ext.lower()
    if ext in (".png", ".jpg", ".jpeg", ".webp"):
        return "images"
    if ext in (".mp4", ".mov", ".webm"):
        return "video"
    if ext in (".mp3", ".wav", ".m4a", ".aac", ".ogg"):
        return "audio"
    if ext in (".json", ".jsonl", ".txt"):
        return "json/text"
    return "other"


def file_tree(run_dir: Path):
    groups: dict[str, list[tuple[str, int]]] = {
        "images": [], "video": [], "audio": [], "json/text": [], "other": []}
    for p in sorted(run_dir.rglob("*")):
        if p.is_file():
            rel = p.relative_to(run_dir).as_posix()
            groups[categorize(p.suffix)].append((rel, p.stat().st_size))
    return groups


def probe_media(path: Path):
    """(duration, has_audio, wxh) via the bundled ffmpeg banner. Best-effort."""
    proc = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True)
    err = (proc.stderr or b"").decode("utf-8", "replace")
    dur = None
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", err)
    if m:
        hh, mm, ss = m.groups()
        dur = int(hh) * 3600 + int(mm) * 60 + float(ss)
    has_audio = bool(re.search(r"Stream #\d+:\d+.*Audio:", err))
    dims = None
    md = re.search(r"Video:.*?(\d{2,5})x(\d{2,5})", err)
    if md:
        dims = f"{md.group(1)}x{md.group(2)}"
    return dur, has_audio, dims


def write_report(run_dir: Path):
    rows, total, nonzero = read_ledger(run_dir)
    groups = file_tree(run_dir)
    env_leaks = [k for k in SECRET_KEYS if os.environ.get(k)]
    cfg_leaks = [n for n, v in [
        ("ai_config.AI_LAYER_API_KEY", ai_config.AI_LAYER_API_KEY),
        ("ai_config.OPENROUTER_API_KEY", ai_config.OPENROUTER_API_KEY),
        ("ccfg.OPENROUTER_API_KEY", ccfg.OPENROUTER_API_KEY),
        ("ccfg.FAL_KEY", ccfg.FAL_KEY),
        ("ccfg.META_ACCESS_TOKEN", ccfg.META_ACCESS_TOKEN),
        ("ccfg.SHOPIFY_TOKEN", ccfg.SHOPIFY_TOKEN),
    ] if v]

    static = RESULTS.get("static_status", {}) or {}
    plan = RESULTS.get("plan", {}) or {}
    video = RESULTS.get("video_status", {}) or {}

    # media probes for a few headline artifacts
    probes = {}
    for name in ("video_captioned.mp4", "timeline.mp4", "voiceover.mp3"):
        fp = run_dir / name
        if fp.exists():
            probes[name] = probe_media(fp)

    L = []
    ok = (not RESULTS["errors"] and static.get("status") == "complete"
          and video.get("status") == "complete" and total == 0.0
          and not nonzero and not env_leaks and not cfg_leaks)
    L.append(f"# Creative Studio API — hermetic $0 dry-run {'PASSED' if ok else 'ISSUES'}")
    L.append("")
    L.append(f"- Generated: {datetime.now().isoformat(timespec='seconds')}")
    L.append(f"- Harness: `{Path(__file__).resolve()}`")
    L.append(f"- Run output dir: `{run_dir}`")
    L.append(f"- Job id (shared by static + video): `{RESULTS.get('job_id')}`")
    L.append(f"- Wall clock: {RESULTS.get('wall_clock_s')} s")
    L.append(f"- `/health`: {json.dumps(RESULTS.get('health'))}")
    if RESULTS["errors"]:
        L.append("")
        L.append("## Assertion errors")
        for e in RESULTS["errors"]:
            L.append(f"- {e}")
    L.append("")

    L.append("## Command")
    L.append("```")
    L.append('cd apps/ai-layer && "…/cos/Scripts/python.exe" '
             f'"{Path(__file__).resolve()}"')
    L.append("```")
    L.append("")

    # static job
    L.append("## Static job (POST /creative/generate) — abridged")
    L.append("```json")
    L.append(json.dumps({
        "status": static.get("status"),
        "stage": static.get("stage"),
        "progress": static.get("progress"),
        "brand_kit": (static.get("brand_kit") or {}).get("brand_name"),
        "n_assets": len(static.get("assets") or []),
        "assets": static.get("assets"),
        "rejected": static.get("rejected"),
        "cost_usd": static.get("cost_usd"),
        "video": static.get("video"),
    }, indent=2))
    L.append("```")
    L.append("")

    # plan
    L.append("## Video plan (POST /creative/video/plan) — abridged")
    L.append("```json")
    L.append(json.dumps({
        "shots": plan.get("shots"),
        "duration_s": plan.get("duration_s"),
        "grounded": plan.get("grounded"),
        "quote": plan.get("quote"),
        "script_beats": [b.get("purpose") for b in (plan.get("script") or {}).get("beats", [])],
        "storyboard_shots": [
            {"purpose": s.get("purpose"), "duration_s": s.get("duration_s"),
             "camera": s.get("camera"), "product_visible": s.get("product_visible")}
            for s in (plan.get("storyboard") or {}).get("shots", [])],
    }, indent=2))
    L.append("```")
    L.append("")

    # video job
    L.append("## Video job (POST /creative/video/generate) — abridged")
    L.append("```json")
    L.append(json.dumps({
        "status": video.get("status"),
        "stage": video.get("stage"),
        "progress": video.get("progress"),
        "video": video.get("video"),
        "qa": video.get("qa"),
        "repair": video.get("repair"),
        "cost_usd": video.get("cost_usd"),
        "actuals": video.get("actuals"),
    }, indent=2))
    L.append("```")
    if probes:
        L.append("")
        L.append("Media probes (bundled ffmpeg banner): ")
        for n, (dur, aud, dims) in probes.items():
            L.append(f"- `{n}`: duration={dur}s, has_audio={aud}, dims={dims}")
    L.append("")

    # file tree
    L.append("## Produced files (grouped by asset type)")
    for cat in ("images", "video", "audio", "json/text", "other"):
        items = groups.get(cat) or []
        if not items:
            continue
        tot = sum(s for _, s in items)
        L.append("")
        L.append(f"### {cat} — {len(items)} file(s), {tot:,} bytes")
        L.append("```")
        for rel, size in items:
            L.append(f"{size:>10,}  {rel}")
        L.append("```")
    L.append("")

    # ledger
    L.append("## ledger.jsonl (proves $0)")
    L.append(f"- rows: {len(rows)}  |  sum of non-TOTAL cost_usd: {total}  |  "
             f"nonzero rows: {len(nonzero)}")
    L.append("```")
    for row in rows:
        L.append(json.dumps(row))
    L.append("```")
    L.append("")

    # money/network attestation
    L.append("## $0 / no-network attestation")
    L.append(f"- Secret keys present in os.environ after run: "
             f"{env_leaks if env_leaks else 'NONE'}")
    L.append(f"- Non-null credential attrs on config modules: "
             f"{cfg_leaks if cfg_leaks else 'NONE'}")
    L.append(f"- Every ledger row cost_usd == 0.0: {not nonzero}")
    L.append(f"- Ledger non-TOTAL total == $0.0000: {total == 0.0}")
    L.append("- fal_client / requests / OpenRouter are only reachable through the mocked "
             "seams below; none were invoked (all image/video/audio/LLM/billing calls "
             "were intercepted).")
    L.append("")

    # seam table
    L.append("## Seams patched (and why)")
    L.append("")
    L.append("| Seam | Patched to | Why |")
    L.append("|---|---|---|")
    L.append("| `pipeline._client` | `FakeClient(_router)` | route on system-prompt text; "
             "returns valid kit/concepts/script/storyboard/vo JSON; no OpenRouter call |")
    L.append("| `image_providers.generate_with_fallback` | writes a real PNG (PIL) | "
             "backgrounds/product-seeds are genuine images; no fal call |")
    L.append("| `image_providers.cutout` | writes a real RGBA PNG | product_cutout.png "
             "without fal BiRefNet |")
    L.append("| `image_providers.outpaint` | **left REAL** | blur-reframe is pure Pillow, "
             "offline, $0 — genuinely runs |")
    L.append("| `video_providers.generate_with_fallback` | writes a real playable MP4 | "
             "the editor runs real ffmpeg trim/concat/caption/sfx on it; no Seedance call |")
    L.append("| `video_providers.generate_voiceover` | ffmpeg `sine` MP3 + `.txt` sidecar | "
             "real audio track; sidecar lets the mocked ASR reproduce script-matching words |")
    L.append("| `video_providers.transcribe_words` | reads the sidecar → word timings | "
             "caption drift ~0 so the REAL caption planner + burn-in run; no fal Whisper |")
    L.append("| `video_providers.merge_audio_onto_video` | local ffmpeg mux | real muxed "
             "MP4 with an audio track; no fal ffmpeg endpoint |")
    L.append("| `fal_billing.affordable` | `{enabled,ok,balance:999,…}` | quote/guard pass "
             "without the FAL_ADMIN_KEY billing API |")
    L.append("| `verifier.verify` | passing `QAReport` | avoids the static VLM (OpenRouter "
             "vision) call |")
    L.append("| `verifier_video.verify` | passing `QAReport` | avoids the temporal VLM call |")
    L.append("| `verifier_video.verify_shot` | passing `[QACheck]` | per-shot gate passes so "
             "the recovery ladder does not fire on mocked frames; no VLM |")
    L.append("| `logo.generate_logo` | tiny PNG no-op | logo skipped anyway (no_logo=True) |")
    L.append("")

    # fidelity
    L.append("## Fidelity notes — where the $0 run differs from a true live run")
    L.append("")
    L.append("- **REAL and identical to prod:** the sequencer render loop + recovery ladder "
             "control flow, `snap_duration`/billed-vs-used accounting, `editor.trim`, "
             "`editor.apply_plan` (punch/micro-shake/grain/exposure/recompress ffmpeg chain), "
             "`editor.concat`, SFX synthesis+mix (`sfx.py` lavfi), the caption planner "
             "(`captions.py` align/cue-grouping/drift gate) and Pillow caption burn-in, the "
             "voiceover fit (`editor.fit_audio` atempo/apad), the ledger, the storyboard "
             "duration-fit/coverage validator, the brief→brand-kit→concepts→layout→compositor "
             "static path, real blur-outpaint reframing, and the whole FastAPI async job "
             "lifecycle (queue → background worker → poll).")
    L.append("- **MOCKED (fidelity caveats):**")
    L.append("  - *Generative pixels/frames*: image + video content is synthetic (PIL/ffmpeg "
             "gradients), not FLUX/Seedance output. Shapes/durations/geometry are real; the "
             "imagery is not.")
    L.append("  - *ASR*: word timings are synthesized from the script sidecar, not fal "
             "Whisper. Caption **placement/rendering/burn-in is real**; the timestamps are "
             "idealized (drift forced to ~0).")
    L.append("  - *VLM critics*: both the static (`verifier.verify`) and temporal "
             "(`verifier_video.verify`) vision critics, and the per-shot gate "
             "(`verify_shot`), are stubbed to pass. The **real QA math** (WCAG contrast, "
             "safe-zone, cut-alignment, continuity correlation, product-presence NCC, "
             "caption/audio drift, A/V-sync) therefore did NOT execute — the harness asserts "
             "pass so no vision/LLM call fires. A live run would actually score these.")
    L.append("  - *Billing*: `fal_billing.affordable` returns a synthetic affordable balance; "
             "the real balance-guard / per-run reconciliation against fal's invoice did not "
             "run (no FAL_ADMIN_KEY).")
    L.append("  - *LLM copy*: brand kit / concepts / script / storyboard are canned JSON, not "
             "model output. Structure/validation is real; wording is fixed.")
    L.append("")
    L.append(f"**Overall: {'PASS — both jobs complete, $0, no network.' if ok else 'SEE ISSUES ABOVE.'}**")

    REPORT_PATH.write_text("\n".join(L), encoding="utf-8")
    return ok, rows, total, nonzero, env_leaks, cfg_leaks, groups


def main():
    run_dir = OUTPUT_DIR / RESULTS.get("job_id", "")
    try:
        run_scenario()
    except Exception as e:  # noqa: BLE001
        RESULTS["errors"].append(f"scenario crashed: {e}")
        traceback.print_exc()
    run_dir = OUTPUT_DIR / (RESULTS.get("job_id") or "_none")
    ok, rows, total, nonzero, env_leaks, cfg_leaks, groups = write_report(run_dir)

    print("=" * 72)
    print(f"static: {(RESULTS.get('static_status') or {}).get('status')}  "
          f"video: {(RESULTS.get('video_status') or {}).get('status')}")
    print(f"plan quote clips: {(RESULTS.get('plan') or {}).get('quote', {}).get('clips')}  "
          f"estimated_usd: {(RESULTS.get('plan') or {}).get('quote', {}).get('estimated_usd')}")
    print(f"ledger rows: {len(rows)}  non-TOTAL total: ${total}  nonzero rows: {len(nonzero)}")
    print(f"env key leaks: {env_leaks or 'NONE'}   config cred leaks: {cfg_leaks or 'NONE'}")
    for cat in ("images", "video", "audio", "json/text"):
        print(f"  {cat:10}: {len(groups.get(cat) or [])} file(s)")
    print(f"errors: {RESULTS['errors'] or 'NONE'}")
    print(f"report: {REPORT_PATH}")
    print(f"run dir: {run_dir}")
    print("RESULT:", "PASS" if ok else "ISSUES")
    print("=" * 72)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
