"""CAPTION-FIX pass: re-burn large, high-contrast captions on an ALREADY-rendered run,
reusing its clips + voiceover so there is NO Seedance / FLUX / TTS re-spend.

The only paid call is ONE fal Whisper ASR (word timings for the captions); everything else
is local ffmpeg/PIL. Fixes the `vlm_critic: captions unreadable due to low resolution`
outcome by:
  1. upscaling the silent timeline to 1080x1920 (lanczos) so captions burn sharp,
  2. few words per cue -> large font,
  3. a dark rounded SCRIM panel behind the text + heavy black stroke -> high contrast,
  4. burning via the REAL captions.plan + editor.burn_captions, then muxing the EXISTING
     voiceover back on with local ffmpeg (not the fal merger).

It reuses `timeline.mp4` (the concatenated clips) + `voiceover.mp3` from the run dir, so the
expensive Seedance/FLUX/TTS work is never repeated. Output: `video_captioned_v2.mp4` +
`caption_fix_frame.png` (a full-res frame to eyeball) in the run dir.

Run (cwd = apps/ai-layer):
  ../../cos/Scripts/python.exe tools/creative_caption_fix.py live_runs/<run>/<job_id>

Note on the QA gate: the VLM caption critic scores a contact sheet of keyframes downsampled
to 48x48 px (`config.TEARDOWN_GRID`), so it structurally cannot read ANY burned caption
regardless of source resolution. Judge legibility from `caption_fix_frame.png`, not that gate.
"""
from __future__ import annotations

import io
import json
import sys
from pathlib import Path

# --- config knobs for this fix -------------------------------------------------
WORDS_PER_CUE = 2         # few words -> large font (1 or 2)
BAND_Y = 0.60             # vertical anchor of the caption (top of text), 0-1
BAND_H = 0.24             # font-fit height budget as a fraction of frame height
MAX_FONT_PT = 150         # big
STROKE_FRAC = 0.12        # heavy black outline (~18px at 150pt)
SCRIM_ALPHA = 0.60        # opacity of the black contrast panel behind the text
UP_W, UP_H = 1080, 1920   # upscale target

if len(sys.argv) < 2:
    sys.exit("usage: creative_caption_fix.py <run_dir>  "
             "(e.g. live_runs/live_<stamp>/<job_id>)")
RUN = Path(sys.argv[1])
if not (RUN / "timeline.mp4").exists() or not (RUN / "voiceover.mp3").exists():
    sys.exit(f"{RUN} is missing timeline.mp4 / voiceover.mp3 -- not a finished video run")

from ai_layer.creative import captions as captions_mod
from ai_layer.creative import editor
from ai_layer.creative import video_providers
from ai_layer.creative.schemas import BrandKit, CaptionStyle


# --- scrim-augmented cue renderer (monkeypatched over captions.render_cue_png) ---
# Reuses the real _fit_single_line + stroke logic; the ONLY addition is a dark rounded
# panel behind the text (the CaptionStyle schema has no scrim field, so we add it here
# rather than editing the repo). render_frames() calls the module-level symbol, so the
# caching / state machinery / drift gate / burn all stay the real thing.
def render_cue_png_scrim(cue, active, size, style):
    from PIL import Image, ImageDraw

    W, H = size
    canvas = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas, "RGBA")

    band_w = int(W * 0.88)
    band_h = max(1, int(H * style.band_h))
    font = captions_mod._fit_single_line(
        draw, cue.text, max_w=band_w, max_h=band_h,
        max_pt=min(style.max_font_pt, max(10, band_h)))
    stroke = max(1, int(font.size * style.stroke_frac))

    widths = [draw.textlength(w.text, font=font) for w in cue.words]
    space = draw.textlength(" ", font=font)
    total = sum(widths) + space * (len(cue.words) - 1)

    x0 = (W - total) / 2
    y = H * style.band_y
    l, t, r, b = draw.textbbox((0, 0), cue.text, font=font)
    pad_x = int(font.size * 0.45)
    pad_y = int(font.size * 0.30)
    sx0, sy0 = x0 - pad_x, y + t - pad_y - stroke
    sx1, sy1 = x0 + total + pad_x, y + b + pad_y + stroke
    radius = int(font.size * 0.28)
    draw.rounded_rectangle([sx0, sy0, sx1, sy1], radius=radius,
                           fill=(0, 0, 0, int(255 * SCRIM_ALPHA)))

    x = x0
    for i, w in enumerate(cue.words):
        draw.text((x, y), w.text, font=font,
                  fill=(style.active_color if i == active else style.color),
                  stroke_width=stroke, stroke_fill="#000000")
        x += widths[i] + space

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    return buf.getvalue()


