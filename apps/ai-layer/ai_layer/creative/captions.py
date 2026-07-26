"""Burned-in per-word captions: plan and render (T3).

This module plans and DRAWS. It does not touch ffmpeg; `editor.py` burns what this
produces onto a clip. Same split as layout.py (plans) and compositor.py (draws), one
axis over.

Why this is the architecture's own thesis, not a new one. The pipeline's founding rule
is that the image model never renders text: the compositor places it afterwards,
deterministically, and the QA gate verifies it. For video captions that rule stops
being a preference and becomes arithmetic. A caption has to match the audio to the
word, and no video model will ever do that. We know the script (we wrote it) but not
the timing, so we ASR our own generated voiceover and get exact word spans back for a
rounding-error cost.

Three deliberate choices:

  Text from the script, timing from ASR. Whisper knows when a word was said; it does
  not know how the brand is spelled. When the two transcripts agree we display ours.

  Drift is a fail-closed gate, not a warning. We are transcribing audio we synthesized
  from a script we wrote. Real drift means the wrong file, the wrong language, or a
  broken TTS, and a caption that says something other than the audio is worse than no
  caption at all.

  White text on a black stroke, brand colour only on the active word. Legibility over
  unknown footage is not negotiable; a brand-coloured caption body would fail contrast
  on half the frames it lands on.
"""
from __future__ import annotations

import difflib
import re
from pathlib import Path

from ai_layer.creative import compositor  # noqa: E402
from ai_layer.creative import config  # noqa: E402
from ai_layer.creative.schemas import CaptionCue, CaptionStyle, CaptionWord  # noqa: E402

_PUNCT = re.compile(r"[^\w']+")


class CaptionDriftError(RuntimeError):
    """The captions would not have matched the audio. Fail closed."""


# --- 1. alignment ---------------------------------------------------------------

def _norm(tokens) -> list[str]:
    out = []
    for t in tokens:
        cleaned = _PUNCT.sub("", str(t).lower())
        if cleaned:
            out.append(cleaned)
    return out


def drift(script: str, words: list[dict]) -> float:
    """0.0 when the ASR transcript matches the script token-for-token, 1.0 when nothing
    matches. A pure string comparison: no model is asked whether the captions are right."""
    a, b = _norm(script.split()), _norm(w["text"] for w in words)
    if not a and not b:
        return 0.0
    if not a or not b:
        return 1.0
    return 1.0 - difflib.SequenceMatcher(None, a, b).ratio()


def align(script: str, words: list[dict]) -> tuple[list[CaptionWord], float]:
    """Timing from ASR, text from the script when the two agree.

    Exact agreement means we can safely display our own tokens, which carry the right
    capitalization, punctuation and brand spelling. Any disagreement and we display
    what was actually SAID, because a caption that contradicts the audio is the one
    thing worse than an ugly caption.
    """
    d = drift(script, words)
    script_tokens = script.split()
    use_script = d == 0.0 and len(script_tokens) == len(words)

    aligned = [
        CaptionWord(text=(script_tokens[i] if use_script else str(w["text"]).strip()),
                    start=float(w["start"]), end=float(w["end"]))
        for i, w in enumerate(words)
    ]
    return aligned, d


def verify_agreement(d: float, *, strict: bool = True, max_drift: float | None = None) -> None:
    """The fail-closed gate. Everyone else ships a human here; this is arithmetic."""
    limit = config.CAPTION_MAX_DRIFT if max_drift is None else max_drift
    if strict and d > limit:
        raise CaptionDriftError(
            f"caption/audio drift {d:.2f} exceeds {limit:.2f}. The captions would not "
            f"have matched the voiceover. Refusing to burn them.")


# --- 2. cue grouping ------------------------------------------------------------

def plan_cues(words: list[CaptionWord], *, words_per_cue=None, max_gap_s=None,
              max_cue_s=None, tail_s=None) -> list[CaptionCue]:
    """Group words into 1-3 word cues, breaking on silence and on duration.

    A cue holds the screen until the NEXT cue begins, not until its own last word ends.
    Captions that blink off in the gaps between phrases read as broken.
    """
    words_per_cue = config.CAPTION_WORDS_PER_CUE if words_per_cue is None else words_per_cue
    max_gap_s = config.CAPTION_MAX_GAP_S if max_gap_s is None else max_gap_s
    max_cue_s = config.CAPTION_MAX_CUE_S if max_cue_s is None else max_cue_s
    tail_s = config.CAPTION_TAIL_S if tail_s is None else tail_s
    if not words:
        return []

    groups: list[list[CaptionWord]] = [[words[0]]]
    for prev, w in zip(words, words[1:]):
        cur = groups[-1]
        too_many = len(cur) >= words_per_cue
        too_long = (w.end - cur[0].start) > max_cue_s
        silence = (w.start - prev.end) > max_gap_s
        if too_many or too_long or silence:
            groups.append([w])
        else:
            cur.append(w)

    cues: list[CaptionCue] = []
    for i, g in enumerate(groups):
        # hold until the next cue starts; the last cue gets a short tail
        end = groups[i + 1][0].start if i + 1 < len(groups) else g[-1].end + tail_s
        cues.append(CaptionCue(words=g, start=g[0].start, end=max(end, g[-1].end)))
    return cues


