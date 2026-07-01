"""Google Ads connector — fully fault-isolated and optional.

Graceful degradation (the user's requirement): the funnel only builds this when ALL Google
creds are present (else `skipped`). If the token is present but the API declines (unapproved
developer token, auth error, lib missing), `fetch_facts` raises → the funnel logs it and marks
Google `failed`, and the snapshot still returns Meta+Shopify. Add valid creds and Google
**auto-activates** — no code change.

`google-ads` is a heavy gRPC dep, lazy-imported, and the search call is injectable so the suite
runs with zero network and without the library installed.
"""
from __future__ import annotations

import asyncio

from ..config import GoogleCredentials, Settings
from ..contract import AssetRecord, ConnectorStatus, DateWindow, UnifiedFact
from . import normalize as nz


class GoogleConnector:
    platform = "google"

    def __init__(self, creds: GoogleCredentials, settings: Settings, searcher=None):
        self.creds = creds
        self.settings = settings
        # Injectable seam: (customer_id, query) -> list[dict]. Real path used when None.
        self._searcher = searcher

    def _build_client(self):
        from google.ads.googleads.client import GoogleAdsClient  # lazy (heavy gRPC)
        cfg = {
            "developer_token": self.creds.developer_token,
            "client_id": self.creds.client_id,
            "client_secret": self.creds.client_secret,
            "refresh_token": self.creds.refresh_token,
            "use_proto_plus": True,
        }
        if self.creds.login_customer_id:
            cfg["login_customer_id"] = self.creds.login_customer_id
        return GoogleAdsClient.load_from_dict(cfg)

    def _search_blocking(self, query: str) -> list[dict]:
        client = self._build_client()
        svc = client.get_service("GoogleAdsService")
        rows: list[dict] = []
        for batch in svc.search_stream(customer_id=self.creds.customer_id, query=query):
            for r in batch.results:
                rows.append({
                    "campaign_id": r.campaign.id,
                    "campaign_name": r.campaign.name,
                    "date": r.segments.date,
                    "currency_code": r.customer.currency_code,
                    "cost_micros": r.metrics.cost_micros,
                    "impressions": r.metrics.impressions,
                    "clicks": r.metrics.clicks,
                    "conversions": r.metrics.conversions,
                    "conversions_value": r.metrics.conversions_value,
                })
        return rows

    async def _search(self, query: str) -> list[dict]:
        if self._searcher is not None:
            res = self._searcher(self.creds.customer_id, query)
            return await res if asyncio.iscoroutine(res) else res
        # Real gRPC client is sync/blocking → run off the event loop.
        return await asyncio.to_thread(self._search_blocking, query)

    async def health(self) -> ConnectorStatus:
        try:
            await self._search("SELECT customer.id FROM customer LIMIT 1")
            return ConnectorStatus(platform=self.platform, state="ok")
        except Exception as e:  # noqa: BLE001 -- report, never raise from health
            return ConnectorStatus(platform=self.platform, state="failed", detail=str(e)[:200])

    async def fetch_facts(self, account_id: str | None, window: DateWindow) -> list[UnifiedFact]:
        query = nz.GAQL_CAMPAIGN_DAILY.format(since=window.since, until=window.until)
        rows = await self._search(query)
        return nz.rows_to_facts(rows, account_id or self.creds.customer_id)

    async def fetch_assets(self, account_id: str | None, top_n: int) -> list[AssetRecord]:
        # Google image-asset retrieval (AssetService) is a documented follow-up; many Google
        # campaigns are text/search with no downloadable creative. Returns [] for now so the
        # funnel composes cleanly.
        return []
