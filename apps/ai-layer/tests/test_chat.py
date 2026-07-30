"""Tests for File 3 (chat.py) -- the RAG chatbot.

Two layers:
  1. Offline (always run, free): the context-injection snapshot must be correct
     and robust to messy/edge inputs. This is what the model sees, so if it's
     wrong the bot is wrong regardless of the LLM.
  2. Live grounding (opt-in, costs OpenRouter tokens): real calls that check the
     model answers FROM the snapshot and REFUSES to invent missing data.

Run offline:   pytest test_chat.py
Run all:       set RUN_LIVE_LLM=1   (PowerShell: $env:RUN_LIVE_LLM=1)  then pytest test_chat.py
"""
from __future__ import annotations

import os
from pathlib import Path

import pytest

# Importing the package loads .env (via ai_layer.config), so the live-test skipif
# can see OPENROUTER_API_KEY at collection time.
from ai_layer import chat
from ai_layer import meta_transform as mt

META = {"account_name": "Test", "currency": "INR",
        "date_range": {"since": "2026-05-01", "until": "2026-05-02"}}


def raw(name, date, spend, purch, rev, freq="1.5", clicks="50", impr="1000"):
    return dict(
        campaign_id=name, campaign_name=name, date_start=date, date_stop=date,
        spend=str(spend), impressions=impr, reach="800", frequency=freq, clicks=clicks,
        ctr="5", cpc="2", cpm="100",
        actions=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purch)}],
        action_values=[{"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(rev)}],
        purchase_roas=[],
    )


def ds_of(rows, meta=META):
    return mt.normalize({"meta": meta, "data": rows})


# ---------------- offline: snapshot correctness & robustness ----------------

def test_context_has_correct_totals():
    ctx = chat.build_context(ds_of([raw("A", "2026-05-01", 100, 2, 300),
                                    raw("B", "2026-05-01", 100, 1, 100)]))
    assert "spend=200" in ctx
    assert "revenue=400" in ctx
    assert "blended_roas=2.00" in ctx          # 400/200
    assert "A" in ctx and "B" in ctx


def test_context_single_campaign():
    ctx = chat.build_context(ds_of([raw("Solo", "2026-05-01", 500, 10, 2500)]))
    assert "Solo" in ctx and "roas=5.00" in ctx


def test_context_handles_zero_spend_rows():
    ctx = chat.build_context(ds_of([raw("Z", "2026-05-01", 0, 0, 0)]))   # no ZeroDivisionError
    assert "blended_roas=0.00" in ctx


def test_context_unicode_and_currency_glyphs():
    ctx = chat.build_context(ds_of([raw("Café ₹ Продукт", "2026-05-01", 100, 1, 200)]))
    assert "Café ₹ Продукт" in ctx


def test_context_messy_actions_picks_pixel():
    """Snapshot revenue must come from the canonical pixel value, not omni."""
    r = raw("M", "2026-05-01", 100, 1, 0)
    r["actions"] = [
        {"action_type": "omni_purchase", "value": "9"},
        {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "5"},
    ]
    r["action_values"] = [
        {"action_type": "omni_purchase", "value": "9999"},
        {"action_type": "offsite_conversion.fb_pixel_purchase", "value": "500"},
    ]
    ctx = chat.build_context(ds_of([r]))
    assert "revenue=500" in ctx and "9999" not in ctx


def test_context_large_numbers_format():
    ctx = chat.build_context(ds_of([raw("Big", "2026-05-01", 5_000_000, 2000, 18_400_000)]))
    assert "spend=5000000" in ctx              # no scientific notation / commas


def test_system_prompt_embeds_snapshot():
    sys_msg = chat.SYSTEM.format(context=chat.build_context(ds_of([raw("A", "2026-05-01", 100, 2, 300)])))
    assert "DATA SNAPSHOT" in sys_msg and "snapshot" in sys_msg.lower()


def test_system_prompt_has_trust_blocks():
    from ai_layer import chat
    for marker in ("CODE-COMPUTED ANALYSIS", "HISTORIC FACTS", "COMPETITOR INTEL"):
        assert marker in chat.SYSTEM
    assert chat.MODEL == "openai/gpt-5.4-mini" and chat.TEMPERATURE == 0.5
    assert chat.MAX_TOKENS == 6000 and chat.REASONING_EFFORT == "minimal"


def test_build_context_pandas_free_output_shape():
    from ai_layer import chat, meta_transform as mt
    ds = mt.normalize({"meta": {"account_id": "a", "account_name": "N", "currency": "INR",
                                "date_range": {"since": "2026-07-01", "until": "2026-07-01"},
                                "level": "campaign", "source": "test"},
                       "data": [{"campaign_id": "c1", "campaign_name": "C",
                                 "date_start": "2026-07-01", "spend": "100",
                                 "impressions": "1000"}]})
    ctx = chat.build_context(ds, full=True)
    assert "PER-CAMPAIGN TOTALS" in ctx and "FULL PER-CAMPAIGN DAILY ROWS" in ctx


def test_real_sample_builds_context_if_present():
    p = Path(__file__).resolve().parents[1] / "data" / "_real_sample.json"
    if not p.exists():
        pytest.skip("no _real_sample.json captured")
    ctx = chat.build_context(mt.load(str(p)))
    assert "PER-CAMPAIGN TOTALS" in ctx and "DAILY ACCOUNT TOTALS" in ctx
    assert len(ctx) > 1000                      # 84 campaigns -> substantial


# ---------------- live grounding (opt-in; costs tokens) ----------------

live = pytest.mark.skipif(
    not (os.getenv("OPENROUTER_API_KEY") and os.getenv("RUN_LIVE_LLM")),
    reason="set RUN_LIVE_LLM=1 and OPENROUTER_API_KEY to run live LLM tests",
)


def _ask(question, ds):
    from openai import OpenAI
    client = OpenAI(api_key=os.getenv("OPENROUTER_API_KEY"),
                    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"))
    msgs = [
        {"role": "system", "content": chat.SYSTEM.format(context=chat.build_context(ds))},
        {"role": "user", "content": question},
    ]
    # go through chat.complete so the live tests exercise the real config
    # (MODEL + REASONING_EFFORT), proving grounding holds under minimal reasoning.
    return chat.complete(client, msgs)


@live
def test_live_grounded_blended_roas():
    ds = ds_of([raw("A", "2026-05-01", 100, 2, 300), raw("B", "2026-05-01", 100, 1, 100)])
    ans = _ask("What is the blended ROAS? Give the number.", ds).lower()
    assert "2.0" in ans or "2.00" in ans or "2x" in ans


@live
def test_live_refuses_unknown_metric():
    ds = ds_of([raw("A", "2026-05-01", 100, 2, 300)])
    ans = _ask("What was my TikTok ad spend?", ds).lower()
    assert any(w in ans for w in ["not", "no ", "don't", "cannot", "isn't",
                                  "unavailable", "only", "doesn't", "n/a"])


@live
def test_live_picks_worst_campaign():
    ds = ds_of([raw("GoodOne", "2026-05-01", 100, 10, 500),
                raw("BadOne", "2026-05-01", 100, 1, 80)])
    ans = _ask("Which campaign has the worst ROAS? Name it.", ds)
    assert "BadOne" in ans


@live
def test_live_no_hallucinated_campaign():
    ds = ds_of([raw("OnlyCampaign", "2026-05-01", 100, 5, 400)])
    ans = _ask("List all campaign names.", ds)
    assert "OnlyCampaign" in ans and "Summer" not in ans


@live
def test_live_gives_inference_not_refusal():
    """Inference/judgment questions must get a substantive analytical answer, not a
    'cannot be determined' refusal."""
    ds = ds_of([raw("UGC", "2026-05-01", 100, 10, 800),       # 8.0x
                raw("Catalog", "2026-05-01", 200, 5, 300)])   # 1.5x
    ans = _ask("Is this account healthy, and what should I focus on? Give your take.", ds)
    low = ans.lower()
    assert len(ans) > 80                                       # substantive, not a one-line refusal
    assert ("ugc" in low or "catalog" in low or "roas" in low)  # engaged with the data
    assert not any(p in low for p in ["cannot be determined", "not derivable",
                                      "i cannot answer", "unable to provide"])
