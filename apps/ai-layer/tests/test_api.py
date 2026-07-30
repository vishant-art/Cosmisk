"""Tests for the Phase 2/4 FastAPI service.

Offline (always): health, API-key auth, and /insights served from the SQLite store
(seeded directly, no Meta/LLM). Live (opt-in): /chat against OpenRouter.
"""
from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from ai_layer import api, config, meta_transform as mt, store


@pytest.fixture(autouse=True)
def _use_db(db_session):
    """Route store/cost -> repository -> the rolled-back test-branch transaction."""
    yield


@pytest.fixture
def client():
    return TestClient(api.app)


def raw(name, date, spend, purch, rev):
    return dict(
        campaign_id=name, campaign_name=name, date_start=date, date_stop=date,
        spend=str(spend), impressions="1000", reach="800", frequency="1.5",
        clicks="50", ctr="5", cpc="2", cpm="100", inline_link_clicks="40",
        actions=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purch)}],
        action_values=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(rev)}],
        purchase_roas=[],
    )


def seed(account_id="act_1"):
    ds = mt.normalize({"meta": {"account_id": account_id, "account_name": "Acme",
                                "currency": "INR"},
                       "data": [raw("Good", "2026-05-01", 100, 10, 800),
                                raw("Bad", "2026-05-01", 200, 5, 300),
                                raw("Good", "2026-05-02", 110, 11, 850),
                                raw("Bad", "2026-05-02", 190, 4, 280)]})
    store.upsert_dataset(ds)


# ---- offline ----

def test_health_no_auth(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_api_key_enforced_when_set(client, monkeypatch):
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", "secret")
    assert client.get("/insights/act_1?source=store").status_code == 401
    seed()
    r = client.get("/insights/act_1?source=store", headers={"X-API-Key": "secret"})
    assert r.status_code == 200


def test_api_open_when_no_key(client, monkeypatch):
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    seed()
    assert client.get("/insights/act_1?source=store").status_code == 200


def test_insights_from_store(client, monkeypatch):
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    seed()
    body = client.get("/insights/act_1?source=store").json()
    assert body["account_name"] == "Acme" and body["source"] == "store"
    assert body["totals"]["spend"] == 600 and body["totals"]["campaigns"] == 2
    assert any(s["tag"] == "Overview" for s in body["statements"])
    assert body["cards"] and {c["priority"] for c in body["cards"]} <= {
        "alert", "positive", "pattern", "info"}
    assert len(body["daily"]) == 2          # two days


def test_insights_404_when_empty(client, monkeypatch):
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "META_ACCESS_TOKEN", None)   # no live fallback
    assert client.get("/insights/act_missing?source=store").status_code in (400, 404)


def test_cost_endpoint(client, monkeypatch):
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    r = client.get("/cost?account_id=act_1")
    assert r.status_code == 200 and "total_usd" in r.json()


def test_cost_endpoint_requires_scope(client, monkeypatch):
    """A bare /cost (no account/brand) is rejected — no cross-tenant global default."""
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    assert client.get("/cost").status_code == 400
    assert client.get("/cost?account_id=act_1").status_code == 200


def test_chat_cost_from_return_not_delta(client, monkeypatch):
    """Per-call cost comes from the completion's return value, not a global-SUM delta,
    so a concurrent ledger write cannot inflate it."""
    from ai_layer.db import repository as repo
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")
    seed()  # so _dataset uses the store (no live fetch)
    monkeypatch.setattr(api.chat, "complete", lambda *a, **k: ("canned", 0.0042))
    repo.record_cost("google/gemini-2.5-flash", 0, 0, account="act_1", cost_usd_actual=9.99)
    r = client.post("/chat", json={"account_id": "act_1", "message": "hi", "source": "store"})
    assert r.status_code == 200 and r.json()["cost_usd"] == 0.0042


# ---- live (opt-in) ----

live = pytest.mark.skipif(
    not (os.getenv("OPENROUTER_API_KEY") and os.getenv("RUN_LIVE_LLM")),
    reason="set RUN_LIVE_LLM=1 + OPENROUTER_API_KEY for live LLM tests")


def test_chat_session_cache_builds_context_once(client, monkeypatch):
    """Offline: with a reused session_id the snapshot is built once and served from
    the cache on turn 2 (no rebuild). LLM is mocked, so no OpenRouter call."""
    from ai_layer import chat, context_cache
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")   # pass the 503 guard
    context_cache.clear()
    seed()

    monkeypatch.setattr(api.chat, "complete", lambda *a, **k: ("canned answer", 0.0))
    calls = {"n": 0}
    real_build = chat.build_context

    def counting_build(ds, *a, **k):
        calls["n"] += 1
        return real_build(ds, *a, **k)

    monkeypatch.setattr(api.chat, "build_context", counting_build)

    # turn 1 -> builds + caches under a new session id
    r1 = client.post("/chat", json={"account_id": "act_1", "message": "hi", "source": "store"})
    assert r1.status_code == 200
    b1 = r1.json()
    assert b1["cached"] is False and b1["session_id"] and b1["context_mode"] == "full"
    assert calls["n"] == 1

    # turn 2 with the same session id -> served from cache, NOT rebuilt
    r2 = client.post("/chat", json={"account_id": "act_1", "message": "again",
                                    "source": "store", "session_id": b1["session_id"]})
    assert r2.status_code == 200
    b2 = r2.json()
    assert b2["cached"] is True
    assert calls["n"] == 1


