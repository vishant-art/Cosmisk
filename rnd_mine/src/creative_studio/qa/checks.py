# src/creative_studio/qa/checks.py
"""Deterministic QA checks (Task 23): resolution/fps/duration/clip-count/
srt-window checks against the composed final video (`run_technical_checks`),
plus artifact-presence checks against whatever was actually produced
(`run_asset_checks`). Every check here is a plain, non-LLM comparison against
probed ffmpeg/ffprobe facts or R2 existence -- the VLM critic (subjective
framing/brand/product-truth judgment) is explicitly OUT of scope for this
module; see the Task 23 brief. Issues are plain dicts (not a pydantic model)
so `creative_studio.qa.report.build_qa_report` can freely bucket/count them
by category.

`probe`/`probe_dims`/`probe_duration` are imported by NAME from
`creative_studio.composition.ffmpeg` and called directly (not through a
module-qualified reference) -- that makes each one a `creative_studio.qa.
checks` attribute in its own right, so tests can `monkeypatch.setattr(checks,
"probe_duration", fake)` per function without ever touching real ffmpeg.
"""
from __future__ import annotations

import re
from pathlib import Path

from creative_studio.composition.ffmpeg import probe, probe_dims, probe_duration

DEFAULT_EXPECTED: dict = {"width": 1080, "height": 1920, "fps": 30}

_TOTAL_DURATION_TARGET = 10.0
_TOTAL_DURATION_TOLERANCE = 0.5
_FPS_TOLERANCE = 0.1
_CLIP_DURATION_TOLERANCE = 0.2
_EXPECTED_CLIP_COUNT = 3
_SRT_OVERRUN_BUFFER = 0.5

_SRT_CUE_RE = re.compile(
    r"(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})"
)


def _issue(severity: str, category: str, message: str) -> dict:
    return {"severity": severity, "category": category, "message": message}


def _parse_frame_rate(rate: str) -> float:
    """Parse ffprobe's `r_frame_rate` fraction string ("30/1", "30000/1001",
    ...) into a float fps. Malformed/missing input degrades to 0.0 -- a
    stream this broken already earns its own issue from the caller's
    comparison against `expected["fps"]`, not a crash in here."""
    num, _, den = (rate or "").partition("/")
    try:
        denominator = float(den) if den else 1.0
        return float(num) / denominator if denominator else 0.0
    except ValueError:
        return 0.0


def _parse_srt_windows(srt_text: str) -> list[tuple[float, float]]:
    """Every `start --> end` cue window in `srt_text`, in file order, as
    `(start_seconds, end_seconds)` tuples."""
    windows = []
    for match in _SRT_CUE_RE.finditer(srt_text or ""):
        h1, m1, s1, ms1, h2, m2, s2, ms2 = (int(group) for group in match.groups())
        start = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000
        end = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000
        windows.append((start, end))
    return windows


def run_technical_checks(
    final_video: Path,
    clip_paths: list[Path],
    shot_durations: list[float],
    srt_text: str,
    expected: dict | None = None,
) -> list[dict]:
    """Deterministic technical checks against the composed final video and
    its source clips.

    Check order (matches the Task 23 controller resolution exactly): a
    missing final video short-circuits everything else -- nothing downstream
    can be probed -- then dims -> fps -> total duration -> clip count ->
    per-clip duration vs plan -> srt cue windows.
    """
    if expected is None:
        expected = DEFAULT_EXPECTED

    if not final_video.exists():
        return [_issue("critical", "composition", f"final video missing: {final_video}")]

    issues: list[dict] = []

    width, height = probe_dims(final_video)
    if (width, height) != (expected["width"], expected["height"]):
        issues.append(_issue(
            "critical", "composition",
            f"resolution {width}x{height} != expected {expected['width']}x{expected['height']}",
        ))

    probed = probe(final_video)
    video_stream = next(
        (s for s in probed.get("streams", []) if s.get("codec_type") == "video"), {}
    )
    fps = _parse_frame_rate(video_stream.get("r_frame_rate", ""))
    if abs(fps - expected["fps"]) > _FPS_TOLERANCE:
        issues.append(_issue(
            "warning", "composition",
            f"fps {fps:.3f} != expected {expected['fps']} (tolerance {_FPS_TOLERANCE})",
        ))

    total_duration = probe_duration(final_video)
    if abs(total_duration - _TOTAL_DURATION_TARGET) > _TOTAL_DURATION_TOLERANCE:
        issues.append(_issue(
            "critical", "composition",
            f"total duration {total_duration:.2f}s outside "
            f"{_TOTAL_DURATION_TARGET}s +/- {_TOTAL_DURATION_TOLERANCE}",
        ))

    if len(clip_paths) != _EXPECTED_CLIP_COUNT:
        issues.append(_issue(
            "critical", "video",
            f"expected {_EXPECTED_CLIP_COUNT} clips, found {len(clip_paths)}",
        ))

    for index, (clip_path, planned_duration) in enumerate(zip(clip_paths, shot_durations)):
        shot_number = index + 1
        actual_duration = probe_duration(clip_path)
        if abs(actual_duration - planned_duration) > _CLIP_DURATION_TOLERANCE:
            issues.append(_issue(
                "warning", f"shot{shot_number}_video",
                f"shot {shot_number} clip duration {actual_duration:.2f}s != "
                f"planned {planned_duration:.2f}s (tolerance {_CLIP_DURATION_TOLERANCE})",
            ))

    windows = _parse_srt_windows(srt_text)
    overrun_bound = total_duration + _SRT_OVERRUN_BUFFER
    overlaps = any(windows[i][0] < windows[i - 1][1] for i in range(1, len(windows)))
    overruns = any(end > overrun_bound for _start, end in windows)
    if overlaps or overruns:
        issues.append(_issue(
            "warning", "composition",
            "srt cue windows overlap or extend beyond the final video's duration",
        ))

    return issues


def run_asset_checks(r2, uris: dict[str, str]) -> list[dict]:
    """One issue per named artifact uri: a `dry-run:` stub is informational
    (expected in a dry run, not a problem); a real `r2://` uri must actually
    exist in the bucket (critical if it doesn't); anything else (empty or an
    unrecognized scheme) is a warning worth a human look."""
    issues: list[dict] = []
    for name, uri in uris.items():
        if uri and uri.startswith("dry-run:"):
            issues.append(_issue("info", "assets", f"dry-run artifact: {name}"))
        elif uri and uri.startswith("r2://"):
            if not r2.exists(r2.key_from_uri(uri)):
                issues.append(_issue("critical", "assets", f"{name}: not found in r2 ({uri})"))
        else:
            issues.append(_issue("warning", "assets", f"{name}: missing or unrecognized uri ({uri!r})"))
    return issues
