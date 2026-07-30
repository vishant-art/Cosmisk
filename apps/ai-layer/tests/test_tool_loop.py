"""run_tool_loop against a scripted fake OpenAI client (Task 9). No network."""
import json

import pytest

from ai_layer import chat


@pytest.fixture(autouse=True)
def _use_db(db_session):
    """Route cost_ledger writes -> the rolled-back test-branch transaction.

    test_no_tools_answers_directly below exercises the REAL chat._record_cost
    path (unmocked), which lazily writes a CostLedgerEntry via
    ai_layer.db.repository. Without this fixture that write is not rolled
    back (db_session is the only thing that joins engine.get_session() to a
    per-test SAVEPOINT), so repeated runs permanently accumulate rows for
    account_id='act_1' in the shared Neon test branch -- polluting
    test_cost_ledger.py / test_repository_cost.py, which sum/scan that same
    account. Same pattern as test_cost_ledger.py's `_use_db`."""
    yield


class _Msg:
    def __init__(self, content=None, tool_calls=None):
        self.content, self.tool_calls = content, tool_calls


class _Call:
    def __init__(self, id, name, arguments):
        self.id = id
        self.function = type("F", (), {"name": name, "arguments": arguments})()


class _FakeClient:
    """Yields scripted responses; records whether tools were offered each round."""
    def __init__(self, script):
        self._script = list(script)
        self.rounds = []
        outer = self
        class _Completions:
            def create(self, **kw):
                outer.rounds.append("tools" in kw)
                msg = outer._script.pop(0)
                usage = type("U", (), {"prompt_tokens": 10, "completion_tokens": 5,
                                       "model_extra": {"cost": 0.001}})()
                choice = type("C", (), {"message": msg})()
                return type("R", (), {"choices": [choice], "usage": usage})()
        self.chat = type("Chat", (), {"completions": _Completions()})()


def test_tool_round_then_final_answer(monkeypatch):
    monkeypatch.setattr(chat, "_ensure_ad_level",
                        lambda token, account, days, brand_id=None, progress=None:
                        ([{"ad_id": "a1", "ad_name": "A", "adset_id": "s", "adset_name": "S",
                           "campaign_name": "C", "date": "2026-07-01", "spend": 600.0,
                           "revenue": 1800.0, "purchases": 4.0, "impressions": 10000.0,
                           "link_clicks": 200.0, "frequency": 1.5, "roas": 3.0,
                           "video_3s": 0.0, "thruplay": 0.0}], "2026-07-01..2026-07-01"))
    recorded = []
    monkeypatch.setattr(chat, "_record_cost",
                        lambda usage, account=None, op="chat": recorded.append(1) or 0.001)
    client = _FakeClient([
        _Msg(tool_calls=[_Call("t1", "top_ads", json.dumps({"metric": "roas"}))]),
        _Msg(content="**Answer** grounded in tool data."),
    ])
    messages = [{"role": "system", "content": "s"}, {"role": "user", "content": "top ads?"}]
    answer, cost, tools_used = chat.run_tool_loop(client, messages, "act_1", "tok")
    assert answer.startswith("**Answer**") and tools_used == ["top_ads"]
    assert cost == 0.002 and len(recorded) == 2
    roles = [m["role"] for m in messages]
    assert roles == ["system", "user", "assistant", "tool", "assistant"]


def test_no_tools_answers_directly():
    client = _FakeClient([_Msg(content="direct")])
    answer, cost, tools_used = chat.run_tool_loop(
        client, [{"role": "user", "content": "hi"}], "act_1", "tok")
    assert answer == "direct" and tools_used == []


def test_round_cap_forces_tools_off_final(monkeypatch):
    monkeypatch.setattr(chat, "_ensure_ad_level",
                        lambda *a, **k: ([], ""))
    monkeypatch.setattr(chat, "_record_cost", lambda *a, **k: 0.0)
    looping = _Msg(tool_calls=[_Call("t", "top_ads", "{}")])
    client = _FakeClient([looping] * chat.TOOL_MAX_ROUNDS + [_Msg(content="forced")])
    answer, _, _ = chat.run_tool_loop(
        client, [{"role": "user", "content": "loop"}], "act_1", "tok")
    assert answer == "forced"
    assert client.rounds == [True] * chat.TOOL_MAX_ROUNDS + [False]  # final call: tools off
