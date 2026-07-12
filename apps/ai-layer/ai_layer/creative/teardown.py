"""Creative teardown: turn a real ad's MP4 into a typed CreativeTemplate (T4).

This is the module that makes Cosmisk different rather than cheaper. Creatify's
Ad Clone makes you UPLOAD a reference ad, because Creatify has no idea what worked
for you. We rank an account's own ads by outcome and the winner is already on disk
(meta_creatives downloads it; pipeline used to throw it away).

THE PROVENANCE RULE. Every field is exactly one of:

  1. MEASURED from frames   -- shot boundaries, cut count, shake, exposure
  2. MEASURED from ASR      -- spoken hook, WPM, CTA timing (closed lexicon)
  3. CLASSIFIED, CLOSED SET -- ad_format, hook_type, camera/lighting/framing

Nothing else. Ask a VLM "when does the product first appear" and it will say "2.1s",
confidently, forever, and no test will ever catch it lying. Precise, plausible,
unfalsifiable: strictly worse than no number. That is drift A9 in a suit.

Shot detection is mean absolute inter-frame difference on a strided-down RGB frame.
RGB, not luma: red -> green is a 130-unit colour change and a 3-unit brightness change,
so averaging the channels first makes a hard cut invisible whenever hue moves and
brightness does not. That is most colour-graded ad footage.

No cv2, no scenedetect, no moviepy. Creatify's own open-sourced teardown
(`creatify-ai/video-ad-reverse-engineer`) contains no ML either, which is the tell.

Network seams (`transcribe_words` via video_providers, `_classify`) are module-level
so the whole module runs offline at $0 in tests.
"""
from __future__ import annotations

import base64
import io
import json
import subprocess
from pathlib import Path

from ai_layer.creative import config  # noqa: E402
from ai_layer.creative import ledger  # noqa: E402
from ai_layer.creative import taxonomy  # noqa: E402
from ai_layer.creative import video_providers  # noqa: E402
from ai_layer.creative.schemas import CreativeTemplate, ShotBoundary, UGCStyle  # noqa: E402


# --- 1. MEASURED FROM FRAMES ---------------------------------------------------

def _read_small(path: Path, *, sample_fps: int, grid: int):
    """Yield (t_seconds, small_rgb_float_array) for a temporally subsampled clip.

    Reads at native size and downsamples in-process rather than passing `-vf scale`,
    because imageio_ffmpeg's reported frame size is the INPUT stream's and a mismatch
    silently corrupts the reshape.

    Downsampling is a BLOCK MEAN, not a stride. Striding samples one pixel per block,
    so it preserves grain and aliases under camera shake: a 2px handheld drift lands on
    entirely different pixels and the frame differ reads it as a cut. Measured on a clip
    with heavy grain, striding reported a cut on EVERY sampled frame; block-mean reported
    the two real ones. Downloaded ad creative is compressed, and compression is grain.
    """
    import imageio_ffmpeg
    import numpy as np

    reader = imageio_ffmpeg.read_frames(str(path), pix_fmt="rgb24")
    meta = next(reader)
    w, h = meta["size"]
    fps = float(meta.get("fps") or 24.0)
    step = max(1, int(round(fps / max(1, sample_fps))))

    gh, gw = max(1, min(grid, h)), max(1, min(grid, w))
    bh, bw = h // gh, w // gw               # block size; 1 when the frame is already small

    for i, raw in enumerate(reader):
        if i % step:
            continue
        frame = np.frombuffer(raw, dtype=np.uint8).reshape(h, w, 3).astype(np.float32)
        small = frame[:gh * bh, :gw * bw].reshape(gh, bh, gw, bw, 3).mean(axis=(1, 3))
        yield (i / fps), small


def sample_frames(path, *, sample_fps=None, grid=None):
    """Public: yield (t_seconds, small_rgb_array). Used by the temporal QA gate (T9)."""
    yield from _read_small(Path(path),
                           sample_fps=config.TEARDOWN_SAMPLE_FPS if sample_fps is None
                           else sample_fps,
                           grid=config.TEARDOWN_GRID if grid is None else grid)


