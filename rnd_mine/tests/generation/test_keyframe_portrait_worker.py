# tests/generation/test_keyframe_portrait_worker.py
"""Final-review Fix 4: `RealWorkers.keyframe` must be able to condition a
live keyframe on the just-completed portrait step's OWN persisted artifacts
(threaded in by the orchestrator on every shot-chain call, not just the
first) -- not only on `self.sheet.reference_assets`, which only gains the
generated portrait when THIS worker instance's own `portrait()` call ran
this same run (it mutates `self.sheet` in place; see `RealWorkers.portrait`).

On a live resume, the portrait step is already `done`/`skipped` from an
earlier run, so a fresh `RealWorkers` instance's `self.sheet` is still the
portrait-less planning sheet -- without the portrait artifacts threaded in,
every remaining live keyframe would render with no reference image at all.

Drives `RealWorkers.keyframe` directly (no Orchestrator) against a fake fal
adapter (records every `(model_id, arguments)` submit call, mirroring
`tests/generation/test_fal_adapters.py::FakeFalAdapter`) and the shared
`FakeR2` double -- no network, no paid call.
"""
from __future__ import annotations

from creative_studio.contracts import CharacterSheet, CreativeSpec, Product, Shot, ShotSpec, Timing, new_id
from creative_studio.generation.workers import RealWorkers
from creative_studio.orchestration.orchestrator import RunMode, Services


class _FakeAdapter:
    """Minimal stand-in for `FalAdapter`: records every `(model_id,
    arguments)` submit call, returns one canned image result."""

    def __init__(self, result: dict) -> None:
        self.result = result
        self.calls: list[tuple[str, dict]] = []

    async def submit(self, model_id: str, arguments: dict) -> dict:
        self.calls.append((model_id, arguments))
        return self.result

    async def download(self, url: str) -> bytes:
        return b"fake-image-bytes"


class _Task:
    def __init__(self, generation_id: str, asset_references: dict | None = None) -> None:
        self.context = {"generationId": generation_id}
        self.asset_references = asset_references or {}


def _make_spec() -> CreativeSpec:
    return CreativeSpec(
        id=new_id("creative"),
        generation_context={"creativePreference": "Luxury UGC", "language": "English"},
        product={"productId": "product_1"},
        creative_direction={"style": "Luxury UGC"},
        messaging={"cta": "Shop Now"},
    )


def _make_sheet_without_portrait() -> CharacterSheet:
    """A fresh planning sheet with NO `reference_assets.primaryPortrait` --
    mirrors exactly what a live resume's freshly-constructed `RealWorkers`
    sees: the portrait step already `done`, but this worker instance's own
    `portrait()` never ran to mutate `self.sheet` in place."""
    return CharacterSheet(
        id=new_id("character"),
        creative_spec_id="creative_1",
        identity={"gender": "Female", "approximateAge": 27},
        appearance={"hair": {"color": "Dark Brown", "length": "Shoulder Length"}},
        wardrobe={},
        personality={"tone": "Warm"},
        expressions={},
        speaking_style={"pace": "Measured"},
        reference_assets={},
        conditioning={},
        references={},
    )


