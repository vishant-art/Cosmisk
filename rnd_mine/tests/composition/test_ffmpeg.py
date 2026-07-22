# tests/composition/test_ffmpeg.py
"""Unit + real-media tests for ffmpeg composition (Task 22): trim each clip
to its planned duration, concat into one normalized timeline, mux in a
separately-generated voice track, and burn planned-window subtitles.

Every media-producing test drives REAL ffmpeg/ffprobe subprocesses against
tiny lavfi-generated fixtures (three 5s colour clips + one 10s sine tone,
built once per module in `media_dir`) -- no network, no paid API, no mock
for the ffmpeg binary itself (the whole point of this module is shelling
out correctly, including the Windows subtitles-filter path trap), so this
suite requires a real ffmpeg/ffprobe on PATH.
"""
from __future__ import annotations

import subprocess

import pytest

from creative_studio.contracts import Shot
from creative_studio.composition.ffmpeg import (
    CompositionError,
    compose_ad,
    probe,
    probe_dims,
    probe_duration,
    srt_for,
    thumbnail,
    trim,
)

CLIP_SIZE = "270x480"
CLIP_WIDTH, CLIP_HEIGHT = 270, 480
CLIP_FPS = 30


def _make_shot(n: int, purpose: str, dur: float, dialogue: dict) -> Shot:
    """Mirrors tests/contracts/test_planning_contracts.py::make_shot, extended
    with a caller-supplied dialogue dict so callers can vary spokenText/subtitle."""
    return Shot(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={"summary": "s"}, camera={"shotType": "Medium"},
        character={"expression": "Smile"}, product={"visibility": "High"},
        dialogue=dialogue, audio={}, composition={}, constraints={},
    )


def _make_shot_without_dialogue(n: int, purpose: str, dur: float) -> Shot:
    """A Shot with neither `subtitle` nor `spokenText`. `Shot`'s own validator
    requires `dialogue.spokenText` truthy, so the normal constructor can never
    produce this -- `model_construct` bypasses validation to build the one
    edge case `srt_for` must still degrade gracefully for (its `or ""`
    fallback exists precisely for a dialogue dict shaped like this one)."""
    return Shot.model_construct(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={"summary": "s"}, camera={"shotType": "Medium"},
        character={"expression": "Smile"}, product={"visibility": "High"},
        dialogue={}, audio={}, composition={}, constraints={},
    )


# ---------------------------------------------------------------------------
# srt_for -- pure function, no ffmpeg involved
# ---------------------------------------------------------------------------

def test_srt_for_golden():
    """3 shots, durations [3, 4, 3]: shot 1 has only spokenText, shot 2 (the
    MIDDLE window, 3..7) has neither and is skipped entirely, shot 3 has both
    subtitle + spokenText and must prefer subtitle. Putting the skip in the
    middle (rather than last) proves numbering is sequential over EMITTED
    cues, not shot position: shot 3's cue is numbered 2, not 3."""
    shots = [
        _make_shot(1, "Hook", 3, {"spokenText": "Only 50 pairs left in stock"}),
        _make_shot_without_dialogue(2, "Product", 4),
        _make_shot(3, "CTA", 3, {
            "spokenText": "Full spoken script for the CTA voiceover",
            "subtitle": "Shop the drop now",
        }),
    ]
    durations = [3, 4, 3]

    expected = (
        "1\n00:00:00,000 --> 00:00:03,000\nOnly 50 pairs left in stock\n\n"
        "2\n00:00:07,000 --> 00:00:10,000\nShop the drop now\n\n"
    )

    assert srt_for(shots, durations) == expected


# ---------------------------------------------------------------------------
# real-media fixture (module-scoped: generated once, reused read-only)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def media_dir(tmp_path_factory):
    """Three 5s 270x480 colour clips (red/green/blue) + one 10s 440Hz sine
    wav, generated once via ffmpeg lavfi for the whole module -- real media,
    tiny and fast, no network, no cost."""
    d = tmp_path_factory.mktemp("composition_media")
    clip_paths = []
    for color in ("red", "green", "blue"):
        path = d / f"clip_{color}.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-nostdin",
                "-f", "lavfi", "-i", f"color=c={color}:size={CLIP_SIZE}:rate={CLIP_FPS}",
                "-t", "5",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
                str(path),
            ],
            check=True, capture_output=True,
        )
        clip_paths.append(path)

    voice_path = d / "voice.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-nostdin",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
            str(voice_path),
        ],
        check=True, capture_output=True,
    )
    return {"clips": clip_paths, "voice": voice_path}