def ff():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def run(cmd):
    import subprocess
    p = subprocess.run(cmd, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or b"").decode("utf-8", "replace")[-800:])


def main():
    timeline = RUN / "timeline.mp4"
    vo = RUN / "voiceover.mp3"
    script_json = json.loads((RUN / "script.json").read_text(encoding="utf-8"))
    kit = BrandKit.model_validate_json((RUN / "brand_kit.json").read_text(encoding="utf-8"))
    script_text = " ".join(b["text"] for b in script_json["beats"])

    print("=== INPUTS ===")
    print("timeline:", editor.probe(timeline))
    print("voiceover dur:", editor.media_duration(vo))
    print("script:", script_text)

    # 1) upscale to 1080x1920 (lanczos); silent source stays silent
    up = RUN / "timeline_1080.mp4"
    run([ff(), "-y", "-i", str(timeline),
         "-vf", f"scale={UP_W}:{UP_H}:flags=lanczos",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
         "-an", str(up)])
    print("=== UPSCALED ===", editor.probe(up))

    # 2) ASR the EXISTING voiceover (the ONE paid fal Whisper call)
    words, asr_cost = video_providers.transcribe_words(vo)
    print(f"=== ASR === {len(words)} words, cost ${asr_cost:.6f}")

    # 3) plan cues with the real machinery (align -> drift gate -> group)
    aligned, drift = captions_mod.align(script_text, words)
    captions_mod.verify_agreement(drift, strict=False)
    cues = captions_mod.plan_cues(aligned, words_per_cue=WORDS_PER_CUE)
    print(f"=== CUES === {len(cues)} cues, drift {drift:.3f}")

    # 4) beefed-up style (brand accent kept on the active word via from_kit)
    style = CaptionStyle.from_kit(kit, band_y=BAND_Y, band_h=BAND_H,
                                  max_font_pt=MAX_FONT_PT, stroke_frac=STROKE_FRAC)
    print("=== STYLE ===", style.model_dump())

    captions_mod.render_cue_png = render_cue_png_scrim      # add the scrim; rest is real

    silent_cap = RUN / "video_captioned_v2_silent.mp4"
    editor.burn_captions(up, silent_cap, cues, style=style)
    print("=== BURNED ===", editor.probe(silent_cap))

    # 5) mux the EXISTING voiceover back on (local ffmpeg, NOT the fal merger)
    out = RUN / "video_captioned_v2.mp4"
    run([ff(), "-y", "-i", str(silent_cap), "-i", str(vo),
         "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
         str(out)])
    print("=== FINAL ===", editor.probe(out), "audio_dur", editor.media_duration(out))

    # 6) representative caption frame (mid a cue in the first half)
    mid = cues[min(3, len(cues) - 1)]
    t = (mid.start + mid.end) / 2
    frame = RUN / "caption_fix_frame.png"
    run([ff(), "-y", "-i", str(out), "-ss", f"{t:g}", "-frames:v", "1", str(frame)])
    print(f"=== FRAME === at {t:.2f}s ('{mid.text}') -> {frame}")

    up.unlink(missing_ok=True)
    silent_cap.unlink(missing_ok=True)

    result = {"asr_cost_usd": round(asr_cost, 6), "drift": round(drift, 4),
              "n_cues": len(cues), "words_per_cue": WORDS_PER_CUE,
              "band_y": BAND_Y, "band_h": BAND_H, "max_font_pt": MAX_FONT_PT,
              "stroke_frac": STROKE_FRAC, "scrim_alpha": SCRIM_ALPHA,
              "upscale": f"{UP_W}x{UP_H}", "final": str(out), "frame": str(frame),
              "final_probe": editor.probe(out),
              "final_audio_dur": editor.media_duration(out),
              "sample_frame_time_s": round(t, 3), "sample_cue_text": mid.text}
    (RUN / "caption_fix_result.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print("=== RESULT ===")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
