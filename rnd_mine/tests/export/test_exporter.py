# tests/export/test_exporter.py
"""Task 24: `export_run` -- assembles, persists, and returns the
`AssetManifest` for one generation run from the orchestrator's
`_done_artifacts` snapshot (dict keyed by run-state step name).

Uses the shared project-root `FakeR2` double (`tests/conftest.py`) and a
throwaway dict-backed insert-recorder standing in for the real
Postgres-backed `repos.asset_manifests` -- no real Postgres, no network.
"""
from __future__ import annotations

from creative_studio.contracts import AssetManifest, CreativeSpec, new_id
from creative_studio.export.exporter import export_run


class _FakeAssetManifestsRepo:
    """Dict-backed insert-recorder standing in for the real Postgres-backed
    `DocRepository[AssetManifest]` -- insert-only, keyed by id."""

    def __init__(self) -> None:
        self.docs: dict[str, AssetManifest] = {}

    async def insert(self, obj: AssetManifest) -> None:
        self.docs[obj.id] = obj


class _FakeRepos:
    def __init__(self, asset_manifests: _FakeAssetManifestsRepo) -> None:
        self.asset_manifests = asset_manifests


def _make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        product={"productId": "product_1"},
        messaging={"cta": "Shop Now"},
    )


# Mirrors Orchestrator._done_artifacts right before it would call
# workers.export in a fully dry run: every one of the 11 generation steps
# plus compose, all still carrying their "dry-run:*" stub uris, plus qa's
# own artifact shape (qaReportId/approved, no "uri" key at all).
_ALL_DRY_ARTIFACTS = {
    "portrait": {"uri": "dry-run:portrait"},
    "shot1_keyframe": {"uri": "dry-run:keyframe1"},
    "shot1_replace": {"uri": "dry-run:replaced1"},
    "shot1_video": {"uri": "dry-run:clip1"},
    "shot2_keyframe": {"uri": "dry-run:keyframe2"},
    "shot2_replace": {"uri": "dry-run:replaced2"},
    "shot2_video": {"uri": "dry-run:clip2"},
    "shot3_keyframe": {"uri": "dry-run:keyframe3"},
    "shot3_replace": {"uri": "dry-run:replaced3"},
    "shot3_video": {"uri": "dry-run:clip3"},
    "voice": {"uri": "dry-run:voice"},
    "compose": {"uri": "dry-run:compose"},
    "qa": {"qaReportId": "qa_abc123", "approved": True},
}

_LINEAGE = {
    "characterSheetId": "character_1",
    "shotSpecId": "shotspec_1",
    "productId": "product_1",
}


async def test_dry_artifacts_produce_valid_persisted_manifest(fake_r2):
    repo = _FakeAssetManifestsRepo()
    repos = _FakeRepos(repo)
    spec = _make_spec()

    manifest = await export_run(
        fake_r2, repos, spec,
        artifacts=_ALL_DRY_ARTIFACTS,
        generation_id="gen_1",
        run_status="running",
        lineage=_LINEAGE,
    )

    assert isinstance(manifest, AssetManifest)
    # inserted through the (fake) repo
    assert manifest.id in repo.docs
    assert repo.docs[manifest.id] is manifest

    # counts the AssetManifest validator itself enforces -- pinned again here
    # so a regression shows up as a test failure, not just a validation error
    keyframes = [a for a in manifest.image_assets if a["type"] == "keyframe"]
    assert len(keyframes) == 3
    assert {a["shotNumber"] for a in keyframes} == {1, 2, 3}
    portraits = [a for a in manifest.image_assets if a["type"] == "portrait"]
    assert len(portraits) == 1
    shot_clips = [a for a in manifest.video_assets if a["type"] == "shot_clip"]
    assert len(shot_clips) == 3

    assert manifest.deliverables["primaryVideo"]["r2Uri"] == "dry-run:compose"
    # the Product shot's (shot 2) replaced keyframe is the static deliverable
    assert manifest.deliverables["primaryImage"]["r2Uri"] == "dry-run:replaced2"
    assert manifest.deliverables["thumbnail"] == "dry-run:thumbnail"

    assert manifest.audio_assets == [{"type": "voiceover", "r2Uri": "dry-run:voice"}]

    # qaReportId threaded from qa's own artifact shape into references
    assert manifest.references["qaReportId"] == "qa_abc123"
    assert manifest.references["creativeSpecId"] == spec.id
    assert manifest.references["generationId"] == "gen_1"

    assert manifest.source_references["creativeSpecId"] == spec.id
    assert manifest.source_references["characterSheetId"] == "character_1"
    assert manifest.source_references["shotSpecId"] == "shotspec_1"
    assert manifest.source_references["productId"] == "product_1"

    assert manifest.generation_summary["generationId"] == "gen_1"
    assert manifest.generation_summary["status"] == "running"
    assert manifest.generation_summary["language"] == "English"
    assert manifest.generation_summary["shots"] == 3

    assert manifest.storage_metadata == {"provider": "Cloudflare R2"}
    assert manifest.source == "export"


