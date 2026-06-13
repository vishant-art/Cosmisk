"""Tests for the session context cache (context_cache.py).

Pure + offline: no Meta, no LLM. Verifies build-once-reuse semantics, mode/account
isolation, TTL expiry, and the eviction bound.
"""
from __future__ import annotations

import time

import pytest

from ai_layer import context_cache as cc


@pytest.fixture(autouse=True)
def clean_cache():
    cc.clear()
    yield
    cc.clear()


def test_new_session_id_is_unique():
    a, b = cc.new_session_id(), cc.new_session_id()
    assert a and b and a != b


def test_put_then_get_round_trips():
    cc.put("s1", "act_1", "full", "SNAPSHOT")
    assert cc.get("s1", "act_1", "full") == "SNAPSHOT"


def test_miss_without_session_id():
    assert cc.get(None, "act_1", "full") is None
    assert cc.get("", "act_1", "full") is None


def test_miss_on_unknown_session():
    assert cc.get("nope", "act_1", "full") is None


def test_account_mismatch_forces_rebuild():
    cc.put("s1", "act_1", "full", "SNAP")
    assert cc.get("s1", "act_2", "full") is None   # different account -> rebuild


def test_mode_mismatch_forces_rebuild():
    cc.put("s1", "act_1", "full", "SNAP")
    assert cc.get("s1", "act_1", "summary") is None  # mode switched -> rebuild


def test_ttl_expiry(monkeypatch):
    cc.put("s1", "act_1", "full", "SNAP")
    # capture the real clock BEFORE patching, else the lambda recurses into itself
    base = time.time()
    monkeypatch.setattr(cc.time, "time", lambda: base + cc.TTL_SECONDS + 1)
    assert cc.get("s1", "act_1", "full") is None


def test_eviction_bound(monkeypatch):
    monkeypatch.setattr(cc, "MAX_ENTRIES", 3)
    for i in range(5):
        cc.put(f"s{i}", "act_1", "full", f"v{i}")
    # never exceeds the bound
    assert len(cc._cache) <= 3
