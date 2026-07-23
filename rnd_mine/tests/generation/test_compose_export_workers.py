# tests/generation/test_compose_export_workers.py
"""Task 24: `RealWorkers.compose`/`RealWorkers.export` wiring.

`compose`'s dry stub drops the old `"pending": "Task 22-24"` marker. Its live
body downloads the 3 shot clips (+ voice, if real) from R2, runs REAL
ffmpeg/ffprobe through `creative_studio.composition.ffmpeg.compose_ad`
(no mock -- the whole point is shelling out correctly), and uploads the
result. `export` (dry or live) delegates to `creative_studio.export.
exporter.export_run` and returns the manifest id + its primaryVideo uri.

The live compose test drives real ffmpeg against tiny lavfi-generated media
(mirrors `tests/composition/test_ffmpeg.py`'s own fixture style: 3 5s
270x480 colour clips + one 10s sine wav, built once per module) preloaded
into a fresh `FakeR2` per test, with `compose_dims` shrunk to match the
fixture's own small frame size -- no network, no paid API, requires a real
ffmpeg/ffprobe on PATH.
"""
from __future__ import annotations

import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from creative_studio.contracts import AssetManifest, CreativeSpec, Shot, ShotSpec, Timing, new_id
from creative_studio.generation.workers import RealWorkers
from creative_studio.orchestration.orchestrator import RunMode, Services
from creative_studio.storage.r2 import key_for

CLIP_SIZE = "270x480"
CLIP_DIMS = (270, 480)
CLIP_FPS = 30


class _Task:
    def __init__(self, generation_id: str) -> None:
        self.context = {"generationId": generation_id}


def _shot(n: int, purpose: str, dur: float, text: str) -> Shot:
    return Shot(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={"summary": "s"}, camera={"shotType": "Medium"},
        character={"expression": "Smile"}, product={"visibility": "High"},
        dialogue={"spokenText": text},
    )


def _make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        product={"productId": "product_1"},
        messaging={"cta": "Shop Now"},
    )


def _make_shot_spec() -> ShotSpec:
    return ShotSpec(
        id=new_id("shotspec"),
        creative_spec_id="creative_1",
        character_id="character_1",
        timing=Timing(total_duration=10, shot_durations=[3, 4, 3]),
        global_style={"aspectRatio": "9:16", "fps": 30},
        shots=[
            _shot(1, "Hook", 3, "Only 50 pairs left in stock"),
            _shot(2, "Product", 4, "Handmade leather, built to last"),
            _shot(3, "CTA", 3, "Shop the collection today"),
        ],
    )


def _make_workers(fake_r2, workdir_root, repos=None, shot_spec=None, sheet=None, product=None) -> RealWorkers:
    services = Services(adapter=None, r2=fake_r2, repos=repos, run_store=None, settings=None)
    return RealWorkers(
        services=services,
        spec=_make_spec(),
        sheet=sheet,
        shot_spec=shot_spec or _make_shot_spec(),
        product=product,
        workdir_root=workdir_root,
        compose_dims=CLIP_DIMS,
    )


# ---------------------------------------------------------------------------
# real-media fixture (module-scoped: generated once via lavfi, reused as bytes)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def media_bytes(tmp_path_factory):
    d = tmp_path_factory.mktemp("compose_worker_media")
    clips: dict[int, bytes] = {}
    for n, color in enumerate(("red", "green", "blue"), start=1):
        path = d / f"clip{n}.mp4"
        subprocess.run(
            [
                "ffmpeg", "-y", "-nostdin",
                "-f", "lavfi", "-i", f"color=c={color}:size={CLIP_SIZE}:rate={CLIP_FPS}",
                "-t", "5",
                "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "ultrafast",
                str(path),
            ],
            check=True, capture_output=True,
        )
        clips[n] = path.read_bytes()

    voice_path = d / "voice.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-nostdin",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
            str(voice_path),
        ],
        check=True, capture_output=True,
    )
    return {"clips": clips, "voice": voice_path.read_bytes()}


def _preload_clip_artifacts(fake_r2, media_bytes, generation_id: str) -> dict:
    artifacts = {}
    for n in (1, 2, 3):
        key = key_for("clip", generation_id=generation_id, shot=n)
        uri = fake_r2.put_bytes(key, media_bytes["clips"][n], "video/mp4")
        artifacts[f"shot{n}_video"] = {"uri": uri}
    voice_key = key_for("voice", generation_id=generation_id)
    voice_uri = fake_r2.put_bytes(voice_key, media_bytes["voice"], "audio/wav")
    artifacts["voice"] = {"uri": voice_uri}
    return artifacts


# ---------------------------------------------------------------------------
# compose: dry
# ---------------------------------------------------------------------------

async def test_compose_dry_returns_stub_with_no_pending_key(fake_r2, tmp_path):
    workers = _make_workers(fake_r2, tmp_path)

    result = await workers.compose(task=_Task("gen_dry"), artifacts={}, mode=RunMode())

    assert result == {"uri": "dry-run:compose"}
    assert "pending" not in result


# ---------------------------------------------------------------------------
# compose: live end-to-end with real ffmpeg
# ---------------------------------------------------------------------------

