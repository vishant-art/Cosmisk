"""Tests for the cost ledger -- estimate fallback vs OpenRouter's real cost."""
from __future__ import annotations

import pytest

from ai_layer import cost_ledger


@pytest.fixture(autouse=True)
def _use_db(db_session):
    """Route cost_ledger.py -> repository -> the rolled-back test-branch transaction."""
    yield


def _entries():
    from sqlalchemy import select
    from ai_layer.db import engine, models as m
    with engine.get_session() as s:
        return [{"model": r.model, "op": r.op, "account": r.account_id,
                 "cost_usd": r.cost_usd, "priced": r.priced,
                 "cache_discount_usd": r.cache_discount_usd}
                for r in s.execute(select(m.CostLedgerEntry)).scalars().all()]


def test_estimate_used_when_no_actual():
    c = cost_ledger.record("google/gemini-2.5-flash", 1_000_000, 0, account="act_1")
    # 1M prompt tokens * $0.30/1M = $0.30
    assert c == pytest.approx(0.30)
    e = _entries()[0]
    assert e["priced"] == "estimated" and e["cost_usd"] == pytest.approx(0.30)


def test_actual_cost_recorded_verbatim():
    c = cost_ledger.record("google/gemini-2.5-flash", 50_000, 800,
                           account="act_1", cost_usd_actual=0.001234,
                           cache_discount_usd=0.0005)
    assert c == pytest.approx(0.001234)            # NOT the static estimate
    e = _entries()[0]
    assert e["priced"] == "openrouter"
    assert e["cost_usd"] == pytest.approx(0.001234)
    assert e["cache_discount_usd"] == pytest.approx(0.0005)


def test_total_usd_sums_actual_and_estimated():
    cost_ledger.record("google/gemini-2.5-flash", 0, 0, account="a", cost_usd_actual=0.01)
    cost_ledger.record("google/gemini-2.5-flash", 1_000_000, 0, account="a")  # +0.30 est
    assert cost_ledger.total_usd(account="a") == pytest.approx(0.31)
