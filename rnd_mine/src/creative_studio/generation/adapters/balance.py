# src/creative_studio/generation/adapters/balance.py
"""Live fal credit-balance read, via the admin key (FAL_ADMIN_KEY).

Ported from `apps/ai-layer/ai_layer/creative/fal_billing.py::balance()` --
`apps/ai-layer/tools/creative_api_liverun.py` itself has no raw balance HTTP
call; its `preflight()` just calls `fal_billing.balance()` (wrapped in a
broad try/except that degrades to `None` on any failure, per its comment
"balance read failed"). That broad-except, always-degrade posture is
reproduced here directly rather than in the caller, since this reader has
exactly one caller-facing contract: return a float, or None, never raise.

FAL_KEY (render) and FAL_ADMIN_KEY (billing) are a deliberate two-key split
-- this module is the ONLY place the admin key is read; `base.FalAdapter`
never touches it.

Endpoint (fal Platform API, verified 2026-07 against a live account, per
fal_billing.py's own header comment):
  GET /v1/account/billing?expand=credits -> {credits: {current_balance, currency}}
"""
from __future__ import annotations

import logging

import httpx

logger = logging.getLogger("creative_studio.generation")

_BASE = "https://api.fal.ai"


def read_balance(settings) -> float | None:
    """Current fal credit balance in USD, or None if unavailable.

    Returns `None` immediately (no network call) when `settings.fal_admin_key`
    is empty. Advisory only: any failure (network error, non-200 response, or
    an unexpected body shape) is logged as a warning and swallowed -- a
    balance read must never block or crash a caller.
    """
    admin_key = (settings.fal_admin_key or "").strip()
    if not admin_key:
        return None

    try:
        response = httpx.get(
            f"{_BASE}/v1/account/billing",
            headers={"Authorization": f"Key {admin_key}"},
            params={"expand": "credits"},
            timeout=30.0,
        )
        if response.status_code != 200:
            logger.warning("fal balance read failed: HTTP %s", response.status_code)
            return None
        body = response.json()
        if not isinstance(body, dict):
            logger.warning("fal balance read failed: unexpected body shape (expected dict, got %s)", type(body).__name__)
            return None
        value = (body.get("credits") or {}).get("current_balance")
        if value is not None:
            return float(value)
        return None
    except Exception as exc:  # advisory read, never blocks a caller
        logger.warning("fal balance read failed: %s", exc)
        return None