def detect_shots(path, *, threshold=None, min_shot_s=None, sample_fps=None, grid=None):
    """Frame-difference shot detection. Returns (shots, duration_s, per-frame stats).

    A cut is a frame whose mean absolute difference from its predecessor exceeds
    `threshold`, provided at least `min_shot_s` has elapsed since the previous cut
    (below that, a "cut" is a flash or a flicker, not a shot).
    """
    import numpy as np

    threshold = config.TEARDOWN_CUT_THRESHOLD if threshold is None else threshold
    min_shot_s = config.TEARDOWN_MIN_SHOT_SECONDS if min_shot_s is None else min_shot_s
    sample_fps = config.TEARDOWN_SAMPLE_FPS if sample_fps is None else sample_fps
    grid = config.TEARDOWN_GRID if grid is None else grid

    prev = None
    last_cut_t = 0.0
    cuts: list[float] = []
    keyframes: list[tuple[float, "np.ndarray"]] = []
    within_shot_diffs: list[float] = []
    clip_frac: list[float] = []
    t = 0.0

    for t, small in _read_small(Path(path), sample_fps=sample_fps, grid=grid):
        clip_frac.append(float((small >= 250).mean()))
        if prev is None:
            keyframes.append((t, small))
        else:
            # Diff across all THREE channels, not a luma average. A cut from red to
            # green is a 130-unit RGB change and a 3-unit luma change: collapsing to
            # grayscale first makes a hard cut invisible whenever hue moves and
            # brightness does not, which is most colour-graded ad footage.
            diff = float(np.abs(small - prev).mean())
            if diff > threshold and (t - last_cut_t) >= min_shot_s:
                cuts.append(t)
                last_cut_t = t
                keyframes.append((t, small))
            else:
                within_shot_diffs.append(diff)
        prev = small

    duration = t
    starts = [0.0] + cuts
    shots = [ShotBoundary(index=i, start_s=round(s, 3),
                          duration_s=round((starts[i + 1] if i + 1 < len(starts) else duration) - s, 3))
             for i, s in enumerate(starts)]
    stats = {
        "keyframes": keyframes,
        # median, not mean: one cut that slipped past the threshold would drag a mean.
        "micro_shake": float(np.median(within_shot_diffs)) if within_shot_diffs else 0.0,
        "exposure_clip": float(np.mean(clip_frac)) if clip_frac else 0.0,
    }
    return shots, duration, stats


def measure_style(stats) -> UGCStyle:
    """The POST half of UGCStyle, measured off real frames. Prompt-half stays None
    until `_classify` fills it from a closed set. Grain and recompress are left at 0:
    we have no honest estimator for them yet, and a fabricated 0.04 is still fabricated."""
    return UGCStyle(
        micro_shake=round(stats["micro_shake"], 4),
        exposure_clip=round(stats["exposure_clip"], 4),
    )


# --- 2. MEASURED FROM ASR ------------------------------------------------------

def extract_audio(video_path, out_path) -> str | None:
    """Demux to 16k mono wav with the bundled ffmpeg. None if the clip is silent."""
    import imageio_ffmpeg
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-i", str(video_path),
           "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", str(out)]
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0 or not out.exists() or out.stat().st_size == 0:
        return None                      # no audio stream, or ffmpeg refused it
    return str(out)


