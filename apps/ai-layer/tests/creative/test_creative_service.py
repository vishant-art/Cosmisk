"""Creative Studio HTTP surface: static generate -> poll, and the UGC video plan/render
split. The pipeline is monkeypatched throughout, so every endpoint is exercised offline
(no fal, no LLM, no Meta, no spend).

Lives under tests/creative/ so it inherits that conftest's hermetic fixtures (no DB, no
live billing, no live Shopify/Meta).
"""
from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from ai_layer import config as ai_config
from ai_layer.api import app
from ai_layer.creative import config, fal_billing, service
from ai_layer.creative.schemas import (CompositedAd, CopySet, RunManifest, QACheck, QAReport,
                                       Script, ScriptBeat, Shot, Storyboard)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _open_api_key(monkeypatch):
    # run the API-key gate in open/local-dev mode (no key required)
    monkeypatch.setattr(ai_config, "AI_LAYER_API_KEY", None)


def _poll(job_id, tries=40):
    status = {}
    for _ in range(tries):
        status = client.get(f"/creative/jobs/{job_id}").json()
        if status["status"] in ("complete", "failed"):
            break
        time.sleep(0.05)
    return status


def _fake_manifest(run_id):
    ad = CompositedAd(path=f"{run_id}/ad_01_1x1.png", fmt="1:1", width=1080, height=1080,
                      background_path="bg.png", concept_title="Timeless Drape",
                      ad_copy=CopySet(headline="Legacy Woven", cta_label="Shop now", angle="hero"))
    return RunManifest(run_id=run_id, account_name="Test", select_strategy="top-roas",
                       mode="auto", status="complete", brand_kit=None, ads=[ad],
                       rejected=[], total_cost_usd=0.42)


def _board():
    return Storyboard(shots=[
        Shot(purpose="hook", duration_s=4, camera="selfie", subject="woman", product_visible="absent"),
        Shot(purpose="cta", duration_s=4, camera="selfie", subject="product", product_visible="hero"),
    ], target_seconds=8)


def _script():
    return Script(beats=[ScriptBeat(purpose="hook", text="I thought it was a scam."),
                         ScriptBeat(purpose="cta", text="Shop the new collection.")])


# --- static ads ----------------------------------------------------------------

def test_generate_then_poll(monkeypatch):
    monkeypatch.setattr(service.pipeline, "run", lambda **kw: _fake_manifest(kw["run_id"]))

    r = client.post("/creative/generate", json={"images": 1, "formats": ["1:1"]})
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    assert r.json()["status"] == "queued"

    status = _poll(job_id)
    assert status["status"] == "complete", status
    assert len(status["assets"]) == 1
    a = status["assets"][0]
    assert a["fmt"] == "1:1"
    assert a["url"] == f"/creative/assets/{job_id}/ad_01_1x1.png"
    assert a["copy"]["headline"] == "Legacy Woven"
    assert status["cost_usd"] == 0.42
    assert status["video"] is None            # the paid video path is /creative/video/*


def test_unknown_job_404():
    assert client.get("/creative/jobs/does-not-exist").status_code == 404


def test_grounding_is_on_by_default(monkeypatch):
    """Every grounding source defaults ON: Meta cohort (both tails), the VLM critic, and
    Shopify product sourcing. And no logo is ever generated (lemon's standing rule)."""
    captured = {}

    def fake_run(**kw):
        captured.update(kw)
        return _fake_manifest(kw["run_id"])

    monkeypatch.setattr(service.pipeline, "run", fake_run)
    job_id = client.post("/creative/generate", json={"images": 1}).json()["job_id"]
    _poll(job_id)

    assert captured["ground_from_meta"] is True
    assert captured["use_shopify"] is True
    assert captured["run_vlm"] is True
    assert captured["no_logo"] is True
    assert captured["bottom_creatives"] == 5      # losers pulled too, not winners-only


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
    _poll(job_id)
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
    status = _poll(job_id)
    assert status["status"] == "failed"
    assert "fal exploded" in status["error"]


# --- UGC video: plan ($0) -------------------------------------------------------

def test_video_plan_quotes_the_render_before_spending(monkeypatch, tmp_path):
    """The whole point of the split: plan is free and tells you what the render WOULD cost."""
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "j1"
    run.mkdir()
    (run / "brand_kit.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr(service.pipeline, "plan_story",
                        lambda **kw: (_script(), _board()))
    monkeypatch.setattr(fal_billing, "affordable",
                        lambda n, **kw: {"enabled": True, "ok": True, "balance": 50.0,
                                         "needed": 2.74, "shortfall": 0.0})

    r = client.post("/creative/video/plan", json={"job_id": "j1", "seconds": 8})
    assert r.status_code == 200
    body = r.json()
    assert body["shots"] == 2 and body["duration_s"] == 8.0
    q = body["quote"]
    assert q["clips"] == 2
    assert q["estimated_usd"] == pytest.approx(2 * fal_billing.SEEDANCE_CLIP_USD, rel=1e-3)
    assert q["affordable"] is True
    assert body["storyboard"]["shots"][0]["purpose"] == "hook"


