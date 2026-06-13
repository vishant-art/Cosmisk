"""Session context cache for the chat RAG.

The chat injects a data snapshot into the system prompt every turn. Rebuilding it
(store/live fetch + pandas aggregation) per turn is wasteful, and re-sending a
*different* prefix each turn defeats Gemini 2.5's implicit prompt caching -- which
needs a byte-identical >=1024-token prefix, with the varying part (the user's
question) pushed to the end (OpenRouter docs, June 2026). So we build the snapshot
ONCE per chat session, cache it keyed by session_id, and reuse it verbatim:

  - faster: no per-turn refetch + re-aggregation
  - cheaper: the system prefix is identical every turn -> implicit cache discount
    on turns 2+ (OpenRouter sticky-routes follow-ups to the same provider to keep
    the cache warm)

In-memory + per-process: fine for the single-worker uvicorn deploy. For a
multi-worker / horizontally-scaled deploy, back this with the SQLite store or Redis
(the key + value shape below stays the same).
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass

# A session's snapshot is stable for the session; 30 min bounds staleness (the
# underlying store refreshes out of band via /ingest) and is plenty for a chat.
TTL_SECONDS = 30 * 60
# Simple bound so a long-lived process can't grow unboundedly.
MAX_ENTRIES = 500


@dataclass
class _Entry:
    context: str
    account_id: str
    mode: str
    built_at: float


_cache: dict[str, _Entry] = {}


def new_session_id() -> str:
    return uuid.uuid4().hex


def get(session_id: str | None, account_id: str, mode: str) -> str | None:
    """Return the cached snapshot for this session, or None to rebuild.

    A change of account or mode within the same session id forces a rebuild, so a
    stale/mismatched snapshot is never served."""
    if not session_id:
        return None
    e = _cache.get(session_id)
    if e is None:
        return None
    if e.account_id != account_id or e.mode != mode:
        return None
    if (time.time() - e.built_at) > TTL_SECONDS:
        _cache.pop(session_id, None)
        return None
    return e.context


def put(session_id: str, account_id: str, mode: str, context: str) -> None:
    _evict_expired()
    if len(_cache) >= MAX_ENTRIES:
        oldest = min(_cache, key=lambda k: _cache[k].built_at)
        _cache.pop(oldest, None)
    _cache[session_id] = _Entry(
        context=context, account_id=account_id, mode=mode, built_at=time.time()
    )


def _evict_expired() -> None:
    now = time.time()
    for k in [k for k, e in _cache.items() if now - e.built_at > TTL_SECONDS]:
        _cache.pop(k, None)


def clear() -> None:
    """Test helper: drop all entries."""
    _cache.clear()
