"""Campaign selection + summary grounding."""
from __future__ import annotations

import sys
from pathlib import Path

from ai_layer.creative import campaign_select as cs


def test_top_roas_orders_and_limits(envelope_path):
    ds = cs.load_dataset(envelope_path)
    sub = cs.select_campaigns(ds, "top-roas", 2)
    assert list(sub.campaign_name) == ["Gamma", "Alpha"]   # roas 6.0, 5.0
    assert len(sub) == 2


def test_top_revenue(envelope_path):
    ds = cs.load_dataset(envelope_path)
    sub = cs.select_campaigns(ds, "top-revenue", 1)
    assert list(sub.campaign_name) == ["Alpha"]            # revenue 500


def test_last_n_picks_recent(envelope_path):
    ds = cs.load_dataset(envelope_path)
    sub = cs.select_campaigns(ds, "last-n", 1)
    assert list(sub.campaign_name) == ["Gamma"]            # date 2026-05-20


def test_summary_mentions_account_and_campaigns(envelope_path):
    ds = cs.load_dataset(envelope_path)
    sub = cs.select_campaigns(ds, "top-roas", 2)
    text = cs.summarize(ds, sub)
    assert "Test Brand" in text
    assert "Gamma" in text and "roas=6.00" in text