def test_video_plan_409_without_a_run(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    r = client.post("/creative/video/plan", json={"job_id": "nope"})
    assert r.status_code == 409
    assert "brand kit" in r.json()["detail"]


# --- UGC video: generate (paid) -------------------------------------------------

def test_video_generate_409_without_a_storyboard(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    (tmp_path / "j2").mkdir()
    r = client.post("/creative/video/generate", json={"job_id": "j2"})
    assert r.status_code == 409
    assert "storyboard" in r.json()["detail"]


def test_video_generate_402_when_the_balance_cannot_cover_it(monkeypatch, tmp_path):
    """Refuse rather than half-render: the clips it did render are already paid for."""
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "j3"
    run.mkdir()
    (run / "storyboard.json").write_text(_board().model_dump_json(), encoding="utf-8")
    monkeypatch.setattr(fal_billing, "affordable",
                        lambda n, **kw: {"enabled": True, "ok": False, "balance": -0.33,
                                         "needed": 2.74, "shortfall": 3.07})

    r = client.post("/creative/video/generate", json={"job_id": "j3"})
    assert r.status_code == 402
    d = r.json()["detail"]
    assert d["clips"] == 2 and d["shortfall_usd"] == 3.07
    assert "top up" in d["hint"]


def test_video_generate_renders_verifies_and_reports(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "j4"
    run.mkdir()
    (run / "storyboard.json").write_text(_board().model_dump_json(), encoding="utf-8")
    seen = {}

    def fake_render(**kw):
        seen.update(kw)
        return str(run / "video_captioned.mp4"), _board(), None

    monkeypatch.setattr(service.pipeline, "render_story", fake_render)
    monkeypatch.setattr(service.pipeline, "qa_video",
                        lambda **kw: QAReport(checks=[QACheck(name="cut_alignment", passed=True)],
                                              verdict="pass"))
    monkeypatch.setattr(fal_billing, "affordable",
                        lambda n, **kw: {"enabled": True, "ok": True, "balance": 50.0,
                                         "needed": 2.74, "shortfall": 0.0})

    r = client.post("/creative/video/generate", json={"job_id": "j4"})
    assert r.status_code == 200 and r.json()["clips"] == 2

    status = _poll("j4")
    assert status["status"] == "complete", status
    assert status["video"]["url"].endswith("video_captioned.mp4")
    assert status["qa"]["verdict"] == "pass"
    # max features by default: UGC capture style, strict fail-closed QA
    assert seen["strict"] is True
    assert seen["style"] is not None and seen["style"].camera == "handheld"


def test_video_generate_can_cut_variants(monkeypatch, tmp_path):
    from ai_layer.creative.schemas import Variant, VariantSet
    monkeypatch.setattr(config, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "j5"
    run.mkdir()
    (run / "storyboard.json").write_text(_board().model_dump_json(), encoding="utf-8")

    monkeypatch.setattr(service.pipeline, "render_story",
                        lambda **kw: (str(run / "timeline.mp4"), _board(), None))
    monkeypatch.setattr(service.pipeline, "qa_video",
                        lambda **kw: QAReport(checks=[], verdict="pass"))
    vset = VariantSet(base_id="j5", axis="caption_style", variants=[
        Variant(variant_id="j5-caption_style-bold", base_id="j5", axis="caption_style",
                value="bold", kind="edit"),
        Variant(variant_id="j5-caption_style-plain", base_id="j5", axis="caption_style",
                value="plain", kind="edit")])
    monkeypatch.setattr(service.pipeline, "make_variants",
                        lambda **kw: (vset, run / "variants.json"))
    monkeypatch.setattr(fal_billing, "affordable",
                        lambda n, **kw: {"enabled": True, "ok": True, "balance": 50.0,
                                         "needed": 2.74, "shortfall": 0.0})

    client.post("/creative/video/generate",
                json={"job_id": "j5", "variant_axis": "caption_style",
                      "variant_values": ["bold", "plain"]})
    status = _poll("j5")
    assert status["status"] == "complete", status
    assert status["variants"]["axis"] == "caption_style"
    assert len(status["variants"]["variants"]) == 2


# --- Neon persistence -----------------------------------------------------------

def test_jobs_are_persisted_to_neon(monkeypatch):
    """The job is written to creative_jobs so it survives a restart. A DB outage must never
    fail a run -- the generation already happened and the bytes are on disk."""
    saved = []
    monkeypatch.setattr(service.pipeline, "run", lambda **kw: _fake_manifest(kw["run_id"]))

    class _Repo:
        @staticmethod
        def save_job(job, brand_id=None):
            saved.append(dict(job))          # a snapshot per write, like real upserts

        @staticmethod
        def load_job(job_id, brand_id=None):
            rows = [j for j in saved if j["job_id"] == job_id]
            return rows[-1] if rows else None    # the row as last written

    import ai_layer.db as db_pkg
    monkeypatch.setattr(db_pkg, "repository", _Repo, raising=False)

    job_id = client.post("/creative/generate", json={"images": 1}).json()["job_id"]
    status = _poll(job_id)
    assert status["status"] == "complete"
    assert saved, "the job was never written to creative_jobs"
    assert saved[-1]["job_id"] == job_id
    assert saved[-1]["status"] == "complete"

    # and it is readable from the durable row alone, without the in-process mirror
    service._JOBS.pop(job_id, None)
    assert client.get(f"/creative/jobs/{job_id}").json()["status"] == "complete"


def test_a_db_outage_never_fails_a_run(monkeypatch):
    monkeypatch.setattr(service.pipeline, "run", lambda **kw: _fake_manifest(kw["run_id"]))

    class _Broken:
        @staticmethod
        def save_job(job, brand_id=None):
            raise RuntimeError("neon is down")

        @staticmethod
        def load_job(job_id, brand_id=None):
            raise RuntimeError("neon is down")

    import ai_layer.db as db_pkg
    monkeypatch.setattr(db_pkg, "repository", _Broken, raising=False)

    job_id = client.post("/creative/generate", json={"images": 1}).json()["job_id"]
    status = _poll(job_id)
    assert status["status"] == "complete"       # the run still finished
    assert len(status["assets"]) == 1
