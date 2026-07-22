# tests/generation/test_adapter_base.py
"""Unit tests for the fal adapter base (model IDs, duration snapping, submit/
download) and the admin-key balance reader.

`FalAdapter.submit` is exercised by monkeypatching `fal_client.subscribe_async`
directly (no network). `FalAdapter.download` is exercised through
`httpx.MockTransport` (no network). `read_balance` is exercised by
monkeypatching `httpx.get` (no network) -- the one live call this task permits
is a separate, manual one-off script, never part of the pytest suite.
"""
from __future__ import annotations

import logging
import os

import httpx
import pytest

from creative_studio.generation.adapters.base import (
    ALLOWED_VIDEO_DURATIONS,
    MODEL_IDS,
    FalAdapter,
    FalAdapterError,
    video_duration_for,
)
from creative_studio.generation.adapters.balance import read_balance


class _FakeSettings:
    """Minimal duck-typed settings double -- only the attributes these
    adapters read."""

    def __init__(self, fal_key: str = "fal-test-key-123", fal_admin_key: str = "") -> None:
        self.fal_key = fal_key
        self.fal_admin_key = fal_admin_key


@pytest.fixture(autouse=True)
def _isolate_fal_key_env(monkeypatch):
    """`FalAdapter.__init__` writes FAL_KEY into the real environment by
    design (the one place render credentials are wired). Keep that side
    effect confined to each test rather than leaking into the rest of the
    suite / the real environment."""
    monkeypatch.delenv("FAL_KEY", raising=False)
    yield


# ---------------------------------------------------------------------------
# video_duration_for
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "shot_seconds,expected",
    [
        (3, 4),
        (4, 4),
        (4.5, 5),
        (7, 8),
        (15, 15),
        (0, 4),
    ],
)
def test_video_duration_for_snaps_to_smallest_allowed(shot_seconds, expected):
    assert video_duration_for(shot_seconds) == expected


def test_video_duration_for_over_max_raises_value_error():
    with pytest.raises(ValueError):
        video_duration_for(16)


# ---------------------------------------------------------------------------
# MODEL_IDS / ALLOWED_VIDEO_DURATIONS
# ---------------------------------------------------------------------------

def test_model_ids_exact():
    assert MODEL_IDS == {
        "image": "fal-ai/flux-2-flex",
        "image_fallback": "fal-ai/flux-2-pro",
        "cutout": "fal-ai/birefnet/v2",
        "placement": "fal-ai/bria/product-shot",
        "video_i2v": "bytedance/seedance-2.0/image-to-video",
        "tts": "fal-ai/minimax/speech-02-hd",
    }


def test_allowed_video_durations_exact():
    assert ALLOWED_VIDEO_DURATIONS == (4, 5, 6, 8, 10, 12, 15)


# ---------------------------------------------------------------------------
# FalAdapter construction: the one seam that wires FAL_KEY into the env
# ---------------------------------------------------------------------------

def test_construction_sets_fal_key_env_from_settings():
    settings = _FakeSettings(fal_key="fal-test-key-123")

    FalAdapter(settings)

    assert os.environ["FAL_KEY"] == "fal-test-key-123"


def test_construction_never_touches_admin_key():
    settings = _FakeSettings(fal_key="fal-test-key-123", fal_admin_key="admin-secret-should-not-leak")

    FalAdapter(settings)

    assert os.environ["FAL_KEY"] == "fal-test-key-123"
    assert os.environ.get("FAL_KEY") != "admin-secret-should-not-leak"


# ---------------------------------------------------------------------------
# FalAdapter.submit
# ---------------------------------------------------------------------------

async def test_submit_passes_arguments_through_verbatim_and_returns_result(monkeypatch):
    import fal_client

    calls: list[tuple[str, dict]] = []

    async def fake_subscribe_async(model_id, arguments=None, **kwargs):
        calls.append((model_id, arguments))
        return {"ok": True}

    monkeypatch.setattr(fal_client, "subscribe_async", fake_subscribe_async)

    adapter = FalAdapter(_FakeSettings())
    result = await adapter.submit("fal-ai/flux-2-flex", {"prompt": "a cat", "seed": 7})

    assert result == {"ok": True}
    assert calls == [("fal-ai/flux-2-flex", {"prompt": "a cat", "seed": 7})]


# ---------------------------------------------------------------------------
# FalAdapter.download
# ---------------------------------------------------------------------------

async def test_download_200_returns_bytes():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"file-bytes-here")

    adapter = FalAdapter(_FakeSettings(), transport=httpx.MockTransport(handler))

    data = await adapter.download("https://fal.media/files/abc/output.png")

    assert data == b"file-bytes-here"


async def test_download_404_raises_fal_adapter_error_without_query_string():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, text="not found")

    adapter = FalAdapter(_FakeSettings(), transport=httpx.MockTransport(handler))

    with pytest.raises(FalAdapterError) as exc_info:
        await adapter.download("https://fal.media/files/abc/output.png?token=SECRET123")

    message = str(exc_info.value)
    assert "404" in message
    assert "token" not in message
    assert "SECRET123" not in message


# ---------------------------------------------------------------------------
# read_balance
# ---------------------------------------------------------------------------

def test_read_balance_no_admin_key_returns_none_without_network(monkeypatch):
    def boom(*args, **kwargs):
        raise AssertionError("read_balance must not make a network call when fal_admin_key is empty")

    monkeypatch.setattr(httpx, "get", boom)

    assert read_balance(_FakeSettings(fal_admin_key="")) is None


def test_read_balance_parses_float_from_success(monkeypatch):
    def fake_get(url, *, headers=None, params=None, timeout=None):
        assert headers["Authorization"] == "Key admin-key-abc"
        assert params == {"expand": "credits"}
        assert "billing" in url
        return httpx.Response(200, json={"credits": {"current_balance": 256.78, "currency": "usd"}})

    monkeypatch.setattr(httpx, "get", fake_get)

    result = read_balance(_FakeSettings(fal_admin_key="admin-key-abc"))

    assert result == 256.78


def test_read_balance_connect_error_returns_none_and_warns(monkeypatch, caplog):
    def fake_get(*args, **kwargs):
        raise httpx.ConnectError("connection refused")

    monkeypatch.setattr(httpx, "get", fake_get)

    with caplog.at_level(logging.WARNING, logger="creative_studio.generation"):
        result = read_balance(_FakeSettings(fal_admin_key="admin-key-abc"))

    assert result is None
    assert any(record.levelno == logging.WARNING for record in caplog.records)


def test_read_balance_malformed_200_body_returns_none(monkeypatch, caplog):
    def fake_get(url, *, headers=None, params=None, timeout=None):
        return httpx.Response(200, json=[])

    monkeypatch.setattr(httpx, "get", fake_get)

    with caplog.at_level(logging.WARNING, logger="creative_studio.generation"):
        result = read_balance(_FakeSettings(fal_admin_key="admin-key-abc"))

    assert result is None
    assert any(record.levelno == logging.WARNING for record in caplog.records)
