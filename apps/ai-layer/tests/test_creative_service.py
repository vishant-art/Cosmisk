"""Creative Studio HTTP surface: generate -> poll -> results. pipeline.run is
monkeypatched so the endpoint is exercised offline (no fal/LLM/Meta calls)."""
from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from ai_layer import config as ai_config
from ai_layer.api import app
from ai_layer.creative import service
from ai_layer.creative.schemas import CompositedAd, CopySet, RunManifest

client = TestClient(app)


@pytest.fixture(autouse=True)
def _open_api_key(monkeypatch):
    # run the API-key gate in open/local-dev mode (no key required)
    monkeypatch.setattr(ai_config, "AI_LAYER_API_KEY", None)


def _fake_manifest(run_id):
    ad = CompositedAd(path=f"{run_id}/ad_01_1x1.png", fmt="1:1", width=1080, height=1080,
                      background_path="bg.png", concept_title="Timeless Drape",
                      ad_copy=CopySet(headline="Legacy Woven", cta_label="Shop now", angle="hero"))
    return RunManifest(run_id=run_id, account_name="Test", select_strategy="top-roas",
                       mode="auto", status="complete", brand_kit=None, ads=[ad],
                       rejected=[], total_cost_usd=0.42)


def test_generate_then_poll(monkeypatch):
    monkeypatch.setattr(service.pipeline, "run", lambda **kw: _fake_manifest(kw["run_id"]))

    r = client.post("/creative/generate", json={"images": 1, "formats": ["1:1"]})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    assert r.json()["status"] == "queued"

    status = {}
    for _ in range(40):
        status = client.get(f"/creative/jobs/{job_id}").json()
        if status["status"] in ("complete", "failed"):
            break
        time.sleep(0.05)

    assert status["status"] == "complete", status
    assert len(status["assets"]) == 1
    a = status["assets"][0]
    assert a["fmt"] == "1:1"
    assert a["url"] == f"/creative/assets/{job_id}/ad_01_1x1.png"
    assert a["copy"]["headline"] == "Legacy Woven"
    assert status["cost_usd"] == 0.42
    assert status["video"] is None


def test_unknown_job_404():
    assert client.get("/creative/jobs/does-not-exist").status_code == 404


def test_brief_mode_builds_summary(monkeypatch):
    captured = {}

    def fake_run(**kw):
        captured.update(kw)
        return _fake_manifest(kw["run_id"])

    monkeypatch.setattr(service.pipeline, "run", fake_run)
    brief = {"brand_name": "Pratap Sons", "product_name": "Silk Saree",
             "product_description": "Handwoven heritage silk", "target_audience": "brides",
             "key_features": ["pure silk", "zari work"], "price": "Rs 12000"}
    job_id = client.post("/creative/generate",
                         json={"brief": brief, "images": 1, "formats": ["1:1"]}).json()["job_id"]
    for _ in range(40):
        if client.get(f"/creative/jobs/{job_id}").json()["status"] in ("complete", "failed"):
            break
        time.sleep(0.05)
    # brief mode -> summary built from the brief, no campaign data_path
    assert captured["summary"] is not None
    assert "Pratap Sons" in captured["summary"] and "zari work" in captured["summary"]
    assert captured["account_name"] == "Pratap Sons"
    assert captured["data_path"] is None


def test_failure_is_surfaced_not_crashed(monkeypatch):
    def boom(**kw):
        raise RuntimeError("fal exploded")
    monkeypatch.setattr(service.pipeline, "run", boom)

    job_id = client.post("/creative/generate", json={"images": 1}).json()["job_id"]
    status = {}
    for _ in range(40):
        status = client.get(f"/creative/jobs/{job_id}").json()
        if status["status"] in ("complete", "failed"):
            break
        time.sleep(0.05)
    assert status["status"] == "failed"
    assert "fal exploded" in status["error"]
