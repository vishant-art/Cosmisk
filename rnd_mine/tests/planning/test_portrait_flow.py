# tests/planning/test_portrait_flow.py
"""Unit tests for Task 18: portrait flow wiring (`finalize_character`).

`_FakeAdapter` stands in for `FalAdapter`: records every `(model_id,
arguments)` submit call and every download url, and returns one canned
fal-image-shaped result. Paired with the shared `FakeR2` from the
project-root conftest. No `fal_client`, no `httpx`, no `boto3`, no network --
these tests can never spend money.
"""
from __future__ import annotations

from creative_studio.contracts import CharacterSheet, new_id
from creative_studio.generation.builders import build_portrait_prompt
from creative_studio.planning.character_generator import finalize_character


def _draft_sheet(**over) -> CharacterSheet:
    data = dict(
        id=new_id("character"),
        creative_spec_id=new_id("creative"),
        status="draft",
        source="planner",
        identity={"gender": "Female", "approximateAge": 27, "ethnicity": "South Asian"},
        appearance={"hair": {"color": "Black", "length": "Long"}, "skinTone": "Warm tan"},
        wardrobe={},
        personality={"traits": ["Confident"]},
        expressions={},
        speaking_style={"tone": "Friendly"},
        reference_assets={},
        conditioning={},
        references={"creativeSpecId": "creative_1"},
    )
    data.update(over)
    return CharacterSheet(**data)


class _FakeAdapter:
    """Records every `(model_id, arguments)` submit call and every download
    url; returns one canned fal-image-shaped result for every submit call."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict]] = []
        self.download_urls: list[str] = []

    async def submit(self, model_id: str, arguments: dict) -> dict:
        self.calls.append((model_id, arguments))
        return {"images": [{"url": "https://cdn.fake/portrait.png"}]}

    async def download(self, url: str) -> bytes:
        self.download_urls.append(url)
        return b"png-bytes"


# ---------------------------------------------------------------------------
# Dry path: no adapter/r2 calls, placeholder r2Uri, original sheet untouched.
# ---------------------------------------------------------------------------

async def test_dry_finalize(fake_r2):
    sheet = _draft_sheet()
    adapter = _FakeAdapter()

    finalized = await finalize_character(sheet, adapter, fake_r2, generation_id="gen1", live=False)

    assert finalized.status == "completed"
    assert finalized.reference_assets["primaryPortrait"] == {
        "r2Uri": "dry-run:portrait",
        "isPrimary": True,
    }
    assert adapter.calls == []
    assert adapter.download_urls == []
    assert fake_r2.put_calls == []

    # The input sheet must never be mutated.
    assert sheet.status == "draft"
    assert "primaryPortrait" not in sheet.reference_assets


# ---------------------------------------------------------------------------
# Live path: real prompt/key wiring through generate_image, square portrait.
# ---------------------------------------------------------------------------

async def test_live_finalize(fake_r2):
    sheet = _draft_sheet()
    adapter = _FakeAdapter()

    finalized = await finalize_character(sheet, adapter, fake_r2, generation_id="gen1", live=True)

    assert finalized.status == "completed"
    portrait = finalized.reference_assets["primaryPortrait"]
    assert portrait["r2Uri"] == "r2://test-bucket/creative-studio/runs/gen1/portraits/primary.png"
    assert portrait["isPrimary"] is True
    assert portrait["resolution"] == "1024x1024"
    assert portrait["assetId"]

    assert len(adapter.calls) == 1
    model_id, arguments = adapter.calls[0]
    assert arguments["prompt"] == build_portrait_prompt(sheet)
    assert arguments["image_size"] == {"width": 1024, "height": 1024}
    assert portrait["model"] == model_id

    assert adapter.download_urls == ["https://cdn.fake/portrait.png"]
    assert fake_r2.put_calls == [
        ("creative-studio/runs/gen1/portraits/primary.png", "image/png"),
    ]

    # The input sheet must never be mutated.
    assert sheet.status == "draft"
    assert "primaryPortrait" not in sheet.reference_assets


# ---------------------------------------------------------------------------
# The returned sheet must independently re-validate (model_copy alone does
# not re-run validators -- finalize_character must revalidate explicitly).
# ---------------------------------------------------------------------------

async def test_finalized_sheet_revalidates(fake_r2):
    sheet = _draft_sheet()
    adapter = _FakeAdapter()

    finalized = await finalize_character(sheet, adapter, fake_r2, generation_id="gen1", live=True)

    revalidated = CharacterSheet.model_validate(finalized.to_doc())
    assert revalidated.status == "completed"
    assert revalidated.reference_assets["primaryPortrait"]["r2Uri"] == finalized.reference_assets["primaryPortrait"]["r2Uri"]
