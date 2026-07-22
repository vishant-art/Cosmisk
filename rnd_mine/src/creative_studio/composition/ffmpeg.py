# src/creative_studio/composition/ffmpeg.py
"""Local ffmpeg/ffprobe composition: trim every generated clip down to its
planned shot duration, concat the trimmed clips into one normalized
timeline, mux in a separately-synthesized voice track, and burn
planning-window subtitles. Every function here is synchronous -- callers
that need this off the event loop wrap it in `asyncio.to_thread` themselves.

Windows note: the real runtime workdir lives under a OneDrive path
containing spaces. ffmpeg's `subtitles=` filter parses its argument as a
mini path/option grammar where drive colons and backslashes are already
meaningful, so an absolute Windows path there is a well-known footgun.
`burn_subtitles` sidesteps it entirely by running with `cwd` set to the
srt's own directory and referencing only the bare filename in the filter
graph -- no colons, no backslashes, no spaces ever reach that argument.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from creative_studio.config import require_ffmpeg
from creative_studio.contracts import Shot

_STDERR_TAIL_CHARS = 400


class CompositionError(Exception):
    """Raised for any failing ffmpeg/ffprobe invocation: a non-zero exit
    (message carries the failing tool name + the last 400 chars of its
    stderr) or the binary not being launchable at all (message carries
    `require_ffmpeg`'s own install hint)."""


def _run(cmd: list[str], cwd: Path | None = None) -> subprocess.CompletedProcess:
    """Single choke point for every ffmpeg/ffprobe subprocess call in this
    module -- the only place that knows how a failure becomes a
    `CompositionError`."""
    tool = cmd[0]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd=cwd)
    except FileNotFoundError as exc:
        try:
            require_ffmpeg()
        except RuntimeError as hint:
            raise CompositionError(str(hint)) from exc
        # require_ffmpeg() found both tools on PATH yet launching this one
        # still failed -- fall back to a plain message rather than silently
        # swallowing the FileNotFoundError.
        raise CompositionError(f"{tool} not found") from exc

    if result.returncode != 0:
        stderr_tail = (result.stderr or "")[-_STDERR_TAIL_CHARS:]
        raise CompositionError(f"{tool} failed (exit code {result.returncode}): {stderr_tail}")
    return result


def probe(path: Path) -> dict:
    """`ffprobe -show_streams -show_format` as parsed JSON."""
    result = _run([
        "ffprobe", "-v", "error", "-print_format", "json",
        "-show_streams", "-show_format",
        str(path),
    ])
    return json.loads(result.stdout)


def probe_duration(path: Path) -> float:
    return float(probe(path)["format"]["duration"])


def probe_dims(path: Path) -> tuple[int, int]:
    data = probe(path)
    for stream in data.get("streams", []):
        if stream.get("codec_type") == "video":
            return int(stream["width"]), int(stream["height"])
    raise CompositionError(f"no video stream found in {path}")


def trim(in_path: Path, out_path: Path, seconds: float) -> Path:
    """Re-encode (not stream-copy) so the cut lands exactly at `seconds` --
    stream-copy would snap to the nearest keyframe instead."""
    _run([
        "ffmpeg", "-y", "-nostdin",
        "-i", str(in_path),
        "-ss", "0", "-t", str(seconds),
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
        str(out_path),
    ])
    return out_path


def concat(clips: list[Path], out_path: Path, width: int, height: int, fps: int) -> Path:
    """Normalize every clip to the same `width`x`height`@`fps` (letterboxed,
    never cropped or stretched) before concatenating -- required because
    concat's filter graph refuses mismatched frame geometry/rate."""
    n = len(clips)
    scale_stages = []
    labels = []
    for i in range(n):
        label = f"v{i}"
        scale_stages.append(
            f"[{i}:v]scale={width}:{height}:force_original_aspect_ratio=decrease,"
            f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps={fps}[{label}]"
        )
        labels.append(f"[{label}]")
    filter_complex = ";".join(scale_stages) + ";" + "".join(labels) + f"concat=n={n}:v=1:a=0[outv]"

    cmd = ["ffmpeg", "-y", "-nostdin"]
    for clip in clips:
        cmd += ["-i", str(clip)]
    cmd += [
        "-filter_complex", filter_complex,
        "-map", "[outv]",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
        str(out_path),
    ]
    _run(cmd)
    return out_path


