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

`qa` (Task 23) and compose/export (Task 24) are now all real. compose
downloads its shot clips (+ voice, if real) from R2, runs the real ffmpeg
compositor (`creative_studio.composition.ffmpeg.compose_ad`) off the event
loop, and uploads the final video; export assembles and persists the
`AssetManifest` via `creative_studio.export.exporter.export_run`. `qa`:
deterministic technical/asset checks (`creative_studio.qa`) build and
persist a `QAReport` through `services.repos.qa_reports`. The VLM critic
(subjective framing/brand/product-truth judgment) is explicitly out of scope
for `qa` here -- deferred by design, not a placeholder.
"""
from __future__ import annotations

import asyncio
import dataclasses
from pathlib import Path
from typing import TYPE_CHECKING

from creative_studio.composition.ffmpeg import compose_ad, srt_for
from creative_studio.composition.ffmpeg import thumbnail as render_thumbnail
from creative_studio.config import REPO_ROOT
from creative_studio.export.exporter import export_run
from creative_studio.generation.adapters.fal_image import generate_image
from creative_studio.generation.adapters.fal_tts import synthesize_voice
from creative_studio.generation.adapters.fal_video import generate_clip
from creative_studio.generation.builders import (
    build_image_prompt,
    build_video_prompt,
    build_voice_request,
)
from creative_studio.planning.character_generator import finalize_character
from creative_studio.qa.checks import run_asset_checks, run_technical_checks
from creative_studio.qa.report import build_qa_report
from creative_studio.storage.r2 import key_for

if TYPE_CHECKING:  # avoid any import cycle; these are only type hints
    from creative_studio.contracts import CharacterSheet, CreativeSpec, Product, ShotSpec
    from creative_studio.orchestration.orchestrator import RunMode, Services

_DEFAULT_WORKDIR_ROOT = REPO_ROOT / "rnd_mine" / "data" / "runs"
_FINAL_VIDEO_CONTENT_TYPE = "video/mp4"


class RealWorkers:
    """Production implementation of the orchestrator's worker protocol."""

    def __init__(
        self,
        services: "Services",
        spec: "CreativeSpec",
        sheet: "CharacterSheet",
        shot_spec: "ShotSpec",
        product: "Product",
        workdir_root: Path | None = None,
        compose_dims: tuple[int, int] = (1080, 1920),
    ) -> None:
        self.services = services
        self.spec = spec
        self.sheet = sheet
        self.shot_spec = shot_spec
        self.product = product
        self.workdir_root = workdir_root if workdir_root is not None else _DEFAULT_WORKDIR_ROOT
        self.compose_dims = compose_dims

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

    # compose / export -- both real as of Task 24.

    async def compose(self, task, artifacts: dict, mode: "RunMode") -> dict:
        if not mode.live_video:
            return {"uri": "dry-run:compose"}

        shots = self.shot_spec.shots
        durations = list(self.shot_spec.timing.shot_durations)
        clip_uris = [
            (artifacts.get(f"shot{n}_video") or {}).get("uri")
            for n in range(1, len(shots) + 1)
        ]
        clip_uris = [uri for uri in clip_uris if uri]

        # Guard BEFORE any download/compose work: a mismatched clip/duration/
        # shot count silently zip-truncates otherwise (flagged in Task 22's
        # review) rather than failing loudly.
        if not (len(clip_uris) == len(durations) == len(shots) == 3):
            raise ValueError(
                "compose requires exactly 3 clip artifacts, shot durations, and "
                f"shots (got clips={len(clip_uris)}, durations={len(durations)}, "
                f"shots={len(shots)})"
            )

        generation_id = self._generation_id(task)
        workdir = self.workdir_root / generation_id
        workdir.mkdir(parents=True, exist_ok=True)

        clip_paths = []
        for n, uri in enumerate(clip_uris, start=1):
            data = self.services.r2.get_bytes(self.services.r2.key_from_uri(uri))
            clip_path = workdir / f"shot{n}.mp4"
            clip_path.write_bytes(data)
            clip_paths.append(clip_path)

        voice_uri = (artifacts.get("voice") or {}).get("uri")
        voice_path = None
        if voice_uri and voice_uri.startswith("r2://"):
            voice_data = self.services.r2.get_bytes(self.services.r2.key_from_uri(voice_uri))
            voice_path = workdir / "voice.mp3"
            voice_path.write_bytes(voice_data)

        width, height = self.compose_dims
        final_path = await asyncio.to_thread(
            compose_ad, workdir, clip_paths, durations, voice_path, shots, width, height,
        )

        thumb_path = workdir / "thumb.jpg"
        await asyncio.to_thread(render_thumbnail, final_path, thumb_path)

        key = key_for("final_video", generation_id=generation_id)
        uri = self.services.r2.put_bytes(key, final_path.read_bytes(), _FINAL_VIDEO_CONTENT_TYPE)

        return {
            "uri": uri,
            "localPath": str(final_path),
            "thumbnailLocalPath": str(thumb_path),
        }

    @staticmethod
    def _plan_compliance(shot_spec: "ShotSpec") -> dict:
        """Structural facts derived from the APPROVED PLAN itself (not the
        generated artifacts) -- always computable, dry run or live. `three
        Shots`/`tenSecondDuration`/`hookPresent`/`ctaPresent` are actually
        guaranteed True for any contract-valid `ShotSpec` (its own validator
        already enforces exactly 3 shots in Hook/Product/CTA order and a 10s
        +/- 0.5 total); `productVisibleEveryShot` is the one flag that can
        genuinely vary, since nothing in the contract requires a truthy
        `product.visibility` on every shot."""
        shots = shot_spec.shots
        purposes = [shot.purpose for shot in shots]
        total = shot_spec.timing.total_duration
        return {
            "threeShots": len(shots) == 3,
            "tenSecondDuration": 9.5 <= total <= 10.5,
            "hookPresent": bool(purposes) and purposes[0] == "Hook",
            "ctaPresent": bool(purposes) and purposes[-1] == "CTA",
            "productVisibleEveryShot": all(bool(shot.product.get("visibility")) for shot in shots),
        }

    async def qa(self, task, artifacts: dict, mode: "RunMode") -> dict:
        """Deterministic QA (Task 23): build and persist a real `QAReport`.

        `artifacts` is the orchestrator's `_done_artifacts` snapshot -- every
        finished step's own artifact dict, keyed by step name. Asset checks
        always run against whatever uri each step actually produced. When
        every uri is still a `"dry-run:*"` stub (the whole run was dry),
        that's the full picture -- informational issues only. Otherwise
        (some step went live) ALSO look for a real composed final video at
        `artifacts["compose"]["localPath"]` (Task 24's live `compose` now
        produces one, plus per-clip local paths, whenever `mode.live_video`);
        the technical checks below run whenever that local video and all 3
        clip local paths are actually present.
        """
        uris = {
            name: step_artifacts["uri"]
            for name, step_artifacts in artifacts.items()
            if step_artifacts.get("uri")
        }
        issues = run_asset_checks(self.services.r2, uris)
        compliance = self._plan_compliance(self.shot_spec)

        all_dry = all(uri.startswith("dry-run:") for uri in uris.values())
        if not all_dry:
            local_path = artifacts.get("compose", {}).get("localPath")
            if local_path:
                final_video = Path(local_path)
                if final_video.exists():
                    shots = self.shot_spec.shots
                    shot_durations = list(self.shot_spec.timing.shot_durations)
                    srt_text = srt_for(shots, shot_durations)
                    clip_paths = [
                        Path(artifacts[f"shot{n}_video"]["localPath"])
                        for n in range(1, len(shots) + 1)
                        if artifacts.get(f"shot{n}_video", {}).get("localPath")
                    ]
                    if len(clip_paths) == len(shots):
                        issues = issues + run_technical_checks(
                            final_video, clip_paths, shot_durations, srt_text,
                        )

        report = build_qa_report(self.spec, issues, compliance=compliance)
        await self.services.repos.qa_reports.insert(report)
        return {"qaReportId": report.id, "approved": report.overall_result.get("approvedForExport")}

    async def export(self, task, artifacts: dict, mode: "RunMode") -> dict:
        lineage = {
            "characterSheetId": self.sheet.id,
            "shotSpecId": self.shot_spec.id,
            "productId": self.product.id,
        }
        manifest = await export_run(
            self.services.r2,
            self.services.repos,
            self.spec,
            artifacts=artifacts,
            generation_id=self._generation_id(task),
            run_status="running",
            lineage=lineage,
            thumbnail_local=(artifacts.get("compose") or {}).get("thumbnailLocalPath"),
        )
        return {
            "assetManifestId": manifest.id,
            "uri": manifest.deliverables["primaryVideo"]["r2Uri"],
        }