def derive_speech(words: list[dict], *, first_cut_s: float) -> dict:
    """Turn word-level timestamps into the three ASR-measured fields.

    `spoken_hook`   -- the words uttered before the first cut. Measured, not summarized.
    `words_per_minute` -- count over the actual span of speech, not clip duration.
    `cta_start_s`   -- timestamp of the FIRST phrase matching the closed CTA lexicon.
                       No match means None. We do not guess when the CTA "probably" was.
    """
    if not words:
        return {"spoken_hook": None, "words_per_minute": None, "cta_start_s": None}

    hook = [w["text"] for w in words if float(w.get("start", 0.0)) < first_cut_s]
    span = float(words[-1].get("end", 0.0)) - float(words[0].get("start", 0.0))
    wpm = (len(words) / span * 60.0) if span > 0 else None

    joined = " ".join(str(w["text"]).lower().strip(".,!?") for w in words)
    cta_start = None
    for phrase in taxonomy.CTA_PHRASES:
        idx = joined.find(phrase)
        if idx == -1:
            continue
        # map char offset back to a word index, then to that word's timestamp
        n_words_before = len(joined[:idx].split())
        if n_words_before < len(words):
            t = float(words[n_words_before].get("start", 0.0))
            cta_start = t if cta_start is None else min(cta_start, t)

    return {
        "spoken_hook": " ".join(hook).strip() or None,
        "words_per_minute": round(wpm, 1) if wpm else None,
        "cta_start_s": round(cta_start, 2) if cta_start is not None else None,
    }


# --- 3. CLASSIFIED, CLOSED SET -------------------------------------------------

_CLASSIFY_SYSTEM = (
    "You are a performance-creative analyst. You are shown a CONTACT SHEET: keyframes "
    "of one video ad, tiled left-to-right, top-to-bottom, in chronological order. "
    "Classify it. Return STRICT JSON only, with EXACTLY these keys:\n"
    '{"ad_format": str, "hook_type": str, "camera": str, "lighting": str, "framing": str}\n'
    "Each value MUST be chosen verbatim from its list. If you are unsure, choose the "
    "closest member of the list. Do NOT invent a label, do NOT return prose, do NOT add "
    "keys. In particular do NOT estimate any timing, duration, or ratio: those are "
    "measured elsewhere and your guess would silently overwrite a real measurement.\n"
    "ad_format: {formats}\n"
    "hook_type: {hooks}\n"
    "camera: {cameras}\n"
    "lighting: {lightings}\n"
    "framing: {framings}"
)


def _contact_sheet(keyframes, *, max_tiles=None) -> bytes:
    """Tile up to N keyframes into ONE png. One image, one VLM call, one price.

    Sending the whole video would cost more and buy nothing: the classification
    questions are all answerable from the shot openings.
    """
    from PIL import Image
    max_tiles = config.TEARDOWN_MAX_KEYFRAMES if max_tiles is None else max_tiles
    frames = [f for _, f in keyframes][:max_tiles]
    if not frames:
        raise ValueError("no keyframes to classify")

    tiles = [Image.fromarray(f.astype("uint8")).resize((256, 256)) for f in frames]
    cols = min(3, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * 256, rows * 256), "black")
    for i, tile in enumerate(tiles):
        sheet.paste(tile, ((i % cols) * 256, (i // cols) * 256))
    buf = io.BytesIO()
    sheet.save(buf, format="PNG")
    return buf.getvalue()


def _classify(client, sheet_png: bytes) -> tuple[dict, float]:
    """One vision call against the closed taxonomy. Raises TaxonomyError off-set."""
    system = (_CLASSIFY_SYSTEM
              .replace("{formats}", ", ".join(taxonomy.values(taxonomy.AdFormat)))
              .replace("{hooks}", ", ".join(taxonomy.values(taxonomy.HookType)))
              .replace("{cameras}", ", ".join(taxonomy.values(taxonomy.CameraStyle)))
              .replace("{lightings}", ", ".join(taxonomy.values(taxonomy.LightingStyle)))
              .replace("{framings}", ", ".join(taxonomy.values(taxonomy.FramingStyle))))
    b64 = base64.b64encode(sheet_png).decode()
    resp = client.chat.completions.create(
        model=config.VISION_MODEL,
        temperature=config.CLASSIFY_TEMPERATURE,
        response_format={"type": "json_object"},
        extra_body={"usage": {"include": True}},
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": [
                {"type": "text", "text": "Classify this ad."},
                {"type": "image_url",
                 "image_url": {"url": f"data:image/png;base64,{b64}"}},
            ]},
        ],
    )
    text = (resp.choices[0].message.content or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):text.rfind("}") + 1]
    raw = json.loads(text)

    # coerce() raises on an off-set label. A failed classification is a failure, not
    # a new category, and it must not be silently coerced into the nearest neighbour.
    return {
        "ad_format": taxonomy.coerce(taxonomy.AdFormat, raw.get("ad_format"), field="ad_format"),
        "hook_type": taxonomy.coerce(taxonomy.HookType, raw.get("hook_type"), field="hook_type"),
        "camera": taxonomy.coerce(taxonomy.CameraStyle, raw.get("camera"), field="camera"),
        "lighting": taxonomy.coerce(taxonomy.LightingStyle, raw.get("lighting"), field="lighting"),
        "framing": taxonomy.coerce(taxonomy.FramingStyle, raw.get("framing"), field="framing"),
    }, ledger.response_cost(resp)


