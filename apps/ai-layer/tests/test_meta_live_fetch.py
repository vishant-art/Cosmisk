"""Cursor pagination + adaptive chunk fetching (Task 3). No network: httpx stubbed."""
import json
from datetime import date

import pytest

from ai_layer import meta_live as ml


class _Resp:
    def __init__(self, body, status=200):
        self._body, self.status_code, self.text = body, status, json.dumps(body)
    def json(self):
        return self._body


class _FakeClient:
    """Stands in for httpx.Client; serves scripted responses and records requests."""
    def __init__(self, script):
        self.script, self.calls = list(script), []
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False
    def get(self, url, params=None):
        self.calls.append((url, dict(params or {})))
        return self.script.pop(0)


def test_get_insights_paged_advances_after_cursor_not_next_url(monkeypatch):
    page1 = _Resp({"data": [{"x": 1}],
                   "paging": {"cursors": {"after": "AAA"},
                              "next": "https://graph.facebook.com/v25.0/SHOULD_NOT_FOLLOW"}})
    page2 = _Resp({"data": [{"x": 2}], "paging": {}})
    fake = _FakeClient([page1, page2])
    monkeypatch.setattr(ml.httpx, "Client", lambda **kw: fake)
    rows, pages = ml.get_insights_paged("act_1", {"limit": 500})
    assert [r["x"] for r in rows] == [1, 2] and pages == 2
    # second call: SAME v23.0 endpoint, original params + after cursor
    url2, params2 = fake.calls[1]
    assert "v25.0" not in url2 and url2.startswith(ml.GRAPH_BASE)
    assert params2.get("after") == "AAA" and params2.get("limit") == 500


def test_meta_error_classifiers():
    e = ml.MetaError(500, None, 99, "please reduce the amount of data")
    assert ml.is_too_much_data(e) and not ml.is_beyond_retention(e)
    e2 = ml.MetaError(400, 3018, None, "cannot be beyond 37 months")
    assert ml.is_beyond_retention(e2)


def test_preset_days():
    """Days for a last_Nd preset; None when the preset isn't day-shaped -- the
    signal that routes a preset through the chunked range fetcher vs. the legacy
    unchunked one."""
    assert ml.preset_days("last_30d") == 30
    assert ml.preset_days("last_7d") == 7
    assert ml.preset_days("this_month") is None
    assert ml.preset_days("") is None
    assert ml.preset_days(None) is None


def test_adaptive_halving_and_retention_skip(monkeypatch):
    """Windows >3 days are rejected as too big; beyond-retention windows are skipped."""
    def fake_paged(account, params, max_rows=5000):
        tr = json.loads(params["time_range"])
        s, u = date.fromisoformat(tr["since"]), date.fromisoformat(tr["until"])
        if (u - s).days > 3:
            raise ml.MetaError(500, None, 99, "please reduce the amount of data")
        if s < date(2026, 1, 3):
            raise ml.MetaError(400, 3018, None, "cannot be beyond 37 months")
        return ([{"date_start": s.isoformat()}], 1)
    monkeypatch.setattr(ml, "get_insights_paged", fake_paged)
    skipped = []
    rows = ml._fetch_window_adaptive("tok", "act_1", date(2026, 1, 1), date(2026, 1, 14),
                                    "campaign", skipped)
    assert rows                       # the in-retention slices came back
    assert any("retention" in why for *_, why in skipped)
