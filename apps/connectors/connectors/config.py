"""Credentials + settings, sourced from `.env` locally or environment variables in prod
(Railway injects them — same code path). A platform whose required vars are missing yields
`None`, which the funnel treats as `skipped` — never an error.
"""
from __future__ import annotations

import os
from pathlib import Path

from pydantic import BaseModel

try:  # load repo-root .env if present; harmless when absent (prod uses real env vars)
    from dotenv import find_dotenv, load_dotenv
    load_dotenv(find_dotenv(usecwd=True))
except Exception:  # noqa: BLE001 -- dotenv is best-effort
    pass


def _env(key: str) -> str | None:
    v = os.getenv(key)
    return v.strip() if v and v.strip() else None


class MetaCredentials(BaseModel):
    access_token: str
    ad_account_id: str | None = None
    api_version: str = "v23.0"


class ShopifyCredentials(BaseModel):
    shop_domain: str
    admin_token: str
    api_version: str = "2024-10"


class GoogleCredentials(BaseModel):
    developer_token: str
    client_id: str
    client_secret: str
    refresh_token: str
    customer_id: str
    login_customer_id: str | None = None


class Settings(BaseModel):
    timeout_s: float = 30.0             # hard per-connector deadline
    max_concurrency: int = 8            # per-connector in-flight cap (asset downloads etc.)
    circuit_breaker_threshold: int = 5  # consecutive failures before a connector short-circuits
    asset_dir: Path = Path("./connector_assets")
    asset_max_bytes: int = 50 * 1024 * 1024
    asset_host_allowlist: tuple[str, ...] = (
        "fbcdn.net", "cdninstagram.com",          # Meta
        "cdn.shopify.com", "myshopify.com",        # Shopify
        "googleusercontent.com", "ggpht.com",      # Google
    )


def get_meta_creds() -> MetaCredentials | None:
    token = _env("META_ACCESS_TOKEN")
    if not token:
        return None
    return MetaCredentials(access_token=token, ad_account_id=_env("META_AD_ACCOUNT_ID"))


def get_shopify_creds() -> ShopifyCredentials | None:
    domain, token = _env("SHOPIFY_SHOP_DOMAIN"), _env("SHOPIFY_ADMIN_TOKEN")
    if not (domain and token):
        return None
    return ShopifyCredentials(shop_domain=domain, admin_token=token)


def get_google_creds() -> GoogleCredentials | None:
    """Returns None (→ Google `skipped`) unless ALL required vars are present. Adding them
    later auto-activates Google with no code change."""
    req = {
        "developer_token": _env("GOOGLE_ADS_DEVELOPER_TOKEN"),
        "client_id": _env("GOOGLE_ADS_CLIENT_ID"),
        "client_secret": _env("GOOGLE_ADS_CLIENT_SECRET"),
        "refresh_token": _env("GOOGLE_ADS_REFRESH_TOKEN"),
        "customer_id": _env("GOOGLE_ADS_CUSTOMER_ID"),
    }
    if not all(req.values()):
        return None
    return GoogleCredentials(login_customer_id=_env("GOOGLE_ADS_LOGIN_CUSTOMER_ID"), **req)


def get_settings() -> Settings:
    s = Settings()
    if (t := _env("CONNECTOR_TIMEOUT_S")):
        s.timeout_s = float(t)
    if (d := _env("CONNECTOR_ASSET_DIR")):
        s.asset_dir = Path(d)
    return s