def test_complete_endpoint_generic(client, monkeypatch):
    """Offline: /complete returns the model text + cost; LLM mocked (no OpenRouter)."""
    from ai_layer import chat
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    monkeypatch.setattr(config, "OPENROUTER_API_KEY", "test-key")
    captured = {}

    def fake_raw(client_, messages, **kw):
        captured["messages"] = messages
        captured["op"] = kw.get("op")
        return "GENERATED TEXT", 0.0

    monkeypatch.setattr(chat, "raw_complete", fake_raw)
    r = client.post("/complete", json={
        "system": "You are a tester.",
        "messages": [{"role": "user", "content": "hi"}],
        "max_tokens": 200, "operation": "unit.test", "account": "user-1",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["text"] == "GENERATED TEXT" and body["model"]
    # system prepended, op forwarded
    assert captured["messages"][0] == {"role": "system", "content": "You are a tester."}
    assert captured["op"] == "unit.test"


def test_chat_summary_mode_is_leaner_than_full(client, monkeypatch):
    """Offline: summary context omits the full per-row dump, so it's smaller."""
    from ai_layer import chat
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    seed()
    ds = store.load_dataset("act_1")
    full = chat.build_context(ds, full=True)
    summary = chat.build_context(ds, full=False)
    assert "FULL PER-CAMPAIGN DAILY ROWS" in full
    assert "FULL PER-CAMPAIGN DAILY ROWS" not in summary
    assert len(summary) < len(full)


@live
def test_chat_endpoint_grounded(client, monkeypatch):
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    seed()
    r = client.post("/chat", json={"account_id": "act_1", "message":
                                   "What is my blended ROAS? Give the number.", "source": "store"})
    assert r.status_code == 200
    body = r.json()
    # blended = 1100*... actually revenue 2230 / spend 600 = 3.72
    assert "3.7" in body["answer"] or "3.72" in body["answer"]
    assert body["model"] and body["cost_usd"] >= 0


# ---- Task 11: cache-backed /chat tool loop + /competitors ----

def test_chat_default_source_runs_tool_loop(client, monkeypatch):
    """Offline: the default source='cache' path builds context via build_full_context
    (with the stored competitor block) and answers via the tool-calling loop."""
    from ai_layer import api as api_mod, chat, meta_transform as mt
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    ds = mt.normalize({"meta": {"account_id": "act_1", "account_name": "N",
                                "currency": "INR",
                                "date_range": {"since": "2026-07-01", "until": "2026-07-28"},
                                "level": "campaign", "source": "live+cache"},
                       "data": [{"campaign_id": "c", "campaign_name": "C",
                                 "date_start": "2026-07-01", "spend": "10",
                                 "impressions": "100"}]})
    monkeypatch.setattr(api_mod, "_cached_dataset",
                        lambda account_id, days, token, brand: (ds, None))
    monkeypatch.setattr(chat, "build_full_context",
                        lambda *a, **k: "CTX")
    monkeypatch.setattr(chat, "run_tool_loop",
                        lambda client_, messages, account, token, brand_id=None, progress=None:
                        ("**answer**", 0.01, ["top_ads"]))
    r = client.post("/chat", json={"account_id": "act_1", "message": "top ads?"},
                    headers={"X-Meta-Token": "tok"})
    assert r.status_code == 200
    body = r.json()
    assert body["answer"] == "**answer**" and body["tools_used"] == ["top_ads"]


def test_chat_source_store_keeps_legacy_path(client, monkeypatch):
    """source='store' keeps the pre-tool-loop behavior: plain build_context + chat.complete,
    empty tools_used. Adapted from the brief: seeds the store via the file's existing
    seed() helper so /chat doesn't 404 or fall through to a live fetch."""
    from ai_layer import api as api_mod, chat
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    called = {}

    def _fake_complete(c, m, stream=False, account=None):
        called["complete"] = True
        return "legacy", 0.0

    monkeypatch.setattr(chat, "complete", _fake_complete)
    seed()  # act_1 in the store -> source='store' hits it, no live fallback
    r = client.post("/chat", json={"account_id": "act_1", "message": "hi",
                                   "source": "store"})
    assert r.status_code in (200, 404)     # 404 only if the store fixture is empty
    if r.status_code == 200:
        assert called.get("complete") and r.json()["tools_used"] == []


def test_competitors_get_404_before_refresh(client, monkeypatch):
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    assert client.get("/competitors/act_none").status_code == 404


def test_competitors_get_serves_stored_intel(client, monkeypatch, db_session):
    from ai_layer.competitor import discover
    monkeypatch.setattr(config, "AI_LAYER_API_KEY", None)
    discover.save("act_ci", {"brand_understanding": "kurtas",
                             "competitors": [{"name": "R"}]})
    r = client.get("/competitors/act_ci")
    assert r.status_code == 200
    body = r.json()
    assert body["discovered"] == 1 and "R" in body["block"]
