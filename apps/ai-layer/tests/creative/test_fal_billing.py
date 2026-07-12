"""fal_billing: balance, actuals, pagination, the balance guard, and reconciliation.
All offline -- the HTTP layer (_http_get) is monkeypatched, no network, no admin key needed."""
import json

import pytest

from ai_layer.creative import fal_billing as fb


@pytest.fixture
def key(monkeypatch):
    monkeypatch.setenv("FAL_ADMIN_KEY", "test-admin-key")


def _route(responses):
    """Return an _http_get stub that dispatches on a substring of the URL."""
    def _get(url, key):
        for needle, body in responses.items():
            if needle in url:
                return body
        raise AssertionError(f"no stub for {url}")
    return _get


# --- graceful no-op without a key ---------------------------------------------

def test_unavailable_without_admin_key(monkeypatch):
    monkeypatch.delenv("FAL_ADMIN_KEY", raising=False)
    assert fb.available() is False
    assert fb.balance() is None
    assert fb.events("2026-07-01T00:00:00Z") == []
    assert fb.actual_total("2026-07-01T00:00:00Z") == 0.0
    # the guard must NOT block a run just because billing can't be read
    g = fb.affordable(3)
    assert g["enabled"] is False and g["ok"] is True


def test_blank_admin_key_is_treated_as_absent(monkeypatch):
    monkeypatch.setenv("FAL_ADMIN_KEY", "   ")
    assert fb.available() is False


# --- balance ------------------------------------------------------------------

def test_balance_parses_current_balance(monkeypatch, key):
    monkeypatch.setattr(fb, "_http_get", _route({
        "/account/billing": {"username": "u", "credits": {"current_balance": -0.33,
                                                          "currency": "USD"}}}))
    assert fb.balance() == -0.33


# --- events + pagination ------------------------------------------------------

def test_events_follow_pagination(monkeypatch, key):
    pages = [
        {"billing_events": [{"endpoint_id": "a", "cost_estimate_nano_usd": 1_000_000_000}],
         "has_more": True, "next_cursor": "c1"},
        {"billing_events": [{"endpoint_id": "a", "cost_estimate_nano_usd": 2_000_000_000}],
         "has_more": False, "next_cursor": None},
    ]
    calls = {"n": 0}

    def _get(url, k):
        i = calls["n"]
        calls["n"] += 1
        return pages[i]

    monkeypatch.setattr(fb, "_http_get", _get)
    evs = fb.events("2026-07-01T00:00:00Z", "2026-07-31T00:00:00Z")
    assert len(evs) == 2 and calls["n"] == 2


def test_spend_by_endpoint_and_total(monkeypatch, key):
    evs = {"billing_events": [
        {"endpoint_id": "bytedance/seedance-2.0/image-to-video", "cost_estimate_nano_usd": 1_222_200_000},
        {"endpoint_id": "bytedance/seedance-2.0/image-to-video", "cost_estimate_nano_usd": 1_222_200_000},
        {"endpoint_id": "fal-ai/flux-2-flex", "cost_estimate_nano_usd": 208_400_000},
    ], "has_more": False, "next_cursor": None}
    monkeypatch.setattr(fb, "_http_get", _route({"billing-events": evs}))
    by = fb.spend_by_endpoint("2026-07-01T00:00:00Z")
    assert by["bytedance/seedance-2.0/image-to-video"] == {"count": 2, "usd": 2.4444}
    assert by["fal-ai/flux-2-flex"]["usd"] == 0.2084
    assert fb.actual_total("2026-07-01T00:00:00Z") == pytest.approx(2.6528)


# --- balance guard ------------------------------------------------------------

def test_guard_allows_when_balance_covers_the_plan(monkeypatch, key):
    monkeypatch.setattr(fb, "_http_get", _route({
        "/account/billing": {"credits": {"current_balance": 10.0}}}))
    g = fb.affordable(2)                       # 2 * 1.2222 + 0.30 = 2.7444
    assert g["enabled"] and g["ok"] and g["needed"] == pytest.approx(2.7444)
    assert g["shortfall"] == 0.0


def test_guard_blocks_and_reports_shortfall(monkeypatch, key):
    monkeypatch.setattr(fb, "_http_get", _route({
        "/account/billing": {"credits": {"current_balance": 1.0}}}))
    g = fb.affordable(2)
    assert g["ok"] is False
    assert g["shortfall"] == pytest.approx(1.7444)


# --- reconciliation -----------------------------------------------------------

def test_reconcile_compares_estimate_to_actual(monkeypatch, key, tmp_path):
    # a run dir with an estimate ledger (incl. a TOTAL row that must be ignored)
    led = tmp_path / "ledger.jsonl"
    led.write_text(
        json.dumps({"op": "shot_video", "cost_usd": 1.2096}) + "\n"
        + json.dumps({"op": "product_seed", "cost_usd": 0.20}) + "\n"
        + json.dumps({"op": "TOTAL", "cost_usd": 1.4096, "by_op": {}}) + "\n",
        encoding="utf-8")
    (tmp_path / "video.mp4").write_bytes(b"x")     # gives run_window an mtime to span

    evs = {"billing_events": [
        {"endpoint_id": "bytedance/seedance-2.0/image-to-video", "cost_estimate_nano_usd": 1_222_200_000},
        {"endpoint_id": "fal-ai/flux-2-flex", "cost_estimate_nano_usd": 208_400_000},
    ], "has_more": False, "next_cursor": None}
    monkeypatch.setattr(fb, "_http_get", _route({"billing-events": evs,
                                                 "/account/billing": {"credits": {"current_balance": 5.0}}}))

    rec = fb.reconcile(tmp_path)
    assert rec["estimate"] == 1.4096
    assert rec["actual"] == 1.4306               # 1.2222 + 0.2084
    assert rec["delta"] == pytest.approx(0.021)  # actual ran a touch over estimate

    payload = fb.write_run_actuals(tmp_path)
    assert (tmp_path / "fal_actuals.json").exists()
    assert payload["actual_usd"] == 1.4306 and payload["balance_after_usd"] == 5.0


def test_reconcile_is_none_without_key(monkeypatch, tmp_path):
    monkeypatch.delenv("FAL_ADMIN_KEY", raising=False)
    assert fb.reconcile(tmp_path) is None
    assert fb.write_run_actuals(tmp_path) is None
