"""The Editor: deterministic post-processing on the time axis (T7.5).

    compositor.py : static ad  ::  editor.py : video ad
         (space)                        (time)

The compositor renders meaning into space. The editor renders meaning into time. Both
are ffmpeg/PIL, both are exact, and neither asks a generative model to do something it
cannot be held accountable for. Every operation here costs $0 in model spend and is
assertable to the frame.

This matters more than it sounds. Competitors ship the caption/cut/pacing layer as the
thing that makes a clip feel native, and it is entirely ffmpeg. It is also what makes
the temporal QA gate tractable later: we do not have to DETECT where the cuts and
captions are, because we placed them.

v1 ships caption burn-in. Speed ramps, punch-ins, freeze frames, whip transitions and
SFX are the same shape and land here too.

The ffmpeg binary is the one imageio-ffmpeg bundles as a pip wheel: no system install,
works in a bare venv and in Docker. Imports are lazy so the module loads without it.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import captions as captions_mod  # noqa: E402
import config  # noqa: E402
from schemas import CaptionCue, CaptionStyle  # noqa: E402


class EditError(RuntimeError):
    """ffmpeg refused. Carries the tail of its stderr, which is where the reason is."""


def _ffmpeg() -> str:
    import imageio_ffmpeg               # lazy
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path) -> dict:
    """(width, height, fps, duration) of a clip, from the bundled ffmpeg's own metadata.

    imageio_ffmpeg's first yield is the metadata dict; we close the generator rather
    than decoding a single frame we do not need.
    """
    import imageio_ffmpeg               # lazy
    gen = imageio_ffmpeg.read_frames(str(path))
    meta = next(gen)
    gen.close()
    w, h = meta["size"]
    return {"width": int(w), "height": int(h),
            "fps": float(meta.get("fps") or 24.0),
            "duration": float(meta.get("duration") or 0.0)}


def _run(cmd: list[str]) -> None:
    import subprocess                   # lazy
    proc = subprocess.run(cmd, capture_output=True)
    if proc.returncode != 0:
        tail = (proc.stderr or b"").decode("utf-8", "replace")[-600:]
        raise EditError(f"ffmpeg exited {proc.returncode}:\n{tail}")


def burn_captions(video_in, video_out, cues: list[CaptionCue], *,
                  style: CaptionStyle | None = None, fps: int | None = None,
                  keep_frames: bool = False, log=print) -> str:
    """Burn a per-word caption track onto a clip. Returns the output path.

    The captions are drawn by Pillow into a transparent PNG sequence and composited by
    ffmpeg in one `overlay` pass. Audio is stream-copied, never re-encoded, so the
    voiceover we paid for is bit-identical on the way out.

    `eof_action=repeat` matters: the caption sequence is shorter than the clip whenever
    speech ends before the video does, and the default would truncate the video to the
    length of the overlay.
    """
    if not cues:
        raise ValueError("burn_captions called with no cues")

    video_in, video_out = Path(video_in), Path(video_out)
    meta = probe(video_in)
    fps = config.CAPTION_FPS if fps is None else fps
    frames_dir = video_out.with_name(video_out.stem + "_capframes")

    n, fps = captions_mod.render_frames(
        cues, (meta["width"], meta["height"]), frames_dir,
        duration=meta["duration"] or cues[-1].end, fps=fps, style=style)

    video_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [_ffmpeg(), "-y",
           "-i", str(video_in),
           "-framerate", str(fps), "-i", str(frames_dir / "cap_%05d.png"),
           "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto:eof_action=repeat[v]",
           "-map", "[v]", "-map", "0:a?",          # keep audio if the clip has any
           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy",
           str(video_out)]
    _run(cmd)

    if not keep_frames:
        for f in frames_dir.glob("cap_*.png"):
            f.unlink()
        frames_dir.rmdir()

    log(f"[editor] burned {len(cues)} cue(s) over {n} frame(s) -> {video_out}")
    return str(video_out)


def caption_clip(video_in, video_out, script: str, audio_path, *,
                 kit=None, strict: bool = True, transcribe=None, led=None,
                 log=print) -> tuple[str, float]:
    """ASR our own voiceover, plan cues, burn them. Returns (path, drift).

    `transcribe` is injected so tests never touch the network. In production it is
    video_providers.transcribe_words, which calls fal Whisper at chunk_level="word".
    We are transcribing audio we synthesized from a script we wrote, so drift is a
    fail-closed error rather than a warning (captions.verify_agreement).
    """
    if transcribe is None:
        import video_providers           # lazy: keeps fal_client out of the import path
        transcribe = video_providers.transcribe_words

    words, cost = transcribe(audio_path)
    if led is not None:
        led.record("asr", "fal", config.ASR_MODEL, cost, chars=len(script))

    cues, d = captions_mod.plan(script, words, strict=strict)
    style = CaptionStyle.from_kit(kit)
    out = burn_captions(video_in, video_out, cues, style=style, log=log)
    log(f"[editor] caption/audio drift {d:.3f} over {len(words)} word(s)")
    return out, d
