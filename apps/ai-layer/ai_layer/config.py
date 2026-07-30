"""Central config for the ai-layer package: env + paths.

Locally it reads the repo-root `.env` (walks up the tree to find it). In production
these values come from real environment variables set by the deploy; nothing here
hardcodes a secret. This is the single place env is read, so Phase 4 (per-user
tokens, proper secrets) changes only this module.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

PKG_DIR = Path(__file__).resolve().parent     # .../apps/ai-layer/ai_layer
APP_DIR = PKG_DIR.parent                       # .../apps/ai-layer
DATA_DIR = APP_DIR / "data"


def _find_env() -> Path | None:
    """Walk up from this file to find a .env (repo root, locally)."""
    for parent in Path(__file__).resolve().parents:
        cand = parent / ".env"
        if cand.exists():
            return cand
    return None


_env = _find_env()
if _env:
    load_dotenv(_env)

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
META_ACCESS_TOKEN = os.getenv("META_ACCESS_TOKEN")
APIFY_TOKEN = os.getenv("APIFY_TOKEN")

# Service auth: callers must send this as the X-API-Key header. If unset (local dev),
# the API leaves auth OPEN (and warns). Set it in any real deploy.
AI_LAYER_API_KEY = os.getenv("AI_LAYER_API_KEY")
# SQLite store location (Phase 3). Overridable for tests / alt deploys.
STORE_DB_PATH = Path(os.getenv("AI_LAYER_STORE_PATH", str(DATA_DIR / "store.sqlite")))
