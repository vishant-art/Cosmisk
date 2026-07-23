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
    actually produced a real final video + real per-clip localPaths (Task
    24's live compose wiring) -- every uri is a real `r2://` stand-in so
    `run_asset_checks`'s `all_dry` short-circuit does NOT trigger and the
    live-technical-checks branch actually runs."""
    final_video = _touch(tmp_path / "ad_final.mp4")
    clip1 = _touch(tmp_path / "shot1.mp4")
    clip2 = _touch(tmp_path / "shot2.mp4")
    clip3 = _touch(tmp_path / "shot3.mp4")
    return {
        "portrait": {"uri": f"r2://{_BUCKET}/runs/g1/portraits/primary.png"},
        "shot1_keyframe": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot1/raw.png"},
        "shot1_replace": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot1/replaced.png"},
        "shot1_video": {"uri": f"r2://{_BUCKET}/runs/g1/clips/shot1.mp4", "localPath": str(clip1)},
        "shot2_keyframe": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot2/raw.png"},
        "shot2_replace": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot2/replaced.png"},
        "shot2_video": {"uri": f"r2://{_BUCKET}/runs/g1/clips/shot2.mp4", "localPath": str(clip2)},
        "shot3_keyframe": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot3/raw.png"},
        "shot3_replace": {"uri": f"r2://{_BUCKET}/runs/g1/keyframes/shot3/replaced.png"},
        "shot3_video": {"uri": f"r2://{_BUCKET}/runs/g1/clips/shot3.mp4", "localPath": str(clip3)},
        "voice": {"uri": f"r2://{_BUCKET}/runs/g1/voice/narration.wav"},
        "compose": {
            "uri": f"r2://{_BUCKET}/runs/g1/final/ad.mp4",
            "localPath": str(final_video),
            "thumbnailLocalPath": str(tmp_path / "thumb.jpg"),
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


async def test_missing_clip_local_path_skips_technical_checks(fake_r2, tmp_path, monkeypatch):
    """If even one shot's `localPath` is missing, the live branch's own
    length guard (`len(clip_paths) == len(shots)`) must skip
    `run_technical_checks` entirely rather than crash or partially check --
    unaffected by dims/duration probes, which are patched to fail loudly if
    reached."""
    artifacts = _live_artifacts(tmp_path)
    del artifacts["shot2_video"]["localPath"]
    _put_all(fake_r2, artifacts)

    def _boom(path):
        raise AssertionError(f"probe_dims should not be called: {path}")

    monkeypatch.setattr(checks, "probe_dims", _boom)

    qa_reports = _FakeQaReportsRepo()
    workers = _make_workers(fake_r2, qa_reports)

    result = await workers.qa(task=None, artifacts=artifacts, mode=RunMode())

    # no technical-check issues at all (only would-be asset-check issues,
    # and every asset is present here), so it still approves.
    assert result["approved"] is True
