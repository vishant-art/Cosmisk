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

    async def keyframe(self, task, shot_number: int, portrait_artifacts: dict, mode: "RunMode") -> dict:
        """`portrait_artifacts` is the portrait step's own persisted artifacts
        (`state.steps["portrait"].artifacts`), threaded in by the
        orchestrator on every call -- not just the first. `self.sheet` only
        gains its generated portrait when THIS worker instance's own
        `portrait()` call ran (it mutates `self.sheet` in place); on a
        resume where the portrait step is already `done`/`skipped`,
        `self.sheet` stays the portrait-less planning sheet, so relying on it
        alone would silently drop the reference image for every remaining
        live keyframe. Priority order for the reference uri: a real `r2://`
        uri on `portrait_artifacts` (the freshest, this-run truth), else the
        sheet's own portrait (set when portrait ran this call), else the
        task's compiled `asset_references` (the lineage-resolved fallback).
        """
        shot = self.shot_spec.shots[shot_number - 1]
        prompt = build_image_prompt(shot, self.sheet, self.spec, self.product)
        if not mode.live_images:
            return {"uri": f"dry-run:keyframe{shot_number}", "promptText": prompt.prompt}

        artifact_uri = (portrait_artifacts or {}).get("uri")
        portrait_uri = (
            (artifact_uri if artifact_uri and artifact_uri.startswith("r2://") else None)
            or (self.sheet.reference_assets.get("primaryPortrait") or {}).get("r2Uri")
            or task.asset_references.get("characterPortrait")
        )
        presigned = self._presign_uri(portrait_uri)
        if presigned:
            prompt = dataclasses.replace(prompt, reference_image_urls=(presigned,))
        key = key_for("keyframe_raw", generation_id=self._generation_id(task), shot=shot_number)
        uri, meta = await generate_image(self.services.adapter, self.services.r2, prompt, key)
        return {"uri": uri, "meta": meta}

    async def replace(self, task, shot_number: int, artifacts: dict, mode: "RunMode") -> dict:
        if not mode.live_images:
            return {"uri": f"dry-run:replaced{shot_number}"}
        from creative_studio.replacement.pipeline import replace_on_keyframe

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
            # Published so `qa`'s live-technical-checks branch can find the
            # per-clip local files -- production never puts a `localPath` on
            # the `shot{n}_video` step artifacts themselves (video uploads
            # straight to R2); `compose` is the one step that actually
            # downloads the clips to disk, so it's the one that must publish
            # where they landed.
            "clipLocalPaths": {str(n): str(workdir / f"shot{n}.mp4") for n in (1, 2, 3)},
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
        always run against whatever uri each step actually produced.

        The live-technical-checks branch is gated on `compose`'s OWN
        artifacts being real (a `uri` that isn't a `"dry-run:*"` stub) --
        i.e. `RealWorkers.compose`'s live path actually ran. Local media
        paths are read from `compose`'s own artifacts (`localPath`, plus
        per-clip `clipLocalPaths` -- `compose` is the one step that actually
        downloads the shot clips to disk; production's `shot{n}_video` step
        artifacts never carry a `localPath`, since video uploads straight to
        R2). If compose went real but that local media is missing or
        nonexistent on disk (a production misconfiguration, not an ordinary
        dry run), QA does NOT silently skip the technical checks -- it
        appends a WARNING issue so a real run's QA report always shows that
        technical checks did not run, rather than quietly omitting them.
        """
        uris = {
            name: step_artifacts["uri"]
            for name, step_artifacts in artifacts.items()
            if step_artifacts.get("uri")
        }
        issues = run_asset_checks(self.services.r2, uris)
        compliance = self._plan_compliance(self.shot_spec)

        compose_artifacts = artifacts.get("compose") or {}
        compose_uri = compose_artifacts.get("uri") or ""
        compose_is_real = bool(compose_uri) and not compose_uri.startswith("dry-run:")

        if compose_is_real:
            shots = self.shot_spec.shots
            local_path = compose_artifacts.get("localPath")
            clip_local_paths = compose_artifacts.get("clipLocalPaths") or {}
            clip_paths = [
                Path(clip_local_paths[str(n)])
                for n in range(1, len(shots) + 1)
                if clip_local_paths.get(str(n))
            ]
            media_available = (
                bool(local_path)
                and Path(local_path).exists()
                and len(clip_paths) == len(shots)
                and all(path.exists() for path in clip_paths)
            )
            if media_available:
                shot_durations = list(self.shot_spec.timing.shot_durations)
                srt_text = srt_for(shots, shot_durations)
                issues = issues + run_technical_checks(
                    Path(local_path), clip_paths, shot_durations, srt_text,
                )
            else:
                issues = issues + [{
                    "severity": "warning",
                    "category": "composition",
                    "message": "technical checks skipped: local media unavailable",
                }]

        report = build_qa_report(self.spec, issues, compliance=compliance)
        await self.services.repos.qa_reports.insert(report)
        return {"qaReportId": report.id, "approved": report.overall_result.get("approvedForExport")}

    async def export(self, task, artifacts: dict, mode: "RunMode") -> dict:
        lineage = {
            "characterSheetId": self.sheet.id,
            "shotSpecId": self.shot_spec.id,
            "productId": self.product.id,
        }
        # A manifest only exists when the pipeline reached export successfully, so completed is truthful
        manifest = await export_run(
            self.services.r2,
            self.services.repos,
            self.spec,
            artifacts=artifacts,
            generation_id=self._generation_id(task),
            run_status="completed",
            lineage=lineage,
            thumbnail_local=(artifacts.get("compose") or {}).get("thumbnailLocalPath"),
        )
        return {
            "assetManifestId": manifest.id,
            "uri": manifest.deliverables["primaryVideo"]["r2Uri"],
        }