# ---------------------------------------------------------------------------
# trim / probe
# ---------------------------------------------------------------------------

def test_trim_exact(media_dir, tmp_path):
    out_path = tmp_path / "trimmed.mp4"
    result = trim(media_dir["clips"][0], out_path, 3.0)

    assert result == out_path
    assert out_path.exists()
    assert abs(probe_duration(out_path) - 3.0) <= 0.2


# ---------------------------------------------------------------------------
# compose_ad end-to-end
# ---------------------------------------------------------------------------

def _compose_shots() -> list[Shot]:
    return [
        _make_shot(1, "Hook", 3, {"spokenText": "Only 50 pairs left in stock"}),
        _make_shot(2, "Product", 4, {"spokenText": "Handmade leather, built to last"}),
        _make_shot(3, "CTA", 3, {"spokenText": "Shop the collection today", "subtitle": "Shop now"}),
    ]


def test_compose_ad_end_to_end(media_dir, tmp_path):
    workdir = tmp_path / "compose"

    final = compose_ad(
        workdir=workdir,
        clip_paths=media_dir["clips"],
        shot_durations=[3, 4, 3],
        voice_path=media_dir["voice"],
        shots=_compose_shots(),
        width=CLIP_WIDTH, height=CLIP_HEIGHT, fps=CLIP_FPS,
    )

    assert final == workdir / "ad_final.mp4"
    assert final.exists()
    assert abs(probe_duration(final) - 10.0) <= 0.5
    assert probe_dims(final) == (CLIP_WIDTH, CLIP_HEIGHT)

    data = probe(final)
    audio_streams = [s for s in data["streams"] if s.get("codec_type") == "audio"]
    assert len(audio_streams) >= 1


def test_compose_ad_space_safe(media_dir, tmp_path):
    """Pins the subtitles cwd strategy: workdir lives under a directory whose
    name literally contains a space, mirroring the real OneDrive runtime
    path. If burn_subtitles ever regresses to passing an absolute srt path
    straight into the -vf filter graph, this is the test that catches it."""
    workdir = tmp_path / "with space"

    final = compose_ad(
        workdir=workdir,
        clip_paths=media_dir["clips"],
        shot_durations=[3, 4, 3],
        voice_path=media_dir["voice"],
        shots=_compose_shots(),
        width=CLIP_WIDTH, height=CLIP_HEIGHT, fps=CLIP_FPS,
    )

    assert final == workdir / "ad_final.mp4"
    assert final.exists()
    assert abs(probe_duration(final) - 10.0) <= 0.5


# ---------------------------------------------------------------------------
# thumbnail (extra: pins the one produced function no other test touches)
# ---------------------------------------------------------------------------

def test_thumbnail_creates_jpg(media_dir, tmp_path):
    out_path = tmp_path / "thumb.jpg"
    result = thumbnail(media_dir["clips"][0], out_path, at_seconds=1.0)

    assert result == out_path
    assert out_path.exists()
    assert out_path.stat().st_size > 0


# ---------------------------------------------------------------------------
# error handling
# ---------------------------------------------------------------------------

def test_missing_binary_raises(monkeypatch, tmp_path):
    """PATH emptied -> ffprobe can't be launched -> CompositionError wraps
    the FileNotFoundError with require_ffmpeg's own install hint (monkeypatch
    restores the real PATH automatically at teardown)."""
    monkeypatch.setenv("PATH", "")

    with pytest.raises(CompositionError) as exc_info:
        probe(tmp_path / "irrelevant.mp4")

    assert "install ffmpeg" in str(exc_info.value).lower()


def test_probe_bad_file_raises(tmp_path):
    bad_file = tmp_path / "not_a_video.txt"
    bad_file.write_text("this is not media", encoding="utf-8")

    with pytest.raises(CompositionError, match="ffprobe"):
        probe(bad_file)