def _shot(n: int, purpose: str, dur: float, text: str) -> Shot:
    return Shot(
        shot_number=n, purpose=purpose, duration=dur,
        narrative={"summary": "s"}, camera={"shotType": "Medium"},
        character={"expression": "Smile"}, product={"visibility": "High"},
        dialogue={"spokenText": text},
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


def _make_product() -> Product:
    return Product(
        id="product_1",
        shopify={},
        commercial={"title": "Test Blazer", "price": "199.00", "currency": "USD"},
        variants=[],
        collections=[],
        original_assets={"images": [{"r2Uri": "r2://test-bucket/products/product_1/original.jpg"}]},
        derived_assets={},
        placement_assets={},
        ai_metadata={"category": "blazer"},
        provider_metadata={},
    )


def _make_workers(fake_r2, adapter, sheet) -> RealWorkers:
    services = Services(adapter=adapter, r2=fake_r2, repos=None, run_store=None, settings=None)
    return RealWorkers(
        services=services, spec=_make_spec(), sheet=sheet,
        shot_spec=_make_shot_spec(), product=_make_product(),
    )


async def test_keyframe_live_uses_portrait_artifacts_uri_when_sheet_has_no_portrait(fake_r2):
    """The scenario Fix 4 closes: a fresh, portrait-less sheet (as a live
    resume's `RealWorkers` would carry) PLUS the portrait step's own
    persisted artifacts carrying a real `r2://` uri -- `generate_image` must
    still receive a presigned reference image url built from THAT uri."""
    adapter = _FakeAdapter({
        "images": [{"url": "https://fal.media/files/x/kf.png", "content_type": "image/png"}],
    })
    sheet = _make_sheet_without_portrait()
    workers = _make_workers(fake_r2, adapter, sheet)

    portrait_uri = f"r2://{fake_r2.bucket}/runs/g1/portraits/primary.png"
    portrait_artifacts = {"uri": portrait_uri}
    task = _Task("g1")

    result = await workers.keyframe(task, 1, portrait_artifacts, RunMode(live_images=True))

    assert result["uri"].startswith("r2://")
    _, arguments = adapter.calls[0]
    assert arguments["image_urls"] == ["https://fake-presign/runs/g1/portraits/primary.png"]


async def test_keyframe_live_falls_back_to_sheet_portrait_when_artifacts_are_dry(fake_r2):
    """A dry-run portrait stub (`{"uri": "dry-run:portrait"}`) must NOT be
    presigned -- the priority chain falls through to the sheet's own
    portrait when that IS a real uri (set by this same worker instance's
    `portrait()` call earlier this run)."""
    adapter = _FakeAdapter({"images": [{"url": "https://fal.media/files/x/kf.png"}]})
    sheet = _make_sheet_without_portrait()
    sheet.reference_assets = {
        "primaryPortrait": {"r2Uri": f"r2://{fake_r2.bucket}/runs/g1/portraits/sheet.png"}
    }
    workers = _make_workers(fake_r2, adapter, sheet)
    task = _Task("g1")

    result = await workers.keyframe(task, 1, {"uri": "dry-run:portrait"}, RunMode(live_images=True))

    assert result["uri"].startswith("r2://")
    _, arguments = adapter.calls[0]
    assert arguments["image_urls"] == ["https://fake-presign/runs/g1/portraits/sheet.png"]


async def test_keyframe_live_falls_back_to_task_asset_references_when_all_else_dry(fake_r2):
    """Final fallback: neither the portrait artifacts nor the sheet carry a
    real portrait uri -- the task's own compiled `asset_references` (the
    lineage-resolved fallback) is used instead."""
    adapter = _FakeAdapter({"images": [{"url": "https://fal.media/files/x/kf.png"}]})
    sheet = _make_sheet_without_portrait()
    workers = _make_workers(fake_r2, adapter, sheet)
    task = _Task(
        "g1",
        asset_references={"characterPortrait": f"r2://{fake_r2.bucket}/runs/g1/portraits/lineage.png"},
    )

    result = await workers.keyframe(task, 1, {"uri": "dry-run:portrait"}, RunMode(live_images=True))

    assert result["uri"].startswith("r2://")
    _, arguments = adapter.calls[0]
    assert arguments["image_urls"] == ["https://fake-presign/runs/g1/portraits/lineage.png"]


async def test_keyframe_dry_never_calls_adapter(fake_r2):
    adapter = _FakeAdapter({"images": [{"url": "https://fal.media/files/x/kf.png"}]})
    sheet = _make_sheet_without_portrait()
    workers = _make_workers(fake_r2, adapter, sheet)
    task = _Task("g1")

    result = await workers.keyframe(task, 1, {"uri": "r2://bucket/portrait.png"}, RunMode())

    assert result["uri"] == "dry-run:keyframe1"
    assert adapter.calls == []
