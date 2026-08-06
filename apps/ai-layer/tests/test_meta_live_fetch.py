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


class _NonJsonResp:
    """Meta serves HTML on gateway errors."""
    status_code = 502
    text = "<html>502 Bad Gateway</html>"
    def json(self):
        raise ValueError("Expecting value: line 1 column 1 (char 0)")


def test_non_json_response_raises_classifiable_meta_error(monkeypatch):
    """A bare ValueError/RuntimeError here defeats is_too_much_data, so the
    adaptive window-splitting retry can never fire on a gateway blip."""
    fake = _FakeClient([_NonJsonResp()])
    monkeypatch.setattr(ml.httpx, "Client", lambda **kw: fake)
    with pytest.raises(ml.MetaError) as ei:
        ml.get_insights_paged("act_1", {"limit": 500})
    assert ei.value.status == 502
    assert ml.is_too_much_data(ei.value), "a 5xx must stay retryable by window splitting"


def test_meta_get_non_json_also_raises_meta_error(monkeypatch):
    fake = _FakeClient([_NonJsonResp()])
    monkeypatch.setattr(ml.httpx, "Client", lambda **kw: fake)
    with pytest.raises(ml.MetaError):
        ml.meta_get("me/adaccounts", {"access_token": "t"})


def test_list_accounts_is_memoized(monkeypatch):
    """E5: fetch_envelope calls this per window and _cached_dataset calls it again,
    so a cold multi-window pull burned N+1 identical me/adaccounts requests."""
    calls = []
    monkeypatch.setattr(ml, "meta_get",
                        lambda p, params: calls.append(p) or {"data": [{"account_id": "1"}]})
    ml._accounts_memo.clear()
    ml.list_accounts("tok")
    ml.list_accounts("tok")
    assert len(calls) == 1, "the second call inside the TTL must not hit Graph"
    ml.list_accounts("other-tok")
    assert len(calls) == 2, "a different token must never read another token's accounts"


def test_paging_warns_when_next_has_no_cursor(monkeypatch, caplog):
    """G4: an offset-paged response silently truncated to page 1 with no signal."""
    page = _Resp({"data": [{"x": 1}], "paging": {"next": "https://.../next"}})
    monkeypatch.setattr(ml.httpx, "Client", lambda **kw: _FakeClient([page]))
    with caplog.at_level("WARNING"):
        rows, pages = ml.get_insights_paged("act_1", {"limit": 500})
    assert pages == 1 and len(rows) == 1
    assert "may be truncated" in caplog.text