def mux_voice(video: Path, voice: Path, out_path: Path) -> Path:
    """Video stream copied as-is (no re-encode); voice track becomes the
    only audio, encoded to aac; `-shortest` caps the output to whichever of
    the two is shorter."""
    _run([
        "ffmpeg", "-y", "-nostdin",
        "-i", str(video),
        "-i", str(voice),
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy", "-c:a", "aac",
        "-shortest",
        str(out_path),
    ])
    return out_path


def _format_timestamp(seconds: float) -> str:
    millis_total = round(seconds * 1000)
    hours, remainder = divmod(millis_total, 3_600_000)
    minutes, remainder = divmod(remainder, 60_000)
    secs, millis = divmod(remainder, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def srt_for(shots: list[Shot], durations: list[float]) -> str:
    """One cue per shot spanning its cumulative window
    `[t_prev, t_prev + duration)`. Cue text is `dialogue.subtitle or
    dialogue.spokenText`; a shot with neither is skipped entirely (its time
    window still elapses, it just never gets a cue), and cue numbers count
    only the cues actually emitted, starting from 1. Pure function -- no
    ffmpeg involved, golden-tested."""
    lines: list[str] = []
    cue_number = 1
    t = 0.0
    for shot, duration in zip(shots, durations):
        text = shot.dialogue.get("subtitle") or shot.dialogue.get("spokenText") or ""
        if text:
            start = _format_timestamp(t)
            end = _format_timestamp(t + duration)
            lines.append(f"{cue_number}\n{start} --> {end}\n{text}\n\n")
            cue_number += 1
        t += duration
    return "".join(lines)


def burn_subtitles(video: Path, srt_path: Path, out_path: Path) -> Path:
    """Space-safe by construction: runs with `cwd=srt_path.parent` and puts
    only the bare srt FILENAME into the `-vf subtitles=...` filter graph --
    never an absolute path, which on Windows would need its drive colon and
    backslashes escaped inside the filter's own mini-grammar. `video`/
    `out_path` are resolved to absolute paths first since they travel as
    ordinary list args (subprocess handles their spaces natively)."""
    vf = f"subtitles={srt_path.name}:force_style='FontSize=20,Alignment=2,MarginV=40'"
    _run(
        [
            "ffmpeg", "-y", "-nostdin",
            "-i", str(video.resolve()),
            "-vf", vf,
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
            "-c:a", "copy",
            str(out_path.resolve()),
        ],
        cwd=srt_path.parent,
    )
    return out_path


def thumbnail(video: Path, out_path: Path, at_seconds: float = 1.0) -> Path:
    _run([
        "ffmpeg", "-y", "-nostdin",
        "-ss", str(at_seconds),
        "-i", str(video),
        "-frames:v", "1", "-q:v", "3",
        str(out_path),
    ])
    return out_path


def compose_ad(
    workdir: Path,
    clip_paths: list[Path],
    shot_durations: list[float],
    voice_path: Path | None,
    shots: list[Shot],
    width: int = 1080,
    height: int = 1920,
    fps: int = 30,
) -> Path:
    """trim each clip to its planned duration -> concat -> mux_voice (skipped
    when `voice_path` is None) -> burn `srt_for`'s subtitles (skipped when
    there's no cue text to burn) -> `workdir/ad_final.mp4`. Intermediate
    filenames are deterministic (`trimmed_00.mp4`, ..., `concat.mp4`,
    `muxed.mp4`, `subtitles.srt`)."""
    workdir.mkdir(parents=True, exist_ok=True)

    trimmed_paths = []
    for i, (clip, duration) in enumerate(zip(clip_paths, shot_durations)):
        trimmed_path = workdir / f"trimmed_{i:02d}.mp4"
        trim(clip, trimmed_path, duration)
        trimmed_paths.append(trimmed_path)

    concat_path = workdir / "concat.mp4"
    concat(trimmed_paths, concat_path, width, height, fps)
    current = concat_path

    if voice_path is not None:
        muxed_path = workdir / "muxed.mp4"
        mux_voice(current, voice_path, muxed_path)
        current = muxed_path

    final_path = workdir / "ad_final.mp4"
    srt_text = srt_for(shots, shot_durations)
    if srt_text:
        srt_path = workdir / "subtitles.srt"
        srt_path.write_text(srt_text, encoding="utf-8")
        burn_subtitles(current, srt_path, final_path)
    else:
        current.replace(final_path)

    return final_path
