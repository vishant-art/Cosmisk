import pytest

from ai_layer.db import repository as repo


def test_estimate_used_when_no_actual(db_session):
    c = repo.record_cost("google/gemini-2.5-flash", 1_000_000, 0, account="act_1")
    assert c == pytest.approx(0.30)
    assert repo.total_usd(account="act_1") == pytest.approx(0.30)


def test_actual_cost_recorded_and_scoped(db_session):
    repo.record_cost("google/gemini-2.5-flash", 0, 0, account="a", cost_usd_actual=0.01)
    repo.record_cost("google/gemini-2.5-flash", 0, 0, account="b", cost_usd_actual=0.05)
    assert repo.total_usd(account="a") == pytest.approx(0.01)   # scoped, no cross-tenant sum
    assert repo.total_usd(account="b") == pytest.approx(0.05)


def test_record_cost_never_raises_on_write_failure(db_session, monkeypatch):
    from ai_layer.db import engine as db_engine

    def boom():
        raise RuntimeError("db down")
    monkeypatch.setattr(db_engine, "get_session", boom)
    # must NOT raise, must still return the computed cost
    c = repo.record_cost("google/gemini-2.5-flash", 1_000_000, 0, account="x")
    assert c == pytest.approx(0.30)
