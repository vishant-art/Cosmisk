# src/creative_studio/contracts/asset_manifest.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase

class AssetManifest(ContractBase):
    object_type: str = "AssetManifest"
    creative_spec_id: str
    generation_summary: dict = Field(default_factory=dict)
    source_references: dict = Field(default_factory=dict)
    image_assets: list[dict] = Field(default_factory=list)
    video_assets: list[dict] = Field(default_factory=list)
    audio_assets: list[dict] = Field(default_factory=list)
    deliverables: dict = Field(default_factory=dict)
    preview_assets: dict = Field(default_factory=dict)
    storage_metadata: dict = Field(default_factory=dict)
    references: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        shot_clips = [a for a in self.video_assets if a.get("type") == "shot_clip"]
        if len(shot_clips) != 3:
            raise ValueError("exactly 3 video_assets with type=='shot_clip' are required")
        keyframes = [a for a in self.image_assets if a.get("type") == "keyframe"]
        if len(keyframes) != 3:
            raise ValueError("exactly 3 image_assets with type=='keyframe' are required")
        primary_video = self.deliverables.get("primaryVideo")
        if not isinstance(primary_video, dict):
            primary_video = {}
        if not primary_video.get("r2Uri"):
            raise ValueError("deliverables.primaryVideo.r2Uri is required")
        return self
