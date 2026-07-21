# src/creative_studio/contracts/generation_task.py
from __future__ import annotations
from pydantic import Field, model_validator
from .base import ContractBase, CamelModel

class ShotTask(CamelModel):
    shot_number: int
    duration: float
    purpose: str
    image_task: dict = Field(default_factory=dict)
    video_task: dict = Field(default_factory=dict)
    voice_task: dict = Field(default_factory=dict)
    product_task: dict = Field(default_factory=dict)
    synchronization: dict = Field(default_factory=dict)

class GenerationTask(ContractBase):
    object_type: str = "GenerationTask"
    status: str = "pending"
    creative_spec_id: str
    context: dict = Field(default_factory=dict)
    global_configuration: dict = Field(default_factory=dict)
    shot_tasks: list[ShotTask]
    asset_references: dict = Field(default_factory=dict)
    execution_rules: dict = Field(default_factory=lambda: {
        "parallelGeneration": True, "retryLimit": 2, "requiresQA": True,
    })
    references: dict = Field(default_factory=dict)

    @model_validator(mode="after")
    def _rules(self):
        if [t.shot_number for t in self.shot_tasks] != [1, 2, 3]:
            raise ValueError("exactly 3 shot_tasks with shot_number 1,2,3 are required")
        return self
