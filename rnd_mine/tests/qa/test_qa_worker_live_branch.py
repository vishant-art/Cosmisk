# tests/qa/test_qa_worker_live_branch.py
"""Reviewer-required coverage (Task 24): `RealWorkers.qa`'s live-technical-
checks branch (`workers.py` lines ~192-208) had zero coverage because
`compose` wasn't wired to produce a real `localPath` when Task 23 landed --
`artifacts.get("compose", {}).get("localPath")` was always empty in every
existing qa test, so `run_technical_checks` never actually ran.

Drives `RealWorkers.qa` directly (no Orchestrator, no real ffmpeg) against a
fake `Services`, with the ffprobe-facing functions in `creative_studio.qa.
checks` monkeypatched exactly as `tests/qa/test_checks.py` does -- only real
(empty) tmp files under the artifacts' localPath keys, so the module's own
`Path.exists()` gate behaves as it would against real media without needing
one.

Final-review Fix 1: production never publishes a `localPath` on the
`shot{n}_video` step artifacts (video uploads straight to R2); only
`compose` -- which downloads the clips to run ffmpeg -- ever has them on
disk, so it is the one that publishes `clipLocalPaths` (keyed by shot
number, as a string). The fixtures below now carry that REAL shape; the two
new tests at the bottom pin the WARNING QA appends (instead of silently
skipping) when that local media isn't actually there.
"""
from __future__ import annotations

from pathlib import Path

from creative_studio.contracts import CreativeSpec, QAReport, Shot, ShotSpec, Timing, new_id
from creative_studio.generation.workers import RealWorkers
from creative_studio.orchestration.orchestrator import RunMode, Services
from creative_studio.qa import checks

_BUCKET = "test-bucket"


class _FakeQaReportsRepo:
    def __init__(self) -> None:
        self.docs: dict[str, QAReport] = {}

    async def insert(self, obj: QAReport) -> None:
        self.docs[obj.id] = obj


class _FakeRepos:
    def __init__(self, qa_reports: _FakeQaReportsRepo) -> None:
        self.qa_reports = qa_reports


def _make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        product={"productId": "product_1"},
        messaging={"cta": "Shop Now"},
    )


def _shot(n: int, purpose: str, dur: float) -> Shot:
    return Shot(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={"summary": "s"}, camera={"shotType": "Medium"},
        character={"expression": "Smile"}, product={"visibility": "High"},
        dialogue={"spokenText": f"line {n}"},
    )


def _make_shot_spec() -> ShotSpec:
    return ShotSpec(
        id=new_id("shotspec"),
        creative_spec_id="creative_1",
        character_id="character_1",
        timing=Timing(total_duration=10, shot_durations=[3, 4, 3]),
        global_style={"aspectRatio": "9:16", "fps": 30},
        shots=[_shot(1, "Hook", 3), _shot(2, "Product", 4), _shot(3, "CTA", 3)],
    )


def _make_workers(fake_r2, qa_reports: _FakeQaReportsRepo) -> RealWorkers:
    services = Services(
        adapter=None, r2=fake_r2, repos=_FakeRepos(qa_reports), run_store=None, settings=None,
    )
    return RealWorkers(services=services, spec=_make_spec(), sheet=None, shot_spec=_make_shot_spec(), product=None)


def _touch(path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"")
    return path


def _live_artifacts(tmp_path: Path) -> dict:
    """Mirrors `Orchestrator._done_artifacts` for a run where compose
    actually produced a real final video + real per-clip local paths (Task
    24's live compose wiring, updated by the final-review Fix 1 to publish
    `clipLocalPaths` on `compose` ITSELF rather than on each `shot{n}_video`
    step -- production never puts a `localPath` there). Every uri is a real
    `r2://` stand-in so `compose`'s own uri is not a `"dry-run:*"` stub and
    the live-technical-checks branch actually runs."""
    final_video = _touch(tmp_path / "ad_final.mp4")
    clip1 = _touch(tmp_path / "shot1.mp4")
    clip2 = _touch(tmp_path / "shot2.mp4")
    clip3 = _touch(tmp_path / "shot3.mp4")
    return {
        "portrait": {"uri": f"r2://{_BUCKET}/runs/g1/portraits/primary.png"},
        "shot1_keyframe": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot1/raw.png"},
        "shot1_replace": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot1/replaced.png"},
        "shot1_video": {"uri": f"r2://{_BUCKET}/runs/g1/clips/shot1.mp4"},
        "shot2_keyframe": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot2/raw.png"},
        "shot2_replace": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot2/replaced.png"},
        "shot2_video": {"uri": f"r2://{_BUCKET}/runs/g1/clips/shot2.mp4"},
        "shot3_keyframe": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot3/raw.png"},
        "shot3_replace": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot3/replaced.png"},
        "shot3_video": {"uri": f"r2://{_BUCKET}/runs/g1/clips/shot3.mp4"},
        "voice": {"uri": f"r2://{_BUCKET}/runs/g1/voice/narration.wav"},
        "compose": {
            "uri": f"r2://{_BUCKET}/runs/g1/final/ad.mp4",
            "localPath": str(final_video),
            "thumbnailLocalPath": str(tmp_path / "thumb.jpg"),
            "clipLocalPaths": {"1": str(clip1), "2": str(clip2), "3": str(clip3)},
        },
    }


