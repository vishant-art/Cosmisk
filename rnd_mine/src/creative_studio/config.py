from __future__ import annotations
import shutil
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlencode, urlparse, parse_qsl, urlunparse
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(REPO_ROOT / ".env"), extra="ignore")
    openrouter_api_key: str
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    creative_studio_planner_model: str = "openai/gpt-5.4-mini"  # verified in Task 12
    fal_key: str
    fal_admin_key: str = ""
    shopify_store: str
    shopify_token: str
    shopify_api_version: str = "2026-07"
    meta_access_token: str = ""
    meta_ad_account: str = ""
    database_url: str
    migration_database_url: str
    storage_endpoint: str
    storage_access_key_id: str
    storage_secret_access_key: str
    storage_bucket: str
    storage_region: str = "auto"

    @field_validator("*", mode="before")
    @classmethod
    def _strip(cls, v):
        return v.strip() if isinstance(v, str) else v

def asyncpg_dsn(raw: str) -> str:
    parts = urlparse(raw)
    q = [(k, v) for k, v in parse_qsl(parts.query) if k != "channel_binding"]
    return urlunparse(parts._replace(query=urlencode(q)))

def require_ffmpeg() -> None:
    for exe in ("ffmpeg", "ffprobe"):
        if shutil.which(exe) is None:
            raise RuntimeError(f"{exe} not found on PATH; install ffmpeg (winget install Gyan.FFmpeg)")

@lru_cache
def get_settings() -> Settings:
    return Settings()
