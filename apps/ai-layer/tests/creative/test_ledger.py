"""Cost ledger: fal prices computed from published rates (no cost in fal responses),
LLM cost read from OpenRouter's authoritative usage.cost, plus a final TOTAL row."""
from __future__ import annotations

import json
import sys
from pathlib import Path

from ai_layer.creative import ledger


# --- megapixel rounding (fal's MP unit is 1024x1024, rounded UP) --------------

def test_megapixels_round_up_to_1024_squared():
    assert ledger.megapixels(1024, 1024) == 1
    assert ledger.megapixels(1920, 1080) == 2
    assert ledger.megapixels(512, 512) == 1
    assert ledger.megapixels(1080, 1920) == 2


# --- fal image pricing --------------------------------------------------------

def test_flux_flex_per_megapixel():
    assert ledger.image_cost("flux_flex", 1024, 1024) == 0.05
    assert ledger.image_cost("flux_flex", 1920, 1080) == 0.10


def test_flux_pro_tiered():
    assert ledger.image_cost("flux_pro", 1024, 1024) == 0.03      # first MP
    assert ledger.image_cost("flux_pro", 1920, 1080) == 0.045     # 0.03 + 1 extra MP


def test_flux_flex_counts_reference_input_mp():
    # fal bills input refs too: 1MP output + 2x 1MP refs = 3MP * $0.05
    assert ledger.image_cost("flux_flex", 1024, 1024, ref_mp=2) == 0.15


def test_flux_pro_counts_reference_input_mp():
    # 0.03 first MP + 0.015*(0 extra output + 2 ref) = 0.06
    assert ledger.image_cost("flux_pro", 1024, 1024, ref_mp=2) == 0.06


def test_product_shot_flat():
    assert ledger.image_cost("product", 1080, 1350) == 0.04
    assert ledger.image_cost("product", 99, 99) == 0.04


def test_flux_fill_per_megapixel():
    assert ledger.image_cost("flux_fill", 1024, 1024) == 0.05
    assert ledger.image_cost("flux_fill", 1080, 1920) == 0.10


# --- fal video pricing (token formula) ----------------------------------------

def test_seedance_token_formula_720p():
    # (1280*720*5*24)/1024 = 108000 tokens; *0.014/1k = 1.512
    assert ledger.video_cost("seedance", 1280, 720, 5) == 1.512
    assert ledger.video_cost("seedance_fast", 1280, 720, 5) == 1.2096


# --- OpenRouter authoritative cost --------------------------------------------

class _Resp:
    def __init__(self, payload):
        self._payload = payload

    def model_dump(self):
        return self._payload


def test_response_cost_reads_usage_cost():
    r = _Resp({"usage": {"cost": 0.0123, "prompt_tokens": 50}})
    assert ledger.response_cost(r) == 0.0123


def test_response_cost_byok_uses_upstream_when_cost_zero():
    r = _Resp({"usage": {"cost": 0, "cost_details": {"upstream_inference_cost": 0.0068204}}})
    assert ledger.response_cost(r) == 0.00682


def test_response_cost_sums_direct_and_upstream():
    r = _Resp({"usage": {"cost": 0.001, "cost_details": {"upstream_inference_cost": 0.002}}})
    assert ledger.response_cost(r) == 0.003


def test_response_cost_defaults_zero_when_absent():
    assert ledger.response_cost(_Resp({"choices": []})) == 0.0
    assert ledger.response_cost(object()) == 0.0          # no model_dump at all


# --- ledger rows + final total ------------------------------------------------

def test_finalize_appends_total_row(tmp_path):
    led = ledger.Ledger(tmp_path)
    led.record("background", "fal", "flux-2-flex", 0.05, concept="A")
    led.record("qa_vlm", "openrouter", "gemini", 0.0001, concept="A")
    summary = led.finalize()
    assert summary["op"] == "TOTAL"
    assert summary["cost_usd"] == round(0.05 + 0.0001, 6)
    assert summary["by_op"]["background"] == 0.05

    lines = (tmp_path / "ledger.jsonl").read_text("utf-8").strip().splitlines()
    last = json.loads(lines[-1])
    assert last["op"] == "TOTAL"
    assert last["cost_usd"] == round(0.05 + 0.0001, 6)
    assert len(lines) == 3                                # two steps + the total


# --- the TOTAL row is what reaches Neon (creative_jobs.ledger_json) -----------

def test_run_ledger_reads_back_the_total_row(tmp_path):
    """service._run_ledger lifts the finalized breakdown off the run's ephemeral disk so it
    survives a redeploy. _run_cost deliberately sums the per-op rows instead, so an
    unfinalized (crashed/resumed) run still reports a cost."""
    from ai_layer.creative import service

    led = ledger.Ledger(tmp_path)
    led.record("background", "fal", "flux-2-flex", 0.05, concept="A")
    led.record("concepts", "openrouter", "gemini", 0.01)
    led.finalize()

    row = service._run_ledger(tmp_path)
    assert row["op"] == "TOTAL"
    assert row["cost_usd"] == 0.06
    assert row["by_op"] == {"background": 0.05, "concepts": 0.01}
    assert service._run_cost(tmp_path) == 0.06          # per-op sum agrees with the total


def test_run_ledger_is_none_without_a_ledger(tmp_path):
    from ai_layer.creative import service
    assert service._run_ledger(tmp_path) is None
    assert service._run_cost(tmp_path) == 0.0
