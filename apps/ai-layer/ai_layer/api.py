"""Phase 2/4 -- FastAPI service over the ai-layer.

Endpoints (all but /health require the X-API-Key header when AI_LAYER_API_KEY is set):
  GET  /health                      liveness
  GET  /accounts                    ad accounts for the caller's Meta token
  GET  /insights/{account_id}       deterministic brain statements + AiInsight cards + chart data
  POST /chat                        grounded analytical answer (RAG)
  POST /ingest/{account_id}         trailing-window UPSERT into the store
  GET  /cost                        ledger total (optionally per-account)

Auth model (Phase 4): callers authenticate with a shared **X-API-Key**; the user's
Meta token is passed per-request via **X-Meta-Token** (falls back to env for local
dev). The service is stateless on tokens and never touches the encrypted token DB.

Run:  uvicorn ai_layer.api:app --reload
"""
from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.responses import StreamingResponse
from openai import OpenAI

from ai_layer import brain, chat, config, context_cache, cost_ledger, store
from ai_layer import meta_live as ml
from ai_layer import meta_transform as mt
from ai_layer.schemas import (AccountInfo, AiInsight, BlendedBlock, BlendedResponse,
                              ChatRequest, ChatResponse, CompleteRequest,
                              CompleteResponse, CostResponse, DailyPoint,
                              IngestResult, InsightsResponse, InsightStatement,
                              PlatformStatus, Totals)

app = FastAPI(title="cosmisk ai-layer", version="0.1.0")

# brain tag -> AiInsight priority
_PRIORITY = {
    "WARN fatigue": "alert", "Wasted spend": "alert", "Bad day": "alert",
    "UP scaling": "positive", "Best campaign": "positive",
    "Trend": "pattern", "Budget concentration": "pattern", "Worst campaign": "pattern",
    "Overview": "info",
}


# ---- auth / token dependencies -------------------------------------------

def require_api_key(x_api_key: str | None = Header(None, alias="X-API-Key")) -> None:
    """Enforce the service API key when configured; open in local dev (no key set)."""
    if config.AI_LAYER_API_KEY and x_api_key != config.AI_LAYER_API_KEY:
        raise HTTPException(status_code=401, detail="invalid or missing X-API-Key")


# Fail CLOSED on deploys: with no AI_LAYER_API_KEY the guard above is a no-op and the whole
# API — including /complete (arbitrary LLM completion billed to our OpenRouter account) —
# serves unauthenticated. Railway injects RAILWAY_ENVIRONMENT_NAME into every deploy, so a
# deploy that forgot the key dies HERE at import (healthcheck never goes green, the previous
# release stays up) instead of running open; local dev and tests have no Railway env, so the
# open-when-unset behaviour they rely on is unchanged.
if not config.AI_LAYER_API_KEY and (
        os.getenv("RAILWAY_ENVIRONMENT_NAME") or os.getenv("RAILWAY_ENVIRONMENT")):
    raise RuntimeError("AI_LAYER_API_KEY unset in a Railway deploy — refusing to boot open")


def caller_token(x_meta_token: str | None = Header(None, alias="X-Meta-Token")) -> str | None:
    """The user's Meta token, per request; env fallback for local dev. May be None
    (only needed for live fetches)."""
    return x_meta_token or config.META_ACCESS_TOKEN


def caller_brand(x_brand_id: str | None = Header(None, alias="X-Brand-Id")) -> str | None:
    """Optional tenant brand id (structural multi-tenancy). When absent, repositories
    default brand_id = account_id. Full per-brand credential resolution lands with #34."""
    return x_brand_id


def _need_token(token: str | None) -> str:
    if not token:
        raise HTTPException(status_code=400,
                            detail="no Meta token (send X-Meta-Token or set META_ACCESS_TOKEN)")
    return token


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _cards(statements) -> list[AiInsight]:
    now = _now()
    return [AiInsight(id=str(uuid.uuid4()), priority=_PRIORITY.get(tag, "info"),
                      title=tag, description=text, createdAt=now)
            for tag, text in statements]


def _connector_dataset(account_id: str, preset: str) -> mt.Dataset:
    """Lazy import: the cosmisk-connectors package is optional until the image
    bundles it (build-context change); absent -> a clean 503, never an ImportError
    at module load."""
    try:
        from ai_layer import connector_source
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="connectors package not installed — pip install -e apps/connectors",
        ) from exc
    return connector_source.fetch_connector_dataset(account_id, preset)


def _dataset(account_id: str, source: str, token: str | None, preset: str) -> mt.Dataset:
    """source='store' reads the accumulated store (falls back to live if empty);
    source='live' always fetches fresh; source='connectors' adapts the
    cross-platform connector snapshot (opt-in, no store writes)."""
    if source == "connectors":
        return _connector_dataset(account_id, preset)
    if source == "store":
        ds = store.load_dataset(account_id)
        if len(ds) > 0:
            return ds
    return ml.fetch_dataset(_need_token(token), account=account_id, preset=preset)


