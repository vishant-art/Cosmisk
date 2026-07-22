# src/creative_studio/planning/llm.py
"""OpenRouter structured-output client for the Creative Studio planning layer.

`PlannerLLM.complete_json` calls OpenRouter's chat completions endpoint with
`response_format={"type": "json_object"}`, then parses the model's reply as
JSON and validates it against a caller-supplied Pydantic model. A reply that
fails to parse or fails validation is retried (up to `max_retries` additional
attempts) with the validation error appended to the user message, so the
model gets a chance to self-correct.

`list_models` is a thin GET wrapper, used for the one-off live check of
`Settings.creative_studio_planner_model` against OpenRouter's catalog (see
the Task 12 report) -- it is never called from the test suite.
"""
from __future__ import annotations

import json
from typing import TypeVar

import httpx
from pydantic import BaseModel, ValidationError

T = TypeVar("T", bound=BaseModel)


class PlanningError(Exception):
    """Raised when the planner LLM cannot produce a valid structured reply.

    `.raw` carries the last raw model output seen (if any), so callers can
    log or inspect what the model actually returned. The message never
    contains the Authorization header or API key -- only status codes and a
    bounded excerpt of the response body.
    """

    def __init__(self, message: str, raw: str | None = None) -> None:
        super().__init__(message)
        self.raw = raw


class PlannerLLM:
    """Thin async client for OpenRouter's chat-completions and models endpoints."""

    def __init__(self, settings, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._settings = settings
        self._transport = transport

    async def complete_json(
        self,
        system: str,
        user: str,
        model_cls: type[T],
        max_retries: int = 2,
        temperature: float = 0.4,
    ) -> T:
        """POST a chat-completion request and validate the reply as `model_cls`.

        Retries (up to `max_retries` additional attempts, so `1 + max_retries`
        total) on invalid JSON or a failed pydantic validation, re-prompting
        with the error appended to the original user message each time. A
        non-200 response raises `PlanningError` immediately, without retrying.
        """
        settings = self._settings
        headers = {"Authorization": f"Bearer {settings.openrouter_api_key}"}
        current_user = user
        last_content: str | None = None
        last_err = ""

        async with httpx.AsyncClient(transport=self._transport, timeout=120.0) as client:
            for _attempt in range(max_retries + 1):
                body = {
                    "model": settings.creative_studio_planner_model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": current_user},
                    ],
                    "response_format": {"type": "json_object"},
                    "temperature": temperature,
                }

                response = await client.post(
                    f"{settings.openrouter_base_url}/chat/completions",
                    json=body,
                    headers=headers,
                )

                if response.status_code != 200:
                    excerpt = response.text[:200] if response.text else "no response body"
                    raise PlanningError(
                        f"OpenRouter chat completion request failed: HTTP {response.status_code}: {excerpt}"
                    )

                data = response.json()
                content = data["choices"][0]["message"]["content"]
                last_content = content

                try:
                    parsed = json.loads(content)
                    return model_cls.model_validate(parsed)
                except (json.JSONDecodeError, ValidationError) as exc:
                    last_err = str(exc)
                    current_user = (
                        f"{user}\n\nYour previous reply failed validation with these errors:"
                        f"\n{last_err}\n\nReturn ONLY corrected JSON matching the required structure."
                    )

        raise PlanningError(
            f"validation failed after {max_retries + 1} attempts: {last_err}",
            raw=last_content,
        )

    async def list_models(self) -> list[str]:
        """GET `{base}/models` and return the bare list of model ids."""
        headers = {"Authorization": f"Bearer {self._settings.openrouter_api_key}"}
        async with httpx.AsyncClient(transport=self._transport, timeout=120.0) as client:
            response = await client.get(f"{self._settings.openrouter_base_url}/models", headers=headers)
            response.raise_for_status()
            data = response.json()
        return [m["id"] for m in data["data"]]
