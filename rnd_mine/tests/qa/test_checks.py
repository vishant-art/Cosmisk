# tests/qa/test_checks.py
"""Unit tests for deterministic QA checks (Task 23).

Every probe call (`probe`, `probe_dims`, `probe_duration`) is monkeypatched
directly as a `creative_studio.qa.checks` attribute -- no real ffmpeg/ffprobe
subprocess ever runs in this module. `final_video`/clip paths are still real
(empty) files under `tmp_path` so the module's own `Path.exists()` gate for
"final missing" behaves exactly as it would against real media, without
needing a real media pipeline to produce one.
"""
from __future__ import annotations

from pathlib import Path

from creative_studio.qa import checks

SHOT_DURATIONS = [3.0, 4.0, 3.0]

# Cues exactly matching SHOT_DURATIONS's cumulative windows: [0,3), [3,7), [7,10) --
# touching boundaries, not overlapping, ending exactly at the clean 10.0s total.
CLEAN_SRT = (
    "1\n00:00:00,000 --> 00:00:03,000\nHook line\n\n"
    "2\n00:00:03,000 --> 00:00:07,000\nProduct line\n\n"
    "3\n00:00:07,000 --> 00:00:10,000\nCTA line\n\n"
)

# Cue 2 starts (3s) before cue 1 ends (5s) -- a real overlap.
OVERLAPPING_SRT = (
    "1\n00:00:00,000 --> 00:00:05,000\nHook line\n\n"
    "2\n00:00:03,000 --> 00:00:07,000\nProduct line\n\n"
)


def _touch(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")
    return path


def _clip_paths(tmp_path: Path, n: int = 3) -> list[Path]:
    return [_touch(tmp_path / f"clip_{i}.mp4") for i in range(n)]


def _patch_clean_probes(monkeypatch, clip_durations: dict | None = None, total_duration: float = 10.0):
    """Wires clean defaults (1080x1920 @30fps, matching `expected`'s own
    default) for every probe function; per-clip durations come from
    `clip_durations` (a `{Path: seconds}` map), everything else (i.e. the
    final video itself) reports `total_duration`."""
    monkeypatch.setattr(checks, "probe_dims", lambda path: (1080, 1920))
    monkeypatch.setattr(
        checks, "probe",
        lambda path: {"streams": [{"codec_type": "video", "r_frame_rate": "30/1"}]},
    )
    clip_durations = clip_durations or {}

    def fake_probe_duration(path):
        return clip_durations.get(path, total_duration)

    monkeypatch.setattr(checks, "probe_duration", fake_probe_duration)


# ---------------------------------------------------------------------------
# run_technical_checks
# ---------------------------------------------------------------------------

def test_clean_pass_produces_no_issues(tmp_path, monkeypatch):
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch, clip_durations={clips[0]: 3.0, clips[1]: 4.0, clips[2]: 3.0})

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, CLEAN_SRT)

    assert issues == []


def test_missing_final_video_short_circuits_with_single_critical(tmp_path, monkeypatch):
    final_video = tmp_path / "never_created.mp4"
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch)  # would raise if any probe fn were actually reached

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, CLEAN_SRT)

    assert len(issues) == 1
    assert issues[0]["severity"] == "critical"
    assert issues[0]["category"] == "composition"


def test_wrong_dims_is_critical(tmp_path, monkeypatch):
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch, clip_durations={clips[0]: 3.0, clips[1]: 4.0, clips[2]: 3.0})
    monkeypatch.setattr(checks, "probe_dims", lambda path: (720, 1280))

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, CLEAN_SRT)

    assert len(issues) == 1
    assert issues[0]["severity"] == "critical"
    assert issues[0]["category"] == "composition"
    assert "720" in issues[0]["message"] and "1080" in issues[0]["message"]


def test_wrong_clip_count_is_critical(tmp_path, monkeypatch):
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path, n=2)  # only 2, not the planned 3
    _patch_clean_probes(monkeypatch, clip_durations={clips[0]: 3.0, clips[1]: 4.0})

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, CLEAN_SRT)

    assert len(issues) == 1
    assert issues[0]["severity"] == "critical"
    assert issues[0]["category"] == "video"


def test_off_duration_clip_is_warning_named_by_shot(tmp_path, monkeypatch):
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch, clip_durations={
        clips[0]: 3.0, clips[1]: 4.5, clips[2]: 3.0,  # shot 2 off by 0.5 (> 0.2 tolerance)
    })

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, CLEAN_SRT)

    assert len(issues) == 1
    assert issues[0]["severity"] == "warning"
    assert issues[0]["category"] == "shot2_video"