# ---- endpoints ------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "ok", "version": app.version, "auth": bool(config.AI_LAYER_API_KEY)}


@app.get("/accounts", response_model=list[AccountInfo], dependencies=[Depends(require_api_key)])
def accounts(token: str | None = Depends(caller_token)):
    accts = ml.list_accounts(_need_token(token))
    return [AccountInfo(account_id=f"act_{a['account_id']}", name=a.get("name", "?"),
                        currency=a.get("currency", "?"), status=a.get("account_status", 0))
            for a in accts]


@app.get("/insights/{account_id}", response_model=InsightsResponse,
         dependencies=[Depends(require_api_key)])
def insights(account_id: str, source: str = Query("store"),
             preset: str = Query("last_30d"), token: str | None = Depends(caller_token)):
    ds = _dataset(account_id, source, token, preset)
    if len(ds) == 0:
        raise HTTPException(status_code=404, detail="no data for this account/window")
    df = ds.to_dataframe()
    stmts = brain.statements(df, ds.currency)
    daily = mt.daily_totals(df)
    spend, rev = float(df.spend.sum()), float(df.revenue.sum())
    return InsightsResponse(
        account_id=account_id, account_name=ds.account_name, currency=ds.currency,
        window={"since": ds.since, "until": ds.until}, source=ds.source,
        totals=Totals(spend=spend, revenue=rev,
                      blended_roas=(rev / spend if spend else 0.0),
                      purchases=int(df.purchases.sum()), campaigns=int(df.campaign_name.nunique())),
        statements=[InsightStatement(tag=t, text=x) for t, x in stmts],
        cards=_cards(stmts),
        daily=[DailyPoint(date=str(r.date.date()), spend=float(r.spend),
                          revenue=float(r.revenue), roas=float(r.roas))
               for _, r in daily.iterrows()])


def _chat_messages(req: ChatRequest, token: str | None):
    """Shared by /chat and /chat/stream: resolve mode + session-cached snapshot and
    assemble the OpenAI message list. Returns (messages, session_id, mode, cached)."""
    # context_mode wins; legacy full=True forces 'full'.
    mode = "full" if req.full else req.context_mode
    if mode not in ("summary", "full"):
        mode = "summary"
    # Session cache: build the snapshot once, reuse it byte-identical across turns
    # (skips refetch/rebuild; stable prefix -> Gemini implicit-cache discount).
    session_id = req.session_id or context_cache.new_session_id()
    context = context_cache.get(session_id, req.account_id, mode)
    cached = context is not None
    if not cached:
        ds = _dataset(req.account_id, req.source, token, "last_30d")
        if len(ds) == 0:
            raise HTTPException(status_code=404, detail="no data for this account")
        context = chat.build_context(ds, full=(mode == "full"))
        context_cache.put(session_id, req.account_id, mode, context)
    # System (stable, cacheable) prefix first; history + the new question last so the
    # varying part stays at the end (maximizes implicit cache hits).
    messages = [{"role": "system", "content": chat.SYSTEM.format(context=context)}]
    messages += (req.history or [])
    messages.append({"role": "user", "content": req.message})
    return messages, session_id, mode, cached


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_api_key)])
def chat_endpoint(req: ChatRequest, token: str | None = Depends(caller_token)):
    if not config.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")
    messages, session_id, mode, cached = _chat_messages(req, token)
    client = OpenAI(api_key=config.OPENROUTER_API_KEY, base_url=config.OPENROUTER_BASE_URL)
    # per-call cost comes straight from the completion (concurrency-safe; not a global-SUM delta)
    answer, cost = chat.complete(client, messages, stream=False, account=req.account_id)
    cost = round(cost, 6)
    return ChatResponse(account_id=req.account_id, answer=answer, model=chat.MODEL,
                        cost_usd=cost, session_id=session_id, context_mode=mode, cached=cached)


@app.post("/chat/stream", dependencies=[Depends(require_api_key)])
def chat_stream_endpoint(req: ChatRequest, token: str | None = Depends(caller_token)):
    """Same as /chat but streams the answer as plain-text chunks. Session/mode/cached
    are returned as response headers (the body is the answer text)."""
    if not config.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")
    messages, session_id, mode, cached = _chat_messages(req, token)
    client = OpenAI(api_key=config.OPENROUTER_API_KEY, base_url=config.OPENROUTER_BASE_URL)
    headers = {
        "X-Session-Id": session_id,
        "X-Context-Mode": mode,
        "X-Cached": "true" if cached else "false",
        "X-Model": chat.MODEL,
        "Cache-Control": "no-cache",
    }
    return StreamingResponse(
        chat.stream_answer(client, messages, account=req.account_id),
        media_type="text/plain; charset=utf-8",
        headers=headers,
    )


