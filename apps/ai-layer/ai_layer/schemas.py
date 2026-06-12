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
    full: bool = True


class ChatResponse(BaseModel):
    account_id: str
    answer: str
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