def state_at(cues: list[CaptionCue], t: float) -> tuple[int, int] | None:
    """(cue_index, active_word_index) at time `t`, or None when nothing is on screen.

    Frames are cached on this key. A 15-second voiceover has ~40 distinct states and
    ~360 frames, so rendering per state rather than per frame is a 9x saving with an
    identical result.
    """
    for i, c in enumerate(cues):
        if c.start <= t < c.end:
            return i, c.active_index(t)
    return None


# --- 3. rendering ---------------------------------------------------------------

def _fit_single_line(draw, text: str, *, max_w: int, max_h: int, max_pt: int, min_pt: int = 10):
    """Largest font at which `text` fits on ONE line. Captions never wrap: a cue is at
    most three words, and a wrapped cue jumps the reader's eye."""
    pt = max_pt
    while pt > min_pt:
        font = compositor._font(pt)
        l, t, r, b = draw.textbbox((0, 0), text, font=font)
        if (r - l) <= max_w and (b - t) <= max_h:
            return font
        pt = int(pt * 0.9)
    return compositor._font(min_pt)


def render_cue_png(cue: CaptionCue, active: int, size: tuple[int, int],
                   style: CaptionStyle) -> bytes:
    """One transparent RGBA frame: the cue's words, the active one in the brand accent.

    Every word is stroked in black. That, not a scrim box, is what makes white text
    legible over arbitrary moving footage, and it is what real creator captions do.
    """
    import io
    from PIL import Image, ImageDraw       # lazy

    W, H = size
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")

    band_w = int(W * 0.88)
    band_h = max(1, int(H * style.band_h))
    font = _fit_single_line(draw, cue.text, max_w=band_w, max_h=band_h,
                            max_pt=min(style.max_font_pt, max(10, band_h)))
    stroke = max(1, int(font.size * style.stroke_frac))

    widths = [draw.textlength(w.text, font=font) for w in cue.words]
    space = draw.textlength(" ", font=font)
    total = sum(widths) + space * (len(cue.words) - 1)

    x = (W - total) / 2
    y = H * style.band_y
    for i, w in enumerate(cue.words):
        draw.text((x, y), w.text, font=font,
                  fill=(style.active_color if i == active else style.color),
                  stroke_width=stroke, stroke_fill="#000000")
        x += widths[i] + space

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def render_frames(cues: list[CaptionCue], size: tuple[int, int], out_dir, *,
                  duration: float, fps: int | None = None,
                  style: CaptionStyle | None = None) -> tuple[int, int]:
    """Write a numbered PNG sequence covering [0, duration). Returns (n_frames, fps).

    Frames with no active cue are fully transparent, so the overlay is a no-op there.
    Identical (cue, active-word) states share one encode.
    """
    fps = config.CAPTION_FPS if fps is None else fps
    style = style or CaptionStyle()
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)

    import io
    from PIL import Image                  # lazy

    blank = io.BytesIO()
    Image.new("RGBA", size, (0, 0, 0, 0)).save(blank, format="PNG")
    blank_bytes = blank.getvalue()

    cache: dict[tuple[int, int] | None, bytes] = {None: blank_bytes}
    n_frames = max(1, int(round(duration * fps)))
    for i in range(n_frames):
        key = state_at(cues, i / fps)
        if key not in cache:
            cue_i, active = key
            cache[key] = render_cue_png(cues[cue_i], active, size, style)
        (out / f"cap_{i:05d}.png").write_bytes(cache[key])
    return n_frames, fps


def plan(script: str, words: list[dict], *, strict: bool = True
         ) -> tuple[list[CaptionCue], float]:
    """align -> verify -> group. The one entry point the pipeline calls."""
    aligned, d = align(script, words)
    verify_agreement(d, strict=strict)
    return plan_cues(aligned), d