async def test_compose_live_end_to_end(fake_r2, tmp_path, media_bytes):
    generation_id = "gen_live_1"
    artifacts = _preload_clip_artifacts(fake_r2, media_bytes, generation_id)
    workers = _make_workers(fake_r2, tmp_path)

    result = await workers.compose(
        task=_Task(generation_id), artifacts=artifacts, mode=RunMode(live_video=True),
    )

    assert result["uri"].startswith("r2://")
    local_path = Path(result["localPath"])
    assert local_path.exists()
    thumb_path = Path(result["thumbnailLocalPath"])
    assert thumb_path.exists()
    assert thumb_path.stat().st_size > 0

    key = fake_r2.key_from_uri(result["uri"])
    assert key == key_for("final_video", generation_id=generation_id)
    assert fake_r2.get_bytes(key) == local_path.read_bytes()


# ---------------------------------------------------------------------------
# compose: mismatch guard (zip-truncation regression -- Task 22's review)
# ---------------------------------------------------------------------------

async def test_compose_mismatch_guard_raises_on_missing_clip(fake_r2, tmp_path, media_bytes):
    generation_id = "gen_live_2"
    artifacts = _preload_clip_artifacts(fake_r2, media_bytes, generation_id)
    del artifacts["shot3_video"]  # only 2 of the 3 required clip artifacts
    workers = _make_workers(fake_r2, tmp_path)

    with pytest.raises(ValueError):
        await workers.compose(
            task=_Task(generation_id), artifacts=artifacts, mode=RunMode(live_video=True),
        )


async def test_compose_mismatch_guard_never_touches_r2(fake_r2, tmp_path, media_bytes):
    """The guard must fire BEFORE any download/compose work -- pins that the
    ValueError is a real upfront guard, not an incidental KeyError/crash
    partway through."""
    generation_id = "gen_live_3"
    artifacts = _preload_clip_artifacts(fake_r2, media_bytes, generation_id)
    del artifacts["shot2_video"]
    workers = _make_workers(fake_r2, tmp_path)
    calls_before = len(fake_r2.put_calls)

    with pytest.raises(ValueError):
        await workers.compose(
            task=_Task(generation_id), artifacts=artifacts, mode=RunMode(live_video=True),
        )

    assert len(fake_r2.put_calls) == calls_before
    assert not (tmp_path / generation_id).exists()


# ---------------------------------------------------------------------------
# export: dry + live-ish (thumbnail)
# ---------------------------------------------------------------------------

class _FakeAssetManifestsRepo:
    def __init__(self) -> None:
        self.docs: dict[str, AssetManifest] = {}

    async def insert(self, obj: AssetManifest) -> None:
        self.docs[obj.id] = obj


class _FakeRepos:
    def __init__(self, asset_manifests: _FakeAssetManifestsRepo) -> None:
        self.asset_manifests = asset_manifests


_DRY_EXPORT_ARTIFACTS = {
    "portrait": {"uri": "dry-run:portrait"},
    "shot1_replace": {"uri": "dry-run:replaced1"},
    "shot2_replace": {"uri": "dry-run:replaced2"},
    "shot3_replace": {"uri": "dry-run:replaced3"},
    "shot1_video": {"uri": "dry-run:clip1"},
    "shot2_video": {"uri": "dry-run:clip2"},
    "shot3_video": {"uri": "dry-run:clip3"},
    "voice": {"uri": "dry-run:voice"},
    "compose": {"uri": "dry-run:compose"},
    "qa": {"qaReportId": "qa_xyz", "approved": True},
}


async def test_export_dry_inserts_and_returns_manifest(fake_r2, tmp_path):
    repo = _FakeAssetManifestsRepo()
    repos = _FakeRepos(repo)
    sheet = SimpleNamespace(id="character_1")
    product = SimpleNamespace(id="product_1")
    workers = _make_workers(fake_r2, tmp_path, repos=repos, sheet=sheet, product=product)

    result = await workers.export(
        task=_Task("gen_export_1"), artifacts=_DRY_EXPORT_ARTIFACTS, mode=RunMode(),
    )

    assert result["assetManifestId"] in repo.docs
    assert result["uri"] == "dry-run:compose"
    manifest = repo.docs[result["assetManifestId"]]
    assert manifest.source_references["characterSheetId"] == "character_1"
    assert manifest.source_references["shotSpecId"] == workers.shot_spec.id
    assert manifest.source_references["productId"] == "product_1"
    assert manifest.references["qaReportId"] == "qa_xyz"


async def test_export_threads_real_thumbnail_from_compose_artifacts(fake_r2, tmp_path):
    repo = _FakeAssetManifestsRepo()
    repos = _FakeRepos(repo)
    sheet = SimpleNamespace(id="character_1")
    product = SimpleNamespace(id="product_1")
    workers = _make_workers(fake_r2, tmp_path, repos=repos, sheet=sheet, product=product)

    thumb_path = tmp_path / "thumb.jpg"
    thumb_path.write_bytes(b"fake-jpeg-bytes")
    artifacts = dict(_DRY_EXPORT_ARTIFACTS)
    artifacts["compose"] = {"uri": "dry-run:compose", "thumbnailLocalPath": str(thumb_path)}

    result = await workers.export(task=_Task("gen_export_2"), artifacts=artifacts, mode=RunMode())

    manifest = repo.docs[result["assetManifestId"]]
    assert manifest.deliverables["thumbnail"].startswith("r2://")
