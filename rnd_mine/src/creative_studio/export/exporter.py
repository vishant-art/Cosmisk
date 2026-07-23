# src/creative_studio/export/exporter.py
"""Export + `AssetManifest` assembly (Task 24): the final step of the 14-step
run-state graph. `export_run` reads whatever uri each upstream step actually
produced (a real `r2://...` uri once compose/qa are wired live, or a
`"dry-run:*"` stub in a dry run) out of the orchestrator's `_done_artifacts`
snapshot, assembles the manifest the client-facing layer consumes, uploads a
thumbnail when a real one exists on disk, and persists the manifest through
`repos.asset_manifests`.

`artifacts` here is the SAME shape `RealWorkers.qa`/`RealWorkers.compose`
already consume -- a dict keyed by run-state step name, each value the raw
artifact dict that step returned (`{"uri": ...}`, plus whatever extra keys
that step also carries, e.g. `qa`'s `qaReportId`). A step missing from
`artifacts` (never ran, or ran but produced no uri) falls back to a
`f"dry-run:{step}"` stub rather than `None` -- `AssetManifest`'s own
validator requires every uri-bearing field non-empty, and a `None` would
either fail validation or get silently coerced; the explicit stub keeps a
partial/dry run's manifest just as valid as a fully-live one.
"""
from __future__ import annotations

from pathlib import Path

from creative_studio.contracts import AssetManifest, CreativeSpec, new_id
from creative_studio.storage.r2 import key_for

_THUMBNAIL_CONTENT_TYPE = "image/jpeg"


def _uri(artifacts: dict, step: str) -> str:
    """The `uri` a finished step actually produced, or a `dry-run:<step>`
    stub when that step is absent from `artifacts` or produced no uri."""
    return (artifacts.get(step) or {}).get("uri") or f"dry-run:{step}"


async def export_run(
    r2,
    repos,
    spec: CreativeSpec,
    artifacts: dict[str, dict],
    generation_id: str,
    run_status: str,
    lineage: dict,
    thumbnail_local: str | None = None,
) -> AssetManifest:
    """Assemble, persist, and return the `AssetManifest` for one generation run.

    `artifacts` keys are run-state step names (`portrait`, `shot{n}_replace`,
    `shot{n}_video`, `voice`, `compose`, `qa`, ...); `lineage` carries the
    upstream planning-contract ids (`characterSheetId`/`shotSpecId`/
    `productId`) merged into `source_references` alongside the creative spec
    id. `thumbnail_local`, when it points at a real file on disk, is uploaded
    to R2 under the canonical thumbnail key; otherwise the manifest's
    thumbnail deliverable is the `"dry-run:thumbnail"` stub.
    """
    keyframes = [
        {
            "assetId": new_id("asset"),
            "type": "keyframe",
            "shotNumber": n,
            "r2Uri": _uri(artifacts, f"shot{n}_replace"),
        }
        for n in (1, 2, 3)
    ]
    portrait_asset = {"type": "portrait", "r2Uri": _uri(artifacts, "portrait")}
    image_assets = keyframes + [portrait_asset]

    video_assets = [
        {"type": "shot_clip", "shotNumber": n, "r2Uri": _uri(artifacts, f"shot{n}_video")}
        for n in (1, 2, 3)
    ]

    audio_assets = [{"type": "voiceover", "r2Uri": _uri(artifacts, "voice")}]

    thumbnail_uri = "dry-run:thumbnail"
    if thumbnail_local:
        local_path = Path(thumbnail_local)
        if local_path.exists():
            key = key_for("thumbnail", generation_id=generation_id)
            thumbnail_uri = r2.put_bytes(key, local_path.read_bytes(), _THUMBNAIL_CONTENT_TYPE)

    deliverables = {
        "primaryVideo": {"r2Uri": _uri(artifacts, "compose")},
        "primaryImage": {"r2Uri": _uri(artifacts, "shot2_replace")},
        "thumbnail": thumbnail_uri,
    }

    generation_summary = {
        "generationId": generation_id,
        "status": run_status,
        "durationSeconds": 10,
        "shots": 3,
        "language": spec.generation_context.get("language"),
    }

    source_references = {**lineage, "creativeSpecId": spec.id}
    storage_metadata = {"provider": "Cloudflare R2"}
    references = {
        "creativeSpecId": spec.id,
        "generationId": generation_id,
        "qaReportId": (artifacts.get("qa") or {}).get("qaReportId"),
    }

    manifest = AssetManifest(
        id=new_id("manifest"),
        creative_spec_id=spec.id,
        source="export",
        generation_summary=generation_summary,
        source_references=source_references,
        image_assets=image_assets,
        video_assets=video_assets,
        audio_assets=audio_assets,
        deliverables=deliverables,
        storage_metadata=storage_metadata,
        references=references,
    )
    await repos.asset_manifests.insert(manifest)
    return manifest