def test_fps_off_is_warning(tmp_path, monkeypatch):
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch, clip_durations={clips[0]: 3.0, clips[1]: 4.0, clips[2]: 3.0})
    monkeypatch.setattr(
        checks, "probe",
        lambda path: {"streams": [{"codec_type": "video", "r_frame_rate": "24/1"}]},
    )

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, CLEAN_SRT)

    assert len(issues) == 1
    assert issues[0]["severity"] == "warning"
    assert issues[0]["category"] == "composition"
    assert "fps" in issues[0]["message"].lower()


def test_off_total_duration_is_critical(tmp_path, monkeypatch):
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(
        monkeypatch,
        clip_durations={clips[0]: 3.0, clips[1]: 4.0, clips[2]: 3.0},
        total_duration=12.0,  # outside 10 +/- 0.5
    )

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, CLEAN_SRT)

    assert len(issues) == 1
    assert issues[0]["severity"] == "critical"
    assert issues[0]["category"] == "composition"
    assert "duration" in issues[0]["message"].lower()


def test_overlapping_srt_is_warning(tmp_path, monkeypatch):
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch, clip_durations={clips[0]: 3.0, clips[1]: 4.0, clips[2]: 3.0})

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, OVERLAPPING_SRT)

    assert len(issues) == 1
    assert issues[0]["severity"] == "warning"
    assert issues[0]["category"] == "composition"
    assert "srt" in issues[0]["message"].lower()


def test_srt_extending_past_total_is_warning(tmp_path, monkeypatch):
    """No overlap, but the last cue reaches past total_duration + 0.5."""
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch, clip_durations={clips[0]: 3.0, clips[1]: 4.0, clips[2]: 3.0})
    overrunning_srt = (
        "1\n00:00:00,000 --> 00:00:03,000\nHook line\n\n"
        "2\n00:00:03,000 --> 00:00:11,000\nProduct line\n\n"  # ends at 11s > 10.5
    )

    issues = checks.run_technical_checks(final_video, clips, SHOT_DURATIONS, overrunning_srt)

    assert len(issues) == 1
    assert issues[0]["severity"] == "warning"
    assert issues[0]["category"] == "composition"


def test_expected_override_changes_dims_baseline(tmp_path, monkeypatch):
    """`expected` overrides the 1080x1920/30fps default -- a clip matching
    the OVERRIDE dims produces no issue even though it mismatches the
    module's own default."""
    final_video = _touch(tmp_path / "final.mp4")
    clips = _clip_paths(tmp_path)
    _patch_clean_probes(monkeypatch, clip_durations={clips[0]: 3.0, clips[1]: 4.0, clips[2]: 3.0})
    monkeypatch.setattr(checks, "probe_dims", lambda path: (270, 480))

    issues = checks.run_technical_checks(
        final_video, clips, SHOT_DURATIONS, CLEAN_SRT,
        expected={"width": 270, "height": 480, "fps": 30},
    )

    assert issues == []


# ---------------------------------------------------------------------------
# run_asset_checks
# ---------------------------------------------------------------------------

def test_asset_checks_dry_run_uri_is_info(fake_r2):
    issues = checks.run_asset_checks(fake_r2, {"portrait": "dry-run:portrait"})

    assert issues == [{"severity": "info", "category": "assets", "message": "dry-run artifact: portrait"}]


def test_asset_checks_missing_r2_object_is_critical(fake_r2):
    issues = checks.run_asset_checks(fake_r2, {"voice": "r2://test-bucket/missing/voice.wav"})

    assert len(issues) == 1
    assert issues[0]["severity"] == "critical"
    assert issues[0]["category"] == "assets"


def test_asset_checks_present_r2_object_has_no_issue(fake_r2):
    uri = fake_r2.put_bytes("voice.wav", b"data", "audio/wav")

    issues = checks.run_asset_checks(fake_r2, {"voice": uri})

    assert issues == []


def test_asset_checks_unrecognized_scheme_is_warning(fake_r2):
    issues = checks.run_asset_checks(fake_r2, {"voice": "https://not-our-scheme/x.wav"})

    assert len(issues) == 1
    assert issues[0]["severity"] == "warning"
    assert issues[0]["category"] == "assets"


def test_asset_checks_covers_every_named_uri(fake_r2):
    """A mixed manifest: one dry-run stub (info), one present r2 object (no
    issue at all), one missing r2 object (critical) -- exactly 2 issues,
    the present object contributing nothing."""
    present_uri = fake_r2.put_bytes("clip1.mp4", b"data", "video/mp4")
    issues = checks.run_asset_checks(fake_r2, {
        "portrait": "dry-run:portrait",
        "shot1_video": present_uri,
        "voice": "r2://test-bucket/missing/voice.wav",
    })

    assert len(issues) == 2
    by_severity = {issue["severity"] for issue in issues}
    assert by_severity == {"info", "critical"}
