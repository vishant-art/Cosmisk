"""chat_json is the only place a model response becomes a Python object, so a bad
parse there aborts a whole run. It re-rolls the call on JSONDecodeError -- and on
nothing else."""
from __future__ import annotations

import json

import pytest

from ai_layer.creative import brain


class _Scripted:
    """A fake OpenRouter client that returns each queued body in turn (or raises it)."""

    def __init__(self, *bodies):
        self._bodies = list(bodies)
        self.calls = 0
        self.chat = type("_", (), {"completions": self})()

    def create(self, **_kw):
        self.calls += 1
        body = self._bodies.pop(0)
        if isinstance(body, Exception):
            raise body
        msg = type("_", (), {"content": body})()
        return type("_", (), {"choices": [type("_", (), {"message": msg})()], "usage": None})()


def test_retries_past_malformed_json():
    c = _Scripted("{truncated", "not json at all", '{"ok": 1}')
    data, _cost = brain.chat_json(c, "sys", "user")
    assert data == {"ok": 1}
    assert c.calls == 3


def test_raises_after_attempts_exhausted():
    c = _Scripted("{bad", "{bad", "{bad")
    with pytest.raises(json.JSONDecodeError):
        brain.chat_json(c, "sys", "user")
    assert c.calls == 3


def test_api_errors_are_not_retried():
    """A network/API failure is not made better by asking three times, just slower."""
    c = _Scripted(RuntimeError("upstream 502"), '{"ok": 1}')
    with pytest.raises(RuntimeError):
        brain.chat_json(c, "sys", "user")
    assert c.calls == 1
