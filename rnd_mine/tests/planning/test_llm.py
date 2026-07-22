# tests/planning/test_llm.py
"""Unit tests for `PlannerLLM` (OpenRouter structured-output client).

All requests go through `httpx.MockTransport` -- no live network calls happen
in this module. The live OpenRouter model-id check is a separate, manual
one-off script (see Task 12 report), never part of the pytest suite.
"""
from __future__ import annotations

import json

import httpx
import pytest
from pydantic import BaseModel

from creative_studio.config import get_settings
from creative_studio.planning.llm import PlannerLLM, PlanningError


class Insight(BaseModel):
    headline: str
    score: int


def _chat_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def _planner(handler) -> PlannerLLM:
    return PlannerLLM(get_settings(), transport=httpx.MockTransport(handler))


async def test_retry_then_success():
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return _chat_response(json.dumps({"headline": "x"}))  # missing "score"
        return _chat_response(json.dumps({"headline": "y", "score": 3}))

    planner = _planner(handler)

    result = await planner.complete_json("system prompt", "user prompt", Insight)

    assert isinstance(result, Insight)
    assert result.headline == "y"
    assert result.score == 3
    assert len(calls) == 2

    second_body = json.loads(calls[1].content)
    assert "failed validation" in second_body["messages"][1]["content"]


async def test_exhaustion_raises_planning_error():
    calls: list[httpx.Request] = []
    bad_content = json.dumps({"headline": "always invalid"})  # missing "score"

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return _chat_response(bad_content)

    planner = _planner(handler)

    with pytest.raises(PlanningError) as exc_info:
        await planner.complete_json("system", "user", Insight, max_retries=2)

    assert len(calls) == 3  # 1 initial + 2 retries
    assert exc_info.value.raw == bad_content


async def test_non_200_raises_immediately():
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(500, text="internal server error")

    planner = _planner(handler)

    with pytest.raises(PlanningError) as exc_info:
        await planner.complete_json("system", "user", Insight)

    assert len(calls) == 1
    message = str(exc_info.value)
    assert "500" in message
    assert get_settings().openrouter_api_key not in message


async def test_malformed_json_retries():
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if len(calls) == 1:
            return _chat_response("not json {")
        return _chat_response(json.dumps({"headline": "y", "score": 3}))

    planner = _planner(handler)

    result = await planner.complete_json("system", "user", Insight)

    assert result.headline == "y"
    assert result.score == 3
    assert len(calls) == 2


async def test_list_models():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        assert request.url.path.endswith("/models")
        return httpx.Response(
            200,
            json={"data": [{"id": "openai/gpt-5.4-mini"}, {"id": "anthropic/claude-x"}]},
        )

    planner = _planner(handler)

    ids = await planner.list_models()

    assert ids == ["openai/gpt-5.4-mini", "anthropic/claude-x"]
