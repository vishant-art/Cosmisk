"""Full-surface API test: the endpoints test_creative_service.py does NOT cover -- the
closed-loop routes (publish -> learn -> prior -> graph) and the new operator controls
(direction, n_shots) reaching the pipeline. TestClient, everything mocked, $0, no network.

Together with test_creative_service.py this exercises all 9 creative routes offline.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from ai_layer import config as ai_config
from ai_layer.api import app
from ai_layer.creative import outcomes, service
from ai_layer.creative import graph as graph_mod
from ai_layer.creative.schemas import (CreativePrior, AxisFinding, CreativeGraph, AtomStat,
                                       Script, ScriptBeat, Shot, Storyboard, QAReport, QACheck)

client = TestClient(app)


@pytest.fixture(autouse=True)
def _open_api_key(monkeypatch):
    monkeypatch.setattr(ai_config, "AI_LAYER_API_KEY", None)


@pytest.fixture(autouse=True)
def _no_live_video(monkeypatch):
    monkeypatch.setattr(service.pipeline, "video_smoke", lambda **kw: None)


# --- the join: POST /creative/variants/{id}/published --------------------------

def test_publish_stamps_the_meta_ad_id(monkeypatch):
    stamped = {}

    class _Repo:
        @staticmethod
        def stamp_published(variant_id, meta_ad_id):
            stamped[variant_id] = meta_ad_id
            return True

    import ai_layer.db as db_pkg
    monkeypatch.setattr(db_pkg, "repository", _Repo, raising=False)

    r = client.post("/creative/variants/run1__hook_type__pov/published",
                    json={"meta_ad_id": "1234567890"})
    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert stamped == {"run1__hook_type__pov": "1234567890"}


def test_publish_unknown_variant_404(monkeypatch):
    class _Repo:
        @staticmethod
        def stamp_published(variant_id, meta_ad_id):
            return False

    import ai_layer.db as db_pkg
    monkeypatch.setattr(db_pkg, "repository", _Repo, raising=False)
    r = client.post("/creative/variants/nope/published", json={"meta_ad_id": "x"})
    assert r.status_code == 404


# --- harvest + prior: POST /creative/learn -------------------------------------

def test_learn_harvests_and_returns_the_prior_the_brain_will_see(monkeypatch):
    monkeypatch.setattr(outcomes, "harvest",
                        lambda *a, **k: {"harvested": 2, "published": 2, "missing": []})
    prior = CreativePrior(brand_id="act_1", n_observed=2, findings=[
        AxisFinding(base_id="r1", axis="hook_type", winner="pov", loser="question",
                    winner_rate=0.14, loser_rate=0.09, lift=0.05, significant=True,
                    impressions=100000)])
    monkeypatch.setattr(outcomes, "build_prior", lambda acct, **k: prior)

    r = client.post("/creative/learn", json={"account_id": "act_1"},
                    headers={"X-Meta-Token": "tok"})
    assert r.status_code == 200
    body = r.json()
    assert body["harvested"] == 2
    assert "'pov' beat 'question'" in body["brief"]      # the exact text the brain is fed


def test_learn_without_a_meta_token_is_a_clean_400(monkeypatch):
    monkeypatch.delenv("META_ACCESS_TOKEN", raising=False)
    r = client.post("/creative/learn", json={"account_id": "act_1"})
    assert r.status_code == 400


# --- GET /creative/prior/{account} and /creative/graph/{account} ---------------

def test_prior_endpoint_returns_findings_and_the_brief(monkeypatch):
    prior = CreativePrior(brand_id="act_1", n_observed=2, n_total=2, findings=[
        AxisFinding(base_id="r1", axis="hook_type", winner="pov", loser="question",
                    winner_rate=0.14, loser_rate=0.09, lift=0.05, significant=True,
                    impressions=100000)])
    monkeypatch.setattr(outcomes, "build_prior", lambda acct, **k: prior)
    r = client.get("/creative/prior/act_1")
    assert r.status_code == 200
    assert r.json()["n_observed"] == 2 and "pov" in r.json()["brief"]


def test_graph_endpoint_reports_identifiability(monkeypatch):
    g = CreativeGraph(brand_id="act_1", n_winners=4, n_losers=4, atoms=[
        AtomStat(kind="hook_type", value="pov", n_winners=4, n_losers=0,
                 winner_rate=1.0, loser_rate=0.0, lift=1.0)])
    monkeypatch.setattr(graph_mod, "build_graph", lambda acct, **k: g)
    r = client.get("/creative/graph/act_1")
    assert r.status_code == 200
    body = r.json()
    assert body["identifiable"] is True
    assert "hook_type = 'pov'" in body["brief"]


def test_graph_with_no_losers_says_nothing(monkeypatch):
    g = CreativeGraph(brand_id="act_1", n_winners=5, n_losers=0)
    monkeypatch.setattr(graph_mod, "build_graph", lambda acct, **k: g)
    r = client.get("/creative/graph/act_1")
    assert r.json()["identifiable"] is False and r.json()["brief"] == ""


# --- the new operator controls reach the pipeline ------------------------------

def _board():
    return Storyboard(shots=[
        Shot(purpose="hook", duration_s=3, camera="selfie", subject="a", product_visible="absent"),
        Shot(purpose="cta", duration_s=4, camera="selfie", subject="b", product_visible="hero")],
        target_seconds=7)


def _script():
    return Script(beats=[ScriptBeat(purpose="hook", text="hi"), ScriptBeat(purpose="cta", text="buy")])


def test_direction_and_n_shots_reach_plan_story(monkeypatch, tmp_path):
    from ai_layer.creative import config as ccfg, fal_billing
    monkeypatch.setattr(ccfg, "OUTPUT_DIR", tmp_path)
    (tmp_path / "j1").mkdir()
    (tmp_path / "j1" / "brand_kit.json").write_text("{}", encoding="utf-8")
    seen = {}

    def spy_plan(**kw):
        seen.update(kw)
        return _script(), _board()

    monkeypatch.setattr(service.pipeline, "plan_story", spy_plan)
    monkeypatch.setattr(fal_billing, "affordable",
                        lambda n, **k: {"enabled": True, "ok": True, "balance": 50.0,
                                        "needed": 2.5, "shortfall": 0.0})

    r = client.post("/creative/video/plan",
                    json={"job_id": "j1", "seconds": 8, "n_shots": 3,
                          "direction": "cozy handheld, morning light, slow"})
    assert r.status_code == 200
    assert seen["direction"] == "cozy handheld, morning light, slow"
    assert seen["n_shots"] == 3


def test_direction_reaches_render_story(monkeypatch, tmp_path):
    from ai_layer.creative import config as ccfg, fal_billing
    monkeypatch.setattr(ccfg, "OUTPUT_DIR", tmp_path)
    run = tmp_path / "j2"
    run.mkdir()
    (run / "storyboard.json").write_text(_board().model_dump_json(), encoding="utf-8")
    seen = {}

    def spy_render(**kw):
        seen.update(kw)
        return str(run / "video_captioned.mp4"), _board(), None

    monkeypatch.setattr(service.pipeline, "render_story", spy_render)
    monkeypatch.setattr(service.pipeline, "qa_video",
                        lambda **kw: QAReport(checks=[QACheck(name="x", passed=True)], verdict="pass"))
    monkeypatch.setattr(fal_billing, "affordable",
                        lambda n, **k: {"enabled": True, "ok": True, "balance": 50.0,
                                        "needed": 2.5, "shortfall": 0.0})

    r = client.post("/creative/video/generate",
                    json={"job_id": "j2", "direction": "warm, tactile, unhurried"})
    assert r.status_code == 200
    status = {}
    for _ in range(40):
        import time
        status = client.get("/creative/jobs/j2").json()
        if status["status"] in ("complete", "failed"):
            break
        time.sleep(0.05)
    assert status["status"] == "complete", status
    assert seen["direction"] == "warm, tactile, unhurried"
