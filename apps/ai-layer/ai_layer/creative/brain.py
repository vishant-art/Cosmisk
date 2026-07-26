"""Shared LLM transport for the two brains.

Extracted in T6 so that neither brain owns the other's plumbing. The split that matters
is not planner/strategist/copywriter (that is an org chart, and org charts make poor
module boundaries). It is:

    brand_brain  -- the brand's IDENTITY. Does not consume a CreativeTemplate.
    story_brain  -- the ARGUMENT: concepts, script, storyboard, voiceover.
                    Everything that consumes a CreativeTemplate lives here.

Both talk to OpenRouter through `chat_json`, which is the only place a model response
becomes a Python object.
"""
from __future__ import annotations

import json
import logging
from pathlib import Path

from ai_layer.creative import config  # noqa: E402
from ai_layer.creative import ledger  # noqa: E402


def chat_json(client, system: str, user, *, temperature: float | None = None,
              attempts: int = 3) -> tuple[dict, float]:
    """One OpenRouter call constrained to a JSON object; tolerant of stray fences.
    Returns (parsed, cost_usd) -- cost is OpenRouter's authoritative usage.cost,
    summed across ALL attempts: a re-rolled call was still billed.

    `response_format=json_object` is best-effort across routed models: the response
    still comes back truncated or fenced-wrong often enough to have killed a live run,
    and a parse failure here aborts the whole job. So re-roll the CALL (temperature > 0
    gives fresh output each attempt). Only JSONDecodeError retries -- a network or API
    error is not made better by asking three times, just slower.
    """
    last = None
    cost = 0.0
    for _ in range(max(1, attempts)):
        resp = client.chat.completions.create(
            model=config.TEXT_MODEL,
            temperature=config.TEXT_TEMPERATURE if temperature is None else temperature,
            response_format={"type": "json_object"},
            extra_body={"usage": {"include": True}},   # return usage.cost / cost_details
            messages=[{"role": "system", "content": system},
                      {"role": "user", "content": user}],
        )
        cost += ledger.response_cost(resp)  # every attempt is billed, parse or not
        text = (resp.choices[0].message.content or "").strip()
        if text.startswith("```"):
            text = text.strip("`")
            text = text[text.find("{"):text.rfind("}") + 1]
        try:
            return json.loads(text), cost
        except json.JSONDecodeError as e:
            last = e
    # ponytail: total-failure path still leaks `cost` (all attempts were billed) — ledgering it
    # would thread cost onto the exception through 10 call sites. Rare (json_object almost always
    # parses); log so it's observable instead of silent. Full fix tracked in ship-checklist §9.
    logging.getLogger(__name__).warning(
        "chat_json exhausted %d attempts on malformed JSON; $%.4f billed but unledgered",
        max(1, attempts), cost)
    raise last


def vision_user(summary: str, image_paths: list[str], instruction: str):
    """A multimodal user message: the summary text plus real winning-ad images so the
    brain grounds its answer in what actually converts (palette/style/product)."""
    import base64
    parts = [{"type": "text", "text": f"{instruction}\n\n{summary}"}]
    for p in (image_paths or [])[:6]:
        data = base64.b64encode(Path(p).read_bytes()).decode()
        parts.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{data}"}})
    return parts