def _put_all(fake_r2, artifacts: dict) -> None:
    """Put a byte under every real r2:// uri so `run_asset_checks` (which
    always runs, unconditionally) doesn't itself inject critical issues that
    would mask the technical-check assertions below -- this test is about
    the live-technical-checks branch, not asset presence."""
    for step_artifacts in artifacts.values():
        uri = step_artifacts.get("uri", "")
        if uri.startswith("r2://"):
            fake_r2.put_bytes(fake_r2.key_from_uri(uri), b"x", "application/octet-stream")


def _clip_duration(path) -> float:
    return {"shot1.mp4": 3.0, "shot2.mp4": 4.0, "shot3.mp4": 3.0}.get(Path(path).name, 10.0)


def _patch_clean_probes(monkeypatch) -> None:
    monkeypatch.setattr(checks, "probe_dims", lambda path: (1080, 1920))
    monkeypatch.setattr(
        checks, "probe",
        lambda path: {"streams": [{"codec_type": "video", "r_frame_rate": "30/1"}]},
    )
    monkeypatch.setattr(
        checks, "probe_duration",
        lambda path: 10.0 if Path(path).name == "ad_final.mp4" else _clip_duration(path),
    )


async def test_technical_checks_run_and_pass_when_probes_are_clean(fake_r2, tmp_path, monkeypatch):
    artifacts = _live_artifacts(tmp_path)
    _put_all(fake_r2, artifacts)
    _patch_clean_probes(monkeypatch)

    qa_reports = _FakeQaReportsRepo()
    workers = _make_workers(fake_r2, qa_reports)

    result = await workers.qa(task=None, artifacts=artifacts, mode=RunMode())

    assert result["approved"] is True
    report = qa_reports.docs[result["qaReportId"]]
    assert report.overall_result["approvedForExport"] is True
    # zero issues at all -- confirms the technical-checks branch ran (it's
    # unconditional once a real localPath exists) and found nothing wrong.
    assert report.issues == []
    assert report.composition_qa["score"] == 100


async def test_technical_checks_wrong_dims_blocks_approval(fake_r2, tmp_path, monkeypatch):
    """Forcing the composed video's probed dimensions to mismatch the
    expected 1080x1920 must surface as a critical composition issue and flip
    the report to un-approved -- proof the live branch's `run_technical_
    checks` call actually feeds into the persisted report."""
    artifacts = _live_artifacts(tmp_path)
    _put_all(fake_r2, artifacts)
    _patch_clean_probes(monkeypatch)
    monkeypatch.setattr(checks, "probe_dims", lambda path: (720, 1280))

    qa_reports = _FakeQaReportsRepo()
    workers = _make_workers(fake_r2, qa_reports)

    result = await workers.qa(task=None, artifacts=artifacts, mode=RunMode())

    assert result["approved"] is False
    report = qa_reports.docs[result["qaReportId"]]
    assert report.overall_result["approvedForExport"] is False
    assert report.overall_result["requiresRegeneration"] is True
    assert any(
        issue["severity"] == "critical" and "resolution" in issue["message"]
        for issue in report.issues
    )
    assert report.composition_qa["score"] < 100


async def test_missing_clip_local_path_skips_technical_checks_and_warns(fake_r2, tmp_path, monkeypatch):
    """If even one shot's local path is missing from `compose.clipLocalPaths`,
    the live branch's own length guard (`len(clip_paths) == len(shots)`)
    must skip `run_technical_checks` entirely rather than crash or partially
    check (unaffected by dims/duration probes, which are patched to fail
    loudly if reached) -- but, per the final-review fix, it must no longer
    skip SILENTLY: a WARNING issue is appended instead."""
    artifacts = _live_artifacts(tmp_path)
    del artifacts["compose"]["clipLocalPaths"]["2"]
    _put_all(fake_r2, artifacts)

    def _boom(path):
        raise AssertionError(f"probe_dims should not be called: {path}")

    monkeypatch.setattr(checks, "probe_dims", _boom)

    qa_reports = _FakeQaReportsRepo()
    workers = _make_workers(fake_r2, qa_reports)

    result = await workers.qa(task=None, artifacts=artifacts, mode=RunMode())

    # a WARNING alone never blocks approval (only a CRITICAL does).
    assert result["approved"] is True
    report = qa_reports.docs[result["qaReportId"]]
    assert any(
        issue["severity"] == "warning"
        and issue["category"] == "composition"
        and issue["message"] == "technical checks skipped: local media unavailable"
        for issue in report.issues
    )


async def test_missing_clip_local_paths_key_entirely_emits_warning(fake_r2, tmp_path, monkeypatch):
    """Same guarantee when `compose` carries no `clipLocalPaths` key at all
    (not just one shot's entry) -- production shape drift must still surface
    as a WARNING, never a silent skip."""
    artifacts = _live_artifacts(tmp_path)
    del artifacts["compose"]["clipLocalPaths"]
    _put_all(fake_r2, artifacts)

    def _boom(path):
        raise AssertionError(f"probe_dims should not be called: {path}")

    monkeypatch.setattr(checks, "probe_dims", _boom)

    qa_reports = _FakeQaReportsRepo()
    workers = _make_workers(fake_r2, qa_reports)

    result = await workers.qa(task=None, artifacts=artifacts, mode=RunMode())

    assert result["approved"] is True
    report = qa_reports.docs[result["qaReportId"]]
    assert any(
        issue["severity"] == "warning"
        and issue["category"] == "composition"
        and issue["message"] == "technical checks skipped: local media unavailable"
        for issue in report.issues
    )
