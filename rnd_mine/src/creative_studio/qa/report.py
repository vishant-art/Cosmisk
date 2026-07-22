# src/creative_studio/qa/report.py
r"""Deterministic QA report assembly (Task 23): turns a flat list of `Issue`
dicts (from `creative_studio.qa.checks`) into a persisted-shape `QAReport` --
per-section scores, an overall pass/fail verdict, and (when derivable) a
targeted regeneration recommendation.

The VLM critic (subjective framing/brand/product-truth judgment) is
explicitly out of scope here -- deferred by design, not a placeholder.
`scores` exists as the seam a later, additive VLM pass can use to override a
section's (or the overall) deterministic score without touching this
module's formula.
"""
from __future__ import annotations

import re

from creative_studio.contracts import CreativeSpec, QAReport, new_id

_CRITICAL_PENALTY = 25
_WARNING_PENALTY = 5

# section field name -> substrings that route an issue's category to it. A
# category can match by simple containment, so "shot2_video" counts toward
# video_qa exactly like a bare "video" category would.
_SECTION_KEYWORDS: dict[str, tuple[str, ...]] = {
    "image_qa": ("keyframe", "image"),
    "video_qa": ("video",),
    "voice_qa": ("voice",),
    "product_qa": ("product", "replace", "assets"),
    "composition_qa": ("composition",),
}

_SHOT_CATEGORY_RE = re.compile(r"shot(\d+)_(\w+)")


def _score(criticals: int, warnings: int) -> int:
    return max(0, 100 - _CRITICAL_PENALTY * criticals - _WARNING_PENALTY * warnings)


def _sections_for(category: str) -> list[str]:
    category = category or ""
    return [
        section for section, keywords in _SECTION_KEYWORDS.items()
        if any(keyword in category for keyword in keywords)
    ]


def _count_by_severity(issues: list[dict]) -> tuple[int, int]:
    criticals = sum(1 for issue in issues if issue.get("severity") == "critical")
    warnings = sum(1 for issue in issues if issue.get("severity") == "warning")
    return criticals, warnings


def _recommendations(issues: list[dict], has_critical: bool) -> dict:
    r"""The first CRITICAL issue (in list order) whose category matches
    `shot(\d+)_(\w+)` names its shot as the regeneration target; failing
    that, any critical at all still blocks export and gets a generic
    review recommendation; no criticals -> no recommendation."""
    for issue in issues:
        if issue.get("severity") != "critical":
            continue
        match = _SHOT_CATEGORY_RE.match(issue.get("category") or "")
        if match:
            shot_number = match.group(1)
            return {
                "recommendedAction": f"Regenerate shot {shot_number}",
                "retryStage": issue.get("category"),
                "reason": issue.get("message"),
            }
    if has_critical:
        return {"recommendedAction": "Review critical issues"}
    return {}


def build_qa_report(
    spec: CreativeSpec,
    issues: list[dict],
    compliance: dict | None = None,
    scores: dict | None = None,
) -> QAReport:
    """Assemble a `QAReport` from a flat issue list.

    `compliance` is a plan-derived facts dict (see `RealWorkers._plan_
    compliance`), passed through unchanged (default `{}`). `scores`, when
    given, overrides the deterministic formula for any of the five section
    keys ("image_qa", ...) and/or "overall" -- sections/overall not named in
    `scores` still use the formula.
    """
    compliance = compliance if compliance is not None else {}
    scores = scores if scores is not None else {}

    section_issues: dict[str, list[dict]] = {name: [] for name in _SECTION_KEYWORDS}
    for issue in issues:
        for section in _sections_for(issue.get("category", "")):
            section_issues[section].append(issue)

    sections: dict[str, dict] = {}
    for name, matched in section_issues.items():
        if name in scores:
            sections[name] = {"score": scores[name]}
        else:
            criticals, warnings = _count_by_severity(matched)
            sections[name] = {"score": _score(criticals, warnings)}

    overall_criticals, overall_warnings = _count_by_severity(issues)
    has_critical = overall_criticals > 0
    overall_score = scores.get("overall", _score(overall_criticals, overall_warnings))

    overall_result = {
        "status": "Failed" if has_critical else "Passed",
        "overallScore": overall_score,
        "approvedForExport": not has_critical,
        "requiresRegeneration": has_critical,
    }

    return QAReport(
        id=new_id("qa"),
        creative_spec_id=spec.id,
        source="qa",
        status="completed",
        overall_result=overall_result,
        image_qa=sections["image_qa"],
        video_qa=sections["video_qa"],
        voice_qa=sections["voice_qa"],
        product_qa=sections["product_qa"],
        composition_qa=sections["composition_qa"],
        compliance=compliance,
        issues=issues,
        recommendations=_recommendations(issues, has_critical),
        references={"creativeSpecId": spec.id},
    )
