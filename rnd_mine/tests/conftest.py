# tests/conftest.py
"""Project-root pytest fixtures shared across the whole `creative_studio` suite.

`FakeR2` is a dict-backed double for `creative_studio.storage.r2.R2Store` -- no
boto3, no network, no real bucket. It exists here (rather than under
tests/generation/) so any later test package (portrait flow, replacement
pipeline, orchestrator, ...) can use the `fake_r2` fixture without importing
across test packages.
"""
from __future__ import annotations

import pytest


class FakeR2:
    """Duck-typed stand-in for `R2Store`: same public method names/signatures,
    a plain dict instead of a real bucket behind them."""

    bucket = "test-bucket"

    def __init__(self) -> None:
        self._objects: dict[str, bytes] = {}
        self.put_calls: list[tuple[str, str]] = []  # (key, content_type), in call order

    def put_bytes(self, key: str, data: bytes, content_type: str) -> str:
        self._objects[key] = data
        self.put_calls.append((key, content_type))
        return f"r2://{self.bucket}/{key}"

    def get_bytes(self, key: str) -> bytes:
        return self._objects[key]

    def exists(self, key: str) -> bool:
        return key in self._objects

    def presign(self, key: str, expires: int = 3600) -> str:
        return f"https://fake-presign/{key}"

    def key_from_uri(self, uri: str) -> str:
        prefix = f"r2://{self.bucket}/"
        if not uri.startswith(prefix):
            raise ValueError(f"key_from_uri: {uri!r} is not an r2://{self.bucket}/... uri")
        return uri[len(prefix):]


@pytest.fixture
def fake_r2() -> FakeR2:
    return FakeR2()
