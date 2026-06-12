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
def temp_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "STORE_DB_PATH", tmp_path / "store.sqlite")
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


# ---- live (opt-in) ----

live = pytest.mark.skipif(
    not (os.getenv("OPENROUTER_API_KEY") and os.getenv("RUN_LIVE_LLM")),
    reason="set RUN_LIVE_LLM=1 + OPENROUTER_API_KEY for live LLM tests")


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