@app.post("/complete", response_model=CompleteResponse, dependencies=[Depends(require_api_key)])
def complete_endpoint(req: CompleteRequest):
    """Generic (non-RAG) LLM completion on OpenRouter/Gemini, recorded to the Python
    ledger. The TS tabs (competitor-spy, autopilot, morning-briefing) call this so all
    OpenRouter usage + cost lives here, not in the TS Anthropic gateway."""
    if not config.OPENROUTER_API_KEY:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY not configured")
    messages = ([{"role": "system", "content": req.system}] if req.system else []) + list(req.messages)
    client = OpenAI(api_key=config.OPENROUTER_API_KEY, base_url=config.OPENROUTER_BASE_URL)
    text, cost = chat.raw_complete(client, messages, max_tokens=req.max_tokens,
                                   temperature=req.temperature, account=req.account, op=req.operation)
    cost = round(cost, 6)
    return CompleteResponse(text=text, model=chat.MODEL, cost_usd=cost)


@app.post("/ingest/{account_id}", response_model=IngestResult, dependencies=[Depends(require_api_key)])
def ingest(account_id: str, preset: str = Query("last_30d"), token: str | None = Depends(caller_token)):
    return IngestResult(**store.ingest(_need_token(token), account_id, preset=preset))


@app.get("/cost", response_model=CostResponse, dependencies=[Depends(require_api_key)])
def cost(account_id: str | None = Query(None), brand: str | None = Depends(caller_brand)):
    # scoped by design: no unscoped global default in the HTTP path (cross-tenant leak).
    if account_id is None and brand is None:
        raise HTTPException(status_code=400, detail="account_id (or X-Brand-Id) required")
    return CostResponse(account_id=account_id,
                        total_usd=cost_ledger.total_usd(account=account_id))


@app.get("/blended/{account_id}", response_model=BlendedResponse,
         dependencies=[Depends(require_api_key)])
def blended(account_id: str, preset: str = Query("last_30d"),
            refresh: bool = Query(False)):
    """Cross-platform blended ROAS (Meta+Google spend vs Shopify revenue truth).
    Served from the shared snapshot cache (CONNECTOR_CACHE_TTL_S, default 1h);
    refresh=true forces a live pull. fetched_at tells the caller the data age."""
    try:
        from ai_layer import connector_source
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="connectors package not installed — pip install -e apps/connectors",
        ) from exc
    snapshot, fetched_at = connector_source.get_cached_snapshot(
        account_id, preset, refresh=refresh)
    if not snapshot.ok_platforms:
        raise HTTPException(status_code=404, detail="no platform contributed data")
    b = snapshot.blended
    return BlendedResponse(
        account_id=account_id,
        window={"since": snapshot.since, "until": snapshot.until},
        fetched_at=fetched_at,
        blended=BlendedBlock(spend=b.spend, revenue_meta_pixel=b.revenue_meta_pixel,
                             revenue_shopify=b.revenue_shopify,
                             blended_roas=b.blended_roas,
                             revenue_gap_pct=b.revenue_gap_pct,
                             currency=b.currency,
                             currency_mismatch=b.currency_mismatch),
        statuses=[PlatformStatus(platform=s.platform, state=s.state, detail=s.detail,
                                 fact_count=s.fact_count, elapsed_ms=s.elapsed_ms,
                                 currency=s.currency) for s in snapshot.statuses],
        ok_platforms=snapshot.ok_platforms,
    )


# ---- Creative Studio (M4 Generative Engine) ------------------------------
# Async generation router + a static mount serving finished assets from the run
# output dir (ephemeral; durable object storage is the deferred DB phase). The
# API-key gate applies to the router; static assets are open for the client to fetch.
from fastapi.staticfiles import StaticFiles  # noqa: E402
from ai_layer.creative import config as _creative_config  # noqa: E402
from ai_layer.creative.service import router as _creative_router  # noqa: E402
from ai_layer import storage as _storage  # noqa: E402

app.include_router(_creative_router, dependencies=[Depends(require_api_key)])
_creative_config.OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/creative/assets",
          StaticFiles(directory=str(_creative_config.OUTPUT_DIR), check_dir=False),
          name="creative-assets")


@app.get("/creative/asset-url/{job_id}/{path:path}",
         dependencies=[Depends(require_api_key)])
def creative_asset_url(job_id: str, path: str):
    """A presigned R2 GET URL for a finished asset. apps/api calls this and 302s the browser
    to the returned URL, so the bytes flow browser<->R2 directly ($0 egress) and apps/api
    never holds R2 creds. 404 when storage is off -> the caller byte-proxies the local copy."""
    # job_id is a uuid4().hex; without this it's a raw R2 key-prefix selector. Don't trust the
    # caller (apps/api) to have validated it — guard the backend boundary too.
    if not re.fullmatch(r"[0-9a-f]{32}", job_id) or ".." in path:
        raise HTTPException(status_code=400, detail="bad path")
    if not _storage.enabled():
        raise HTTPException(status_code=404, detail="storage disabled")
    return {"url": _storage.presign_get(_storage.asset_key(job_id, path))}
