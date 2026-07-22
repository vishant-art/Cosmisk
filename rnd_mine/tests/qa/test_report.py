# tests/qa/test_report.py
r"""Unit tests for `build_qa_report` (Task 23): deterministic section/overall
scoring (`max(0, 100 - 25*criticals - 5*warnings)`) and the regeneration
recommendation derived from the first critical issue whose category matches
`shot(\d+)_(\w+)`. No probes, no R2, no DB -- `qa.checks`'s output is just a
plain list of issue dicts fed straight in.
"""
from __future__ import annotations

from creative_studio.contracts import CreativeSpec, new_id
from creative_studio.qa.report import build_qa_report

_SECTIONS = ("image_qa", "video_qa", "voice_qa", "product_qa", "composition_qa")


def _make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        product={"productId": "product_1"},
        messaging={"cta": "Shop Now"},
    )


def test_clean_report_is_approved_and_passed():
    spec = _make_spec()

    report = build_qa_report(spec, issues=[])

    assert report.overall_result["status"] == "Passed"
    assert report.overall_result["approvedForExport"] is True
    assert report.overall_result["requiresRegeneration"] is False
    assert report.overall_result["overallScore"] == 100
    assert report.recommendations == {}
    for name in _SECTIONS:
        assert getattr(report, name)["score"] == 100
    assert report.creative_spec_id == spec.id
    assert report.references == {"creativeSpecId": spec.id}
    assert report.compliance == {}
    assert report.source == "qa"
    assert report.status == "completed"
    assert report.id.startswith("qa_")


def test_shot_video_critical_blocks_export_and_recommends_regeneration():
    spec = _make_spec()
    issues = [{"severity": "critical", "category": "shot2_video", "message": "shot 2 clip duration off plan"}]

    report = build_qa_report(spec, issues)

    assert report.overall_result["approvedForExport"] is False
    assert report.overall_result["requiresRegeneration"] is True
    assert report.overall_result["status"] == "Failed"
    assert report.recommendations == {
        "recommendedAction": "Regenerate shot 2",
        "retryStage": "shot2_video",
        "reason": "shot 2 clip duration off plan",
    }
    # scores match the formula exactly: only video_qa absorbs this one critical.
    assert report.video_qa["score"] == 75  # 100 - 25*1
    assert report.image_qa["score"] == 100
    assert report.voice_qa["score"] == 100
    assert report.product_qa["score"] == 100
    assert report.composition_qa["score"] == 100
    assert report.overall_result["overallScore"] == 75


def test_critical_without_shot_category_recommends_generic_review():
    spec = _make_spec()
    issues = [{"severity": "critical", "category": "composition", "message": "final video missing"}]

    report = build_qa_report(spec, issues)

    assert report.recommendations == {"recommendedAction": "Review critical issues"}
    assert report.composition_qa["score"] == 75
    assert report.overall_result["overallScore"] == 75


def test_first_matching_shot_critical_wins_when_several_present():
    """Two shot-scoped criticals: the recommendation names the FIRST one in
    issue order, not the most severe-looking or last."""
    spec = _make_spec()
    issues = [
        {"severity": "warning", "category": "shot1_video", "message": "minor drift"},
        {"severity": "critical", "category": "shot3_video", "message": "shot 3 clip missing"},
        {"severity": "critical", "category": "shot2_video", "message": "shot 2 clip missing"},
    ]

    report = build_qa_report(spec, issues)

    assert report.recommendations == {
        "recommendedAction": "Regenerate shot 3",
        "retryStage": "shot3_video",
        "reason": "shot 3 clip missing",
    }


def test_warning_only_penalty_still_approved():
    spec = _make_spec()
    issues = [
        {"severity": "warning", "category": "shot1_video", "message": "a"},
        {"severity": "warning", "category": "voice", "message": "b"},
    ]

    report = build_qa_report(spec, issues)

    assert report.overall_result["approvedForExport"] is True
    assert report.overall_result["requiresRegeneration"] is False
    assert report.video_qa["score"] == 95  # 100 - 5*1
    assert report.voice_qa["score"] == 95
    assert report.overall_result["overallScore"] == 90  # 100 - 5*2 across ALL issues
    assert report.recommendations == {}


def test_assets_category_maps_to_product_qa_and_info_costs_nothing():
    spec = _make_spec()
    issues = [{"severity": "info", "category": "assets", "message": "dry-run artifact: voice"}]

    report = build_qa_report(spec, issues)

    assert report.product_qa["score"] == 100
    assert report.overall_result["overallScore"] == 100
    assert report.issues == issues


def test_compliance_passes_through_and_scores_can_be_overridden():
    spec = _make_spec()
    compliance = {
        "threeShots": True, "tenSecondDuration": True,
        "hookPresent": True, "ctaPresent": True, "productVisibleEveryShot": True,
    }

    report = build_qa_report(
        spec, issues=[], compliance=compliance, scores={"video_qa": 42, "overall": 33},
    )

    assert report.compliance == compliance
    assert report.video_qa["score"] == 42
    assert report.overall_result["overallScore"] == 33
    # sections not named in `scores` still follow the formula.
    assert report.image_qa["score"] == 100