# --- orchestration -------------------------------------------------------------

def analyze(video_path, *, ad_id: str, cohort: str, client=None, ad_name: str = "",
            metrics: dict | None = None, led=None, work_dir=None,
            log=print) -> CreativeTemplate:
    """Tear one ad's MP4 down into a CreativeTemplate.

    Degrades honestly. A silent clip yields `spoken_hook=None`; no client (or a failed
    classification) yields `ad_format=None`. A missing field is a missing field. We
    never backfill one with a plausible guess.
    """
    video_path = Path(video_path)
    work_dir = Path(work_dir) if work_dir else video_path.parent

    shots, duration, stats = detect_shots(video_path)
    first_cut = shots[1].start_s if len(shots) > 1 else duration
    avg_shot = (sum(s.duration_s for s in shots) / len(shots)) if shots else 0.0
    style = measure_style(stats)

    speech = {"spoken_hook": None, "words_per_minute": None, "cta_start_s": None}
    wav = extract_audio(video_path, work_dir / f"{video_path.stem}.wav")
    if wav:
        try:
            words, asr_cost = video_providers.transcribe_words(wav)
            if led:
                led.record("asr", "fal", config.ASR_MODEL, asr_cost, ad_id=ad_id)
            speech = derive_speech(words, first_cut_s=first_cut)
        except Exception as e:  # noqa: BLE001 -- a teardown must never break a run
            log(f"[teardown] asr failed for {ad_id} ({e!s:.90}); speech fields left empty")
    else:
        log(f"[teardown] {ad_id}: no audio track; speech fields left empty")

    fmt = hook = None
    if client:
        try:
            labels, cost = _classify(client, _contact_sheet(stats["keyframes"]))
            if led:
                led.record("teardown_classify", "openrouter", config.VISION_MODEL, cost,
                           ad_id=ad_id)
            fmt, hook = labels["ad_format"], labels["hook_type"]
            style = style.model_copy(update={"camera": labels["camera"],
                                             "lighting": labels["lighting"],
                                             "framing": labels["framing"]})
        except Exception as e:  # noqa: BLE001
            log(f"[teardown] classification failed for {ad_id} ({e!s:.90}); labels left empty")

    m = metrics or {}
    tpl = CreativeTemplate(
        ad_id=ad_id, ad_name=ad_name, cohort=cohort,
        thumb_stop_rate=m.get("thumb_stop_rate"), thruplay_rate=m.get("thruplay_rate"),
        avg_watch_time_s=m.get("avg_watch_time_s"), roas=m.get("roas"),
        spend=float(m.get("spend") or 0.0), impressions=int(m.get("impressions") or 0),
        shot_count=len(shots), shots=shots, duration_s=round(duration, 3),
        avg_shot_length_s=round(avg_shot, 3), time_to_first_cut_s=round(first_cut, 3),
        style=style, ad_format=fmt, hook_type=hook, **speech,
    )
    log(f"[teardown] {ad_id} ({cohort}): {len(shots)} shots, {duration:.1f}s, "
        f"hook={hook or '?'}, format={fmt or '?'}")
    return tpl