async def test_missing_step_uris_fall_back_to_dry_run_stub(fake_r2):
    """A partial artifact set (e.g. a run that failed before export normally
    would ever run) must still produce a VALID manifest -- every uri falls
    back to its own `dry-run:<step>` stub rather than `None`."""
    repo = _FakeAssetManifestsRepo()
    repos = _FakeRepos(repo)
    spec = _make_spec()

    manifest = await export_run(
        fake_r2, repos, spec,
        artifacts={},
        generation_id="gen_2",
        run_status="running",
        lineage={},
    )

    assert manifest.deliverables["primaryVideo"]["r2Uri"] == "dry-run:compose"
    assert all(a["r2Uri"] == f"dry-run:shot{a['shotNumber']}_replace" for a in manifest.image_assets if a["type"] == "keyframe")
    assert all(a["r2Uri"].startswith("dry-run:") for a in manifest.video_assets)
    assert manifest.references["qaReportId"] is None


async def test_real_thumbnail_local_file_uploads_and_is_referenced(fake_r2, tmp_path):
    repo = _FakeAssetManifestsRepo()
    repos = _FakeRepos(repo)
    spec = _make_spec()
    thumb_path = tmp_path / "thumb.jpg"
    thumb_path.write_bytes(b"fake-jpeg-bytes")

    manifest = await export_run(
        fake_r2, repos, spec,
        artifacts=_ALL_DRY_ARTIFACTS,
        generation_id="gen_3",
        run_status="running",
        lineage=_LINEAGE,
        thumbnail_local=str(thumb_path),
    )

    thumbnail_uri = manifest.deliverables["thumbnail"]
    assert thumbnail_uri.startswith("r2://")
    key = fake_r2.key_from_uri(thumbnail_uri)
    assert (key, "image/jpeg") in fake_r2.put_calls
    assert fake_r2.get_bytes(key) == b"fake-jpeg-bytes"


async def test_missing_thumbnail_local_file_falls_back_to_dry_run(fake_r2, tmp_path):
    """A `thumbnail_local` path that doesn't actually exist on disk (e.g. a
    stale/relative path) must not raise -- falls back to the dry-run stub
    exactly like a `None` thumbnail_local would."""
    repo = _FakeAssetManifestsRepo()
    repos = _FakeRepos(repo)
    spec = _make_spec()

    manifest = await export_run(
        fake_r2, repos, spec,
        artifacts=_ALL_DRY_ARTIFACTS,
        generation_id="gen_4",
        run_status="running",
        lineage=_LINEAGE,
        thumbnail_local=str(tmp_path / "never_created.jpg"),
    )

    assert manifest.deliverables["thumbnail"] == "dry-run:thumbnail"
