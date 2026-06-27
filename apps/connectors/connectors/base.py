"""Shared connector machinery: the `Connector` interface, a per-connector async HTTP client
with rate-limiting + backoff, a circuit breaker, and a host-allowlisted asset downloader.

Today's TS connectors have almost no rate-limit/backoff handling; this is where we centralize
it so every platform is resilient and no single one can stall or hammer. Network goes through
`Http`, which tests replace with a fake (the `meta_creatives._api`/`_download` seam pattern).
"""
from __future__ import annotations

import asyncio
import logging
import time
from pathlib import Path
from typing import Protocol, runtime_checkable
from urllib.parse import urlparse

from .config import Settings
from .contract import AssetRecord, ConnectorStatus, DateWindow, UnifiedFact

logger = logging.getLogger("connectors")


@runtime_checkable
class Connector(Protocol):
    platform: str
    async def health(self) -> ConnectorStatus: ...
    async def fetch_facts(self, account_id: str | None, window: DateWindow) -> list[UnifiedFact]: ...
    async def fetch_assets(self, account_id: str | None, top_n: int) -> list[AssetRecord]: ...


class RateLimiter:
    """Token bucket: at most `rate` ops/sec, burst up to `capacity`. One per connector so a
    throttled platform never blocks the others."""

    def __init__(self, rate: float, capacity: float | None = None) -> None:
        self.rate = rate
        self.capacity = capacity if capacity is not None else max(1.0, rate)
        self._tokens = self.capacity
        self._updated = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            self._tokens = min(self.capacity, self._tokens + (now - self._updated) * self.rate)
            self._updated = now
            if self._tokens < 1.0:
                await asyncio.sleep((1.0 - self._tokens) / self.rate)
                self._tokens = 0.0
                self._updated = time.monotonic()    # don't let the wait refill the next op
            else:
                self._tokens -= 1.0


class CircuitBreaker:
    """Opens after N consecutive failures so we stop hammering a down API within a run."""

    def __init__(self, threshold: int) -> None:
        self.threshold = threshold
        self._fails = 0

    @property
    def is_open(self) -> bool:
        return self._fails >= self.threshold

    def record_success(self) -> None:
        self._fails = 0

    def record_failure(self) -> None:
        self._fails += 1


def host_allowed(url: str, allowlist) -> bool:
    """Suffix-match the URL host against the allowlist (SSRF guard for asset downloads)."""
    host = (urlparse(url).hostname or "").lower()
    return any(host == h or host.endswith("." + h) for h in allowlist)


class Http:
    """Thin async HTTP with per-connector rate-limit + retry/backoff on 429/5xx and an
    allowlisted, size-capped downloader. Lazy-imports httpx so the module tree imports with
    nothing installed (tests inject a fake instead)."""

    def __init__(self, *, settings: Settings, rate: float = 5.0, retries: int = 3) -> None:
        self.settings = settings
        self.retries = retries
        self.limiter = RateLimiter(rate)
        self._client = None

    async def _ensure(self):
        if self._client is None:
            import httpx  # lazy
            self._client = httpx.AsyncClient(timeout=self.settings.timeout_s)
        return self._client

    async def aclose(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def get_with_headers(self, url: str, *, params=None, headers=None) -> tuple[dict, dict]:
        """GET returning (json, response_headers) — needed for Shopify Link-header pagination."""
        import httpx  # lazy
        client = await self._ensure()
        for attempt in range(self.retries + 1):
            await self.limiter.acquire()
            resp = await client.get(url, params=params, headers=headers)
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < self.retries:
                wait = 2.0 ** attempt
                logger.warning("[http] %s on %s; backoff %.1fs", resp.status_code, url, wait)
                await asyncio.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json(), dict(resp.headers)
        raise httpx.HTTPError(f"exhausted retries for {url}")  # pragma: no cover

    async def get_json(self, url: str, *, params=None, headers=None) -> dict:
        data, _ = await self.get_with_headers(url, params=params, headers=headers)
        return data

    async def download(self, url: str, dest: Path) -> str:
        """Download an asset to `dest` after allowlist + size checks. Returns the path."""
        if not host_allowed(url, self.settings.asset_host_allowlist):
            raise ValueError(f"asset host not allowlisted: {urlparse(url).hostname}")
        client = await self._ensure()
        await self.limiter.acquire()
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.content
        if len(data) > self.settings.asset_max_bytes:
            raise ValueError(f"asset exceeds {self.settings.asset_max_bytes} bytes")
        dest = Path(dest)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return str(dest)
