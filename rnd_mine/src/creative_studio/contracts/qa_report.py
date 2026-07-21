# src/creative_studio/contracts/qa_report.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

_VALID_SEVERITIES = {"info", "warning", "critical"}

class QAReport(ContractBase):
    object_type: str = "QAReport"
    creative_spec_id: str
    overall_result: dict = Field(default_factory=dict)
    image_qa: dict = Field(default_factory=dict)
    video_qa: dict = Field(default_factory=dict)
    voice_qa: dict = Field(default_factory=dict)
    product_qa: dict = Field(default_factory=dict)
    composition_qa: dict = Field(default_factory=dict)
    compliance: dict = Field(default_factory=dict)
    issues: list[dict] = Field(default_factory=list)
    recommendations: dict = Field(default_factory=dict)
    references: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        for issue in self.issues:
            if issue.get("severity") not in _VALID_SEVERITIES:
                raise ValueError("issue.severity must be one of info, warning, critical")
        has_critical = any(issue.get("severity") == "critical" for issue in self.issues)
        if has_critical and self.overall_result.get("approvedForExport"):
            raise ValueError("overall_result.approvedForExport must be falsy when a critical issue is present")
        return self
