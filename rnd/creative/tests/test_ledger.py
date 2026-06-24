"""Cost ledger: fal prices computed from published rates (no cost in fal responses),
LLM cost read from OpenRouter's authoritative usage.cost, plus a final TOTAL row."""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import ledger  # noqa: E402


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
