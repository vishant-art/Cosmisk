# tests/qa/test_qa_worker.py
"""Task 23: `RealWorkers.qa` wiring. The dry-run e2e path must produce a
real, persisted `QAReport` -- not the old `{"uri": "dry-run:qa", "pending":
"Task 22-24"}` stub. Drives `RealWorkers.qa` directly (no Orchestrator, no
real Postgres) against a fake `Services` whose `repos.qa_reports` is a
dict-backed insert-recorder and whose `r2` is the shared project-root
`FakeR2` double -- see `tests/orchestration/test_orchestrator.py::
test_real_workers_dry_e2e` for the equivalent real-Postgres, full-pipeline
version of this same wiring.
"""
from __future__ import annotations

from creative_studio.contracts import (
    CreativeSpec,
    QAReport,
    Shot,
    ShotSpec,
    Timing,
    new_id,
)
from creative_studio.generation.workers import RealWorkers
from creative_studio.orchestration.orchestrator import RunMode, Services


class _FakeQaReportsRepo:
    """Dict-backed insert-recorder standing in for the real Postgres-backed
    `DocRepository[QAReport]` -- insert-only, keyed by id, same write shape
    as the real repo (`await repo.insert(obj)`), no update semantics to fake."""

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


def _shot(n: int, purpose: str, dur: float, visibility: str = "High") -> Shot:
    return Shot(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={"summary": "s"}, camera={"shotType": "Medium"},
        character={"expression": "Smile"}, product={"visibility": visibility},
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


# Exactly the shape of `Orchestrator._done_artifacts` right before it calls
# `workers.qa` in a fully dry run: every one of the 11 generation steps plus
# `compose`, all still carrying their `"dry-run:*"` stub uris.
_ALL_DRY_ARTIFACTS = {
    "portrait": {"uri": "dry-run:portrait"},
    "shot1_keyframe": {"uri": "dry-run:keyframe1", "promptText": "..."},
    "shot1_replace": {"uri": "dry-run:replaced1"},
    "shot1_video": {"uri": "dry-run:clip1"},
    "shot2_keyframe": {"uri": "dry-run:keyframe2", "promptText": "..."},
    "shot2_replace": {"uri": "dry-run:replaced2"},
    "shot2_video": {"uri": "dry-run:clip2"},
    "shot3_keyframe": {"uri": "dry-run:keyframe3", "promptText": "..."},
    "shot3_replace": {"uri": "dry-run:replaced3"},
    "shot3_video": {"uri": "dry-run:clip3"},
    "voice": {"uri": "dry-run:voice"},
    "compose": {"uri": "dry-run:compose", "pending": "Task 22-24"},
}


def _make_workers(fake_r2, qa_reports: _FakeQaReportsRepo) -> RealWorkers:
    services = Services(
        adapter=None, r2=fake_r2, repos=_FakeRepos(qa_reports), run_store=None, settings=None,
    )
    # `sheet`/`product` are positionally required by RealWorkers.__init__ but
    # never read by `qa()` -- left as None rather than building unused
    # fixtures (nothing else in this module touches either).
    return RealWorkers(services=services, spec=_make_spec(), sheet=None, shot_spec=_make_shot_spec(), product=None)


async def test_all_dry_artifacts_produce_approved_persisted_report(fake_r2):
    qa_reports = _FakeQaReportsRepo()
    workers = _make_workers(fake_r2, qa_reports)

    result = await workers.qa(task=None, artifacts=_ALL_DRY_ARTIFACTS, mode=RunMode())

    assert result["approved"] is True
    assert result["qaReportId"] in qa_reports.docs

    report = qa_reports.docs[result["qaReportId"]]
    assert isinstance(report, QAReport)
    assert report.overall_result["approvedForExport"] is True
    assert report.compliance == {
        "threeShots": True,
        "tenSecondDuration": True,
        "hookPresent": True,
        "ctaPresent": True,
        "productVisibleEveryShot": True,
    }
    # every dry-run artifact surfaces as an informational issue only.
    assert len(report.issues) == len(_ALL_DRY_ARTIFACTS)
    assert all(issue["severity"] == "info" for issue in report.issues)


async def test_missing_r2_asset_blocks_approval(fake_r2):
    """One real (never-put) r2:// uri mixed into an otherwise-dry artifact
    set: `run_asset_checks` still runs (it's unconditional), finds it
    missing, and the report comes back un-approved."""
    qa_reports = _FakeQaReportsRepo()
    workers = _make_workers(fake_r2, qa_reports)
    artifacts = dict(_ALL_DRY_ARTIFACTS)
    artifacts["voice"] = {"uri": "r2://test-bucket/missing/voice.wav"}

    result = await workers.qa(task=None, artifacts=artifacts, mode=RunMode())

    assert result["approved"] is False
    report = qa_reports.docs[result["qaReportId"]]
    assert report.overall_result["requiresRegeneration"] is True
    assert any(
        issue["severity"] == "critical" and issue["category"] == "assets"
        for issue in report.issues
    )


async def test_compliance_reflects_low_product_visibility(fake_r2):
    """`productVisibleEveryShot` is the one compliance flag that isn't
    guaranteed true by ShotSpec's own contract validator -- pin it going
    False when a shot's product visibility is falsy."""
    qa_reports = _FakeQaReportsRepo()
    services = Services(
        adapter=None, r2=fake_r2, repos=_FakeRepos(qa_reports), run_store=None, settings=None,
    )
    shot_spec = ShotSpec(
        id=new_id("shotspec"),
        creative_spec_id="creative_1",
        character_id="character_1",
        timing=Timing(total_duration=10, shot_durations=[3, 4, 3]),
        global_style={"aspectRatio": "9:16", "fps": 30},
        shots=[
            _shot(1, "Hook", 3, visibility=""),  # falsy
            _shot(2, "Product", 4),
            _shot(3, "CTA", 3),
        ],
    )
    workers = RealWorkers(services=services, spec=_make_spec(), sheet=None, shot_spec=shot_spec, product=None)

    result = await workers.qa(task=None, artifacts=_ALL_DRY_ARTIFACTS, mode=RunMode())

    report = qa_reports.docs[result["qaReportId"]]
    assert report.compliance["productVisibleEveryShot"] is False
    # unrelated compliance flags are unaffected.
    assert report.compliance["threeShots"] is True
