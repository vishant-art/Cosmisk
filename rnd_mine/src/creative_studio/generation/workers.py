# src/creative_studio/generation/workers.py
"""`RealWorkers`: the production worker layer the Orchestrator (Task 20)
delegates to.

Each method maps one run-state step to real provider work, but every paid
call is gated behind the `RunMode` flags -- in a dry run every method returns
a `"dry-run:*"` artifact stub and touches no adapter, no R2, no money. The
orchestrator never inspects these bodies; it only awaits them and stores the
returned artifact dict.

`RealWorkers` holds the four planning contracts (`spec`, `sheet`, `shot_spec`,
`product`); the `GenerationTask` handed to each method supplies only run
configuration and `context.generationId`. The portrait step is the one place
`self.sheet` is replaced at runtime -- with the completed, portrait-bearing
sheet -- so later live keyframes can reference the character portrait.

compose / qa / export are deliberately still dry stubs in this task; Tasks
22-24 replace their bodies with the real ffmpeg compositor, VLM QA, and
export. They carry a `"pending"` marker so a dry end-to-end run still walks
all 14 steps to completion.
"""
from __future__ import annotations

import dataclasses
from typing import TYPE_CHECKING

from creative_studio.generation.adapters.fal_image import generate_image
from creative_studio.generation.adapters.fal_tts import synthesize_voice
from creative_studio.generation.adapters.fal_video import generate_clip
from creative_studio.generation.builders import (
    build_image_prompt,
    build_video_prompt,
    build_voice_request,
)
from creative_studio.planning.character_generator import finalize_character
from creative_studio.storage.r2 import key_for

if TYPE_CHECKING:  # avoid any import cycle; these are only type hints
    from creative_studio.contracts import CharacterSheet, CreativeSpec, Product, ShotSpec
    from creative_studio.orchestration.orchestrator import RunMode, Services


class RealWorkers:
    """Production implementation of the orchestrator's worker protocol."""

    def __init__(
        self,
        services: "Services",
        spec: "CreativeSpec",
        sheet: "CharacterSheet",
        shot_spec: "ShotSpec",
        product: "Product",
    ) -> None:
        self.services = services
        self.spec = spec
        self.sheet = sheet
        self.shot_spec = shot_spec
        self.product = product

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _generation_id(task) -> str:
        return task.context["generationId"]

    def _presign_uri(self, uri: str | None) -> str | None:
        """Presign an `r2://` artifact uri for a provider to fetch, or return
        None for a missing or dry-run stub uri."""
        if not uri or not uri.startswith("r2://"):
            return None
        return self.services.r2.presign(self.services.r2.key_from_uri(uri))

    # -- steps ---------------------------------------------------------------

    async def portrait(self, task, mode: "RunMode") -> dict:
        if not mode.live_images:
            return {"uri": "dry-run:portrait"}
        completed = await finalize_character(
            self.sheet, self.services.adapter, self.services.r2,
            self._generation_id(task), live=True,
        )
        # The completed, portrait-bearing sheet is a runtime object; keep it on
        # self for later keyframes. The immutable stored sheet is NOT re-inserted.
        self.sheet = completed
        return {"uri": completed.reference_assets["primaryPortrait"]["r2Uri"]}

    async def keyframe(self, task, shot_number: int, mode: "RunMode") -> dict:
        shot = self.shot_spec.shots[shot_number - 1]
        prompt = build_image_prompt(shot, self.sheet, self.spec, self.product)
        if not mode.live_images:
            return {"uri": f"dry-run:keyframe{shot_number}", "promptText": prompt.prompt}

        portrait_uri = (self.sheet.reference_assets.get("primaryPortrait") or {}).get("r2Uri")
        presigned = self._presign_uri(portrait_uri)
        if presigned:
            prompt = dataclasses.replace(prompt, reference_image_urls=(presigned,))
        key = key_for("keyframe_raw", generation_id=self._generation_id(task), shot=shot_number)
        uri, meta = await generate_image(self.services.adapter, self.services.r2, prompt, key)
        return {"uri": uri, "meta": meta}

    async def replace(self, task, shot_number: int, artifacts: dict, mode: "RunMode") -> dict:
        if not mode.live_images:
            return {"uri": f"dry-run:replaced{shot_number}"}
        try:
            from creative_studio.replacement.pipeline import replace_on_keyframe
        except ImportError as exc:  # module lands in Task 21
            raise NotImplementedError("replacement pipeline lands in Task 21") from exc
        uri = await replace_on_keyframe(
            self.services.adapter, self.services.r2, artifacts["uri"],
            self.product, self._generation_id(task), shot_number,
        )
        return {"uri": uri}

    async def video(self, task, shot_number: int, artifacts: dict, mode: "RunMode") -> dict:
        if not mode.live_video:
            return {"uri": f"dry-run:clip{shot_number}"}
        shot = self.shot_spec.shots[shot_number - 1]
        video_prompt = build_video_prompt(shot, self.sheet)
        image_url = self._presign_uri(artifacts.get("uri"))
        if image_url:
            video_prompt = dataclasses.replace(video_prompt, image_url=image_url)
        key = key_for("clip", generation_id=self._generation_id(task), shot=shot_number)
        uri, meta = await generate_clip(self.services.adapter, self.services.r2, video_prompt, key)
        return {"uri": uri, "meta": meta}

    async def voice(self, task, mode: "RunMode") -> dict:
        if not mode.live_video:
            return {"uri": "dry-run:voice"}
        voice_request = build_voice_request(self.shot_spec.shots, self.spec, self.sheet)
        key = key_for("voice", generation_id=self._generation_id(task))
        uri, meta = await synthesize_voice(self.services.adapter, self.services.r2, voice_request, key)
        return {"uri": uri, "meta": meta}

    # compose / qa / export -- dry stubs until Tasks 22-24 fill them in.

    async def compose(self, task, artifacts: dict, mode: "RunMode") -> dict:
        return {"uri": "dry-run:compose", "pending": "Task 22-24"}

    async def qa(self, task, artifacts: dict, mode: "RunMode") -> dict:
        return {"uri": "dry-run:qa", "pending": "Task 22-24"}

    async def export(self, task, artifacts: dict, mode: "RunMode") -> dict:
        return {"uri": "dry-run:export", "pending": "Task 22-24"}
