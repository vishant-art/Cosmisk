# tests/contracts/test_output_contracts.py
import pytest
from pydantic import ValidationError
from creative_studio.contracts.base import new_id
from creative_studio.contracts.qa_report import QAReport
from creative_studio.contracts.generation_task import GenerationTask, ShotTask
from creative_studio.contracts.asset_manifest import AssetManifest


def test_critical_issue_blocks_export():
    with pytest.raises(ValidationError):
        QAReport(id=new_id("qa"), creative_spec_id="creative_1",
                 overall_result={"approvedForExport": True},
                 issues=[{"severity": "critical", "category": "product", "message": "misaligned"}],
                 references={})


def test_invalid_severity_rejected():
    with pytest.raises(ValidationError):
        QAReport(id=new_id("qa"), creative_spec_id="creative_1",
                 overall_result={"approvedForExport": False},
                 issues=[{"severity": "blocker", "category": "product", "message": "bad severity value"}],
                 references={})


# --- GenerationTask: exactly 3 shot_tasks with shot_number [1,2,3] ---

def make_shot_task(n, **over):
    d = dict(shot_number=n, duration=3.0, purpose="Hook",
             image_task={}, video_task={}, voice_task={}, product_task={}, synchronization={})
    d.update(over)
    return ShotTask(**d)


def make_generation_task(**over):
    d = dict(id=new_id("generation"), creative_spec_id="creative_1",
             context={}, global_configuration={"resolution": "1080x1920", "fps": 30,
                                                "duration": 10, "aspectRatio": "9:16"},
             shot_tasks=[make_shot_task(1), make_shot_task(2), make_shot_task(3)],
             asset_references={}, references={})
    d.update(over)
    return GenerationTask(**d)


def test_generation_task_requires_three_shot_tasks():
    with pytest.raises(ValidationError):
        make_generation_task(shot_tasks=[make_shot_task(1), make_shot_task(2)])
    make_generation_task()


# --- AssetManifest: exactly 3 shot_clip video_assets, exactly 3 keyframe image_assets ---

def make_manifest(**over):
    d = dict(id=new_id("manifest"), creative_spec_id="creative_1",
             generation_summary={}, source_references={},
             image_assets=[{"type": "keyframe"}, {"type": "keyframe"}, {"type": "keyframe"}],
             video_assets=[{"type": "shot_clip"}, {"type": "shot_clip"}, {"type": "shot_clip"}],
             audio_assets=[],
             deliverables={"primaryVideo": {"r2Uri": "r2://bucket/video.mp4"}},
             preview_assets={}, storage_metadata={}, references={})
    d.update(over)
    return AssetManifest(**d)


def test_manifest_counts_enforced():
    with pytest.raises(ValidationError):
        make_manifest(video_assets=[{"type": "shot_clip"}, {"type": "shot_clip"}])


def test_manifest_valid():
    manifest = make_manifest(
        image_assets=[{"type": "keyframe"}, {"type": "keyframe"}, {"type": "keyframe"},
                      {"type": "portrait"}],
    )
    assert manifest.object_type == "AssetManifest"


# --- Package exports ---

def test_contracts_package_exports():
    from creative_studio.contracts import (
        BrandContext, Product, Campaign,
        CreativeSpec, CharacterSheet, ShotSpec,
        GenerationTask as ExportedGenerationTask,
        AssetManifest as ExportedAssetManifest,
        QAReport as ExportedQAReport,
    )
    assert all([BrandContext, Product, Campaign, CreativeSpec, CharacterSheet, ShotSpec,
                ExportedGenerationTask, ExportedAssetManifest, ExportedQAReport])
