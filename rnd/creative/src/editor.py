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

Filtergraph construction is a PURE FUNCTION of the plan and the clip's geometry
(`build_video_filters`, `build_audio_filters`, `encode_args`). Execution is one ffmpeg
pass. That split is deliberate and it mirrors layout.py/compositor.py again: the graph
can be tested exhaustively without a video, and the one integration test proves the
graph runs.

Applying a plan is a SINGLE pass. Chaining a pass per effect would re-encode the clip
four times and lose a generation of quality on each.

The ffmpeg binary is the one imageio-ffmpeg bundles as a pip wheel: no system install,
works in a bare venv and in Docker. Imports are lazy so the module loads without it.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import captions as captions_mod  # noqa: E402
import config  # noqa: E402
import sfx as sfx_mod  # noqa: E402
from schemas import (  # noqa: E402
    CaptionCue, CaptionStyle, EditPlan, SfxCue, Shot, Storyboard, UGCStyle,
)


class EditError(RuntimeError):
    """ffmpeg refused. Carries the tail of its stderr, which is where the reason is."""


def _ffmpeg() -> str:
    import imageio_ffmpeg               # lazy
    return imageio_ffmpeg.get_ffmpeg_exe()


def probe(path) -> dict:
    """(width, height, fps, duration, has_audio) of a clip, from ffmpeg's own metadata.

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
            "duration": float(meta.get("duration") or 0.0),
            "has_audio": bool(meta.get("audio_codec"))}


# --- filtergraph construction (PURE) --------------------------------------------
# No ffmpeg, no filesystem, no clip. Just strings. Tested exhaustively without a video.

def build_video_filters(plan: EditPlan, meta: dict) -> list[str]:
    """The -vf chain, in application order.

    Order matters and is not arbitrary:
      speed   first, because it rewrites the timeline every later `t` expression reads
      punch   next, on the retimed clock
      shake   after the punch, so the crop windows compose rather than fight
      grain   near the end, so it is not resampled by a scale
      curves  last, because exposure is a look, not a lens
    """
    style = plan.style
    out: list[str] = []
    W, H = meta["width"], meta["height"]
    duration = float(meta.get("duration") or 0.0)

    if plan.speed != 1.0:
        out.append(f"setpts=PTS/{plan.speed:g}")
        duration = duration / plan.speed if duration else 0.0

    if plan.punch_to > 1.0 and duration > 0:
        # Zoom from 1.0 to punch_to across the clip. A crop window that shrinks over t,
        # rescaled back up. `\,` escapes the comma inside min() so ffmpeg does not read
        # it as a filter separator. Dimensions are forced even for yuv420p.
        zf = f"(1+({plan.punch_to:g}-1)*min(t/{duration:g}\\,1))"
        out.append(f"crop=w='trunc(iw/{zf}/2)*2':h='trunc(ih/{zf}/2)*2':"
                   f"x='(iw-ow)/2':y='(ih-oh)/2'")
        out.append(f"scale={W}:{H}")

    if style and style.micro_shake > 0:
        # Deterministic handheld drift: two sines at incommensurate frequencies. Not
        # random -- a reproducible clip is a testable clip, and nobody can see the
        # difference between this and noise.
        a = max(1, int(round(style.micro_shake)))
        out.append(f"crop=w=iw-{2 * a}:h=ih-{2 * a}:"
                   f"x='{a}+{a}*sin(2*PI*t*1.7)':y='{a}+{a}*sin(2*PI*t*2.3)'")
        out.append(f"scale={W}:{H}")

    if style and style.grain > 0:
        out.append(f"noise=alls={max(1, int(round(style.grain * 40)))}:allf=t")

    if style and style.exposure_clip > 0:
        # Roll the highlights up: a phone camera clipping a bright window, not a colourist.
        knee = min(0.99, 0.7 + 0.25 * min(style.exposure_clip * 10, 1.0))
        out.append(f"curves=all='0/0 0.7/{knee:.3f} 1/1'")

    return out


def build_audio_filters(plan: EditPlan) -> list[str]:
    """The -af chain. `atempo` is clamped to [0.5, 2.0] per instance, so extreme speeds
    are chained rather than silently ignored by ffmpeg."""
    if plan.speed == 1.0:
        return []
    out, remaining = [], plan.speed
    while remaining > 2.0:
        out.append("atempo=2.0")
        remaining /= 2.0
    while remaining < 0.5:
        out.append("atempo=0.5")
        remaining /= 0.5
    out.append(f"atempo={remaining:g}")
    return out


def encode_args(plan: EditPlan) -> list[str]:
    """Encoder settings. `recompress` is not a filter: social-upload artifacting IS the
    encoder throwing bits away, so we ask it to throw more away rather than painting a
    simulation of the result."""
    recompress = bool(plan.style and plan.style.recompress)
    crf = "34" if recompress else "20"
    return ["-c:v", "libx264", "-preset", "veryfast", "-crf", crf, "-pix_fmt", "yuv420p"]


# --- storyboard -> edit plan ------------------------------------------------------
# The beats tell the editor where to punch. This is why T6 comes before T7.5.

_SHOT_PUNCH: dict[str, float] = {
    "hook": 1.12,        # push in on the face while the hook lands
    "problem": 1.0,      # let the problem sit still
    "agitate": 1.06,
    "demo": 1.08,        # slow push into the product doing its job
    "proof": 1.0,
    "objection": 1.0,
    "cta": 1.04,
}


def plan_for_shot(shot: Shot, style: UGCStyle | None = None) -> EditPlan:
    """A first-pass edit for one shot, decided by what the shot is FOR.

    Deliberately a small explicit table rather than a model call. An editor who punches
    in on the hook and holds still on the proof is following a convention, not having an
    idea, and conventions belong in code.
    """
    punch = _SHOT_PUNCH.get(shot.purpose, 1.0)
    if shot.product_visible == "hero":
        punch = min(2.0, punch + 0.04)
    return EditPlan(style=style, punch_to=punch)


def sfx_cues_for(board: Storyboard) -> list[SfxCue]:
    """A punch on the hook, a whoosh on every cut. The cut timings are exact because we
    placed them: nothing has to detect where the boundaries are (cf. T9)."""
    cues = [SfxCue(at_s=0.0, kind="punch")]
    t = 0.0
    for shot in board.shots[:-1]:
        t += shot.duration_s
        cues.append(SfxCue(at_s=round(t, 3), kind="whoosh"))
    return cues


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


def apply_plan(video_in, video_out, plan: EditPlan, *, log=print) -> str:
    """Apply an EditPlan in ONE ffmpeg pass. Returns the output path.

    A pass per effect would re-encode four times and lose a generation of quality each
    time. SFX are mixed separately afterwards because they need extra inputs, not extra
    filters, and mixing them in here would make the graph unreadable for no gain.
    """
    video_in, video_out = Path(video_in), Path(video_out)
    meta = probe(video_in)
    vf = build_video_filters(plan, meta)
    af = build_audio_filters(plan)

    video_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [_ffmpeg(), "-y", "-i", str(video_in)]
    if vf:
        cmd += ["-vf", ",".join(vf)]
    if af and meta["has_audio"]:
        cmd += ["-af", ",".join(af)]
    elif meta["has_audio"]:
        cmd += ["-c:a", "copy"]
    cmd += encode_args(plan) + [str(video_out)]
    _run(cmd)

    if plan.sfx:
        mixed = video_out.with_name(video_out.stem + "_sfx.mp4")
        add_sfx(video_out, mixed, plan.sfx, log=log)
        mixed.replace(video_out)

    log(f"[editor] {len(vf)} video filter(s), {len(plan.sfx)} sfx -> {video_out}")
    return str(video_out)


def add_sfx(video_in, video_out, cues: list[SfxCue], *, cache_dir=None, log=print) -> str:
    """Mix synthesized effects onto a clip at exact offsets.

    A clip with no audio track gets a silent bed first, otherwise `amix` has nothing to
    mix against and the effects are dropped without an error.
    """
    if not cues:
        raise ValueError("add_sfx called with no cues")
    video_in, video_out = Path(video_in), Path(video_out)
    meta = probe(video_in)
    cache = Path(cache_dir) if cache_dir else video_out.parent / "_sfx"
    paths = sfx_mod.ensure([c.kind for c in cues], cache)

    cmd = [_ffmpeg(), "-y", "-i", str(video_in)]
    base, offset = "[0:a]", 1            # input 0 is the clip
    if not meta["has_audio"]:
        cmd += ["-f", "lavfi", "-t", f"{meta['duration']:g}",
                "-i", "anullsrc=r=44100:cl=mono"]
        base, offset = "[1:a]", 2        # input 1 is the silent bed

    graph, labels = [], []
    for i, cue in enumerate(cues):
        idx = offset + i
        cmd += ["-i", paths[cue.kind]]
        ms = int(round(cue.at_s * 1000))
        graph.append(f"[{idx}:a]adelay={ms}:all=1,volume={cue.gain_db:g}dB[s{i}]")
        labels.append(f"[s{i}]")
    graph.append(f"{base}{''.join(labels)}amix=inputs={len(cues) + 1}:"
                 f"normalize=0:duration=first[a]")

    video_out.parent.mkdir(parents=True, exist_ok=True)
    cmd += ["-filter_complex", ";".join(graph),
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy", "-c:a", "aac", str(video_out)]
    _run(cmd)
    log(f"[editor] mixed {len(cues)} sfx cue(s) -> {video_out}")
    return str(video_out)


def freeze_frame(video_in, video_out, *, at_s: float, hold_s: float,
                 allow_audio_drop: bool = False, log=print) -> str:
    """Hold on the frame at `at_s` for `hold_s`, then continue.

    Trims are FRAME-INDEXED, not time-indexed. `trim=1.0:1.1` on a 10fps clip selects
    zero frames, because trim's boundaries are inclusive-exclusive over presentation
    timestamps and the frame at exactly 1.0 falls through. The result was an ffmpeg
    command that exited 0, printed nothing, and produced a clip with no freeze in it.
    Frame indices make the arithmetic exact: out_frames == in_frames + hold_frames.

    `loop=loop=N` emits N+1 frames, so a hold of H frames asks for N = H-1.

    Drops the audio track. Extending the video without also stretching the audio would
    desync everything after the freeze, and silently shipping a desynced ad is worse
    than refusing. Pass `allow_audio_drop=True` to say you meant it.
    """
    video_in, video_out = Path(video_in), Path(video_out)
    meta = probe(video_in)
    if meta["has_audio"] and not allow_audio_drop:
        raise EditError(
            "freeze_frame drops the audio track, which would desync everything after "
            "the freeze. Pass allow_audio_drop=True if that is intended.")
    if not 0 <= at_s < meta["duration"]:
        raise EditError(f"freeze at {at_s}s is outside the clip (0-{meta['duration']:.2f}s)")

    fps = meta["fps"]
    hold_frames = int(round(hold_s * fps))
    if hold_frames < 2:
        raise EditError(f"a hold of {hold_s:g}s is under two frames at {fps:g}fps. "
                        f"That is not a freeze.")
    f = int(round(at_s * fps))

    graph = (
        "[0:v]split=3[a][b][c];"
        f"[a]trim=start_frame=0:end_frame={f},setpts=PTS-STARTPTS[p1];"
        f"[b]trim=start_frame={f}:end_frame={f + 1},setpts=PTS-STARTPTS,"
        f"loop=loop={hold_frames - 1}:size=1:start=0,setpts=N/{fps:g}/TB[p2];"
        f"[c]trim=start_frame={f},setpts=PTS-STARTPTS[p3];"
        f"[p1][p2][p3]concat=n=3:v=1:a=0,fps={fps:g}[v]"
    )
    video_out.parent.mkdir(parents=True, exist_ok=True)
    _run([_ffmpeg(), "-y", "-i", str(video_in), "-filter_complex", graph,
          "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video_out)])
    log(f"[editor] froze {hold_s:g}s ({hold_frames}f) at {at_s:g}s -> {video_out}")
    return str(video_out)


# xfade transition names we allow. A closed set, so a typo is an error rather than a
# silent fallback to a cut.
TRANSITIONS: tuple[str, ...] = ("fade", "smoothleft", "smoothright", "wipeleft",
                                "circleopen", "dissolve", "pixelize")


def crossfade(video_a, video_b, video_out, *, duration: float = 0.35,
              transition: str = "smoothleft", log=print) -> str:
    """Join two clips with a transition. The seam T7's sequencer will use.

    Both clips must share geometry and pixel format; xfade will not resample for you.
    `offset` is where the transition begins in A's timeline, which is A's length minus
    the transition, not A's length.
    """
    if transition not in TRANSITIONS:
        raise ValueError(f"unknown transition {transition!r}; expected one of {TRANSITIONS}")
    a, b, out = Path(video_a), Path(video_b), Path(video_out)
    ma, mb = probe(a), probe(b)
    if (ma["width"], ma["height"]) != (mb["width"], mb["height"]):
        raise EditError(f"clips differ in size: {ma['width']}x{ma['height']} vs "
                        f"{mb['width']}x{mb['height']}; xfade will not resample")
    if duration >= min(ma["duration"], mb["duration"]):
        raise EditError(f"transition ({duration}s) is longer than a clip")

    offset = max(0.0, ma["duration"] - duration)
    out.parent.mkdir(parents=True, exist_ok=True)
    _run([_ffmpeg(), "-y", "-i", str(a), "-i", str(b), "-filter_complex",
          f"[0:v][1:v]xfade=transition={transition}:duration={duration:g}:"
          f"offset={offset:g}[v]",
          "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(out)])
    log(f"[editor] {transition} {duration:g}s at {offset:g}s -> {out}")
    return str(out)


def trim(video_in, video_out, *, start: float = 0.0, duration: float, log=print) -> str:
    """Cut `duration` seconds starting at `start`. Output seeking, so it is frame-accurate.

    The renderer will not produce a clip shorter than four seconds (config.
    VIDEO_ALLOWED_DURATIONS). A two-second shot is therefore generated long and trimmed
    here. Input seeking (`-ss` before `-i`) would be faster and would land on the nearest
    keyframe, which is not where the shot ends.
    """
    video_in, video_out = Path(video_in), Path(video_out)
    meta = probe(video_in)
    if start + duration > meta["duration"] + 0.05:
        raise EditError(f"cannot trim {duration:g}s from {start:g}s of a "
                        f"{meta['duration']:.2f}s clip")
    video_out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [_ffmpeg(), "-y", "-i", str(video_in), "-ss", f"{start:g}", "-t", f"{duration:g}",
           "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"]
    cmd += (["-c:a", "copy"] if meta["has_audio"] else ["-an"])
    _run(cmd + [str(video_out)])
    log(f"[editor] trimmed {duration:g}s from {video_in.name} -> {video_out.name}")
    return str(video_out)


def last_frame(video_in, image_out) -> str:
    """The final frame, as a PNG. This is the continuity reference shot N+1 is conditioned
    on in `sequential` render mode, and the only thing that reaches Seedance's
    reference-to-video endpoint."""
    import imageio_ffmpeg               # lazy
    from PIL import Image               # lazy

    gen = imageio_ffmpeg.read_frames(str(video_in), pix_fmt="rgb24")
    meta = next(gen)
    w, h = meta["size"]
    last = None
    for raw in gen:
        last = raw
    if last is None:
        raise EditError(f"{video_in} has no frames")

    import numpy as np
    out = Path(image_out)
    out.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(np.frombuffer(last, dtype=np.uint8).reshape(h, w, 3)).save(out)
    return str(out)


def concat(clips: list, video_out, *, keep_audio: bool = False, log=print) -> str:
    """Join clips end to end. Video only by default.

    Audio is dropped on purpose. One voiceover runs across the whole timeline and is muxed
    once at the end (T3); splicing per-shot native audio at every cut produces exactly the
    seams the cuts were meant to hide. Pass `keep_audio=True` only when every clip has a
    track and you mean to keep them.

    The concat demuxer will not resample. Mismatched geometry is an error here rather than
    a garbled frame later.
    """
    if not clips:
        raise ValueError("concat called with no clips")
    paths = [Path(c) for c in clips]
    metas = [probe(p) for p in paths]
    first = (metas[0]["width"], metas[0]["height"])
    for p, m in zip(paths, metas):
        if (m["width"], m["height"]) != first:
            raise EditError(f"{p.name} is {m['width']}x{m['height']}, expected "
                            f"{first[0]}x{first[1]}; concat will not resample")
    if keep_audio and not all(m["has_audio"] for m in metas):
        raise EditError("keep_audio=True but some clips have no audio track")

    video_out = Path(video_out)
    video_out.parent.mkdir(parents=True, exist_ok=True)
    listing = video_out.with_name(video_out.stem + "_concat.txt")
    listing.write_text("".join(f"file '{p.resolve().as_posix()}'\n" for p in paths),
                       encoding="utf-8")

    cmd = [_ffmpeg(), "-y", "-f", "concat", "-safe", "0", "-i", str(listing),
           "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p"]
    cmd += (["-c:a", "aac"] if keep_audio else ["-an"])
    _run(cmd + [str(video_out)])
    listing.unlink(missing_ok=True)

    total = sum(m["duration"] for m in metas)
    log(f"[editor] concatenated {len(paths)} clip(s), {total:.1f}s -> {video_out.name}")
    return str(video_out)


def add_copy_overlay(video_in, video_out, copy, kit, *, fmt: str = "9:16",
                     logo_path: str | None = None) -> str:
    """Overlay the ad copy (headline/subhead/CTA + optional logo) onto `video_in`.

    Absorbed from video_post in T7.5. It was always an editor operation: a transparent
    PNG sized to the real clip, composited by ffmpeg, with the text drawn by Pillow so
    the model never renders a glyph.
    """
    import compositor                   # lazy: pulls PIL
    import layout as layout_mod         # lazy
    meta = probe(video_in)
    spec = layout_mod.plan_layout(copy, fmt, has_logo=bool(logo_path))
    overlay = Path(video_out).with_name(Path(video_out).stem + "_overlay.png")
    compositor.render_overlay(spec, copy, kit, overlay,
                              width=meta["width"], height=meta["height"],
                              logo_path=logo_path)
    _run([_ffmpeg(), "-y", "-i", str(video_in), "-i", str(overlay),
          "-filter_complex", "[0:v][1:v]overlay=0:0:format=auto",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy", str(video_out)])
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
