"""Pydantic response/request models for the ai-layer HTTP API (Phase 2).

We return our own rich models AND `AiInsight` cards (mirroring `@cosmisk/types`)
so `apps/web` can render cards while richer analytical/chat output isn't cramped.
"""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class AccountInfo(BaseModel):
    account_id: str
    name: str
    currency: str
    status: int


class Totals(BaseModel):
    spend: float
    revenue: float
    blended_roas: float
    purchases: int
    campaigns: int


class InsightStatement(BaseModel):
    tag: str
    text: str


class DailyPoint(BaseModel):
    date: str
    spend: float
    revenue: float
    roas: float


class AiInsight(BaseModel):
    """Mirrors @cosmisk/types AiInsight so apps/web can render the cards."""
    id: str
    priority: str                    # alert | positive | pattern | info
    title: str
    description: str
    actionLabel: str = ""
    actionRoute: str = ""
    actionType: Optional[str] = None
    actionPayload: Optional[dict[str, Any]] = None
    creativeId: Optional[str] = None
    createdAt: str


class InsightsResponse(BaseModel):
    account_id: str
    account_name: str
    currency: str
    window: dict[str, Optional[str]]
    source: str                      # live | store
    totals: Totals
    statements: list[InsightStatement]
    cards: list[AiInsight]
    daily: list[DailyPoint]


class ChatRequest(BaseModel):
    account_id: str
    message: str
    history: Optional[list[dict[str, str]]] = None
    source: str = "store"            # store | live
    # 'full' (default, as before) sends every per-(campaign x date) row; 'summary' is
    # the opt-in lean mode -- pre-computed aggregates only (~6x fewer tokens, cheaper
    # + faster). The web UI toggles this via a button; default stays 'full'.
    context_mode: str = "full"       # full | summary
    # Reuse a session's cached snapshot across turns (build once, stable prefix ->
    # Gemini implicit-cache discount on turns 2+). Omit on the first turn; echo back
    # the value returned in ChatResponse on subsequent turns.
    session_id: Optional[str] = None
    # Deprecated alias: full=True forces context_mode='full' (back-compat).
    full: Optional[bool] = None


class ChatResponse(BaseModel):
    account_id: str
    answer: str
    model: str
    cost_usd: float
    session_id: str                  # reuse this on the next turn to hit the cache
    context_mode: str                # the mode actually used (summary | full)
    cached: bool                     # True if the snapshot came from the session cache


class CompleteRequest(BaseModel):
    """Generic LLM completion (non-RAG). The TS tabs (competitor-spy, autopilot,
    morning-briefing) route their LLM work through this so all OpenRouter/Gemini
    usage + cost stays in the Python layer."""
    messages: list[dict[str, str]]        # OpenAI-style [{role, content}, ...]
    system: Optional[str] = None          # prepended as a system message
    max_tokens: int = 1024
    temperature: float = 0.7
    operation: str = "complete"           # ledger label
    account: Optional[str] = None         # ledger attribution (e.g. the caller's user id)


class CompleteResponse(BaseModel):
    text: str
    model: str
    cost_usd: float


class IngestResult(BaseModel):
    account_id: str
    rows_upserted: int
    since: Optional[str] = None
    until: Optional[str] = None


class CostResponse(BaseModel):
    account_id: Optional[str] = None
    total_usd: float
