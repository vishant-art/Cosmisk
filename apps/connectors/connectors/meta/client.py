"""Meta Ads connector — async port of meta_live (paginated insights) + meta_creatives
(winning-ad asset retrieval). Network goes through `base.Http` (injectable for $0 tests).
"""
from __future__ import annotations

from pathlib import Path

from ..base import Http
from ..config import MetaCredentials, Settings
from ..contract import AssetRecord, ConnectorStatus, DateWindow, UnifiedFact
from . import normalize as nz

AD_FIELDS = ["ad_id", "ad_name", "spend", "impressions",
             "purchase_roas", "website_purchase_roas", "actions"]
CREATIVE_FIELDS = ("name,creative{id,image_url,image_hash,thumbnail_url,video_id,"
                   "object_story_spec,asset_feed_spec,effective_object_story_id}")


class MetaConnector:
    platform = "meta"

    def __init__(self, creds: MetaCredentials, settings: Settings, http: Http | None = None):
        self.creds = creds
        self.settings = settings
        # Meta BUC limits are per-account; a modest steady rate with burst.
        self.http = http or Http(settings=settings, rate=5.0)
        self._base = f"https://graph.facebook.com/{creds.api_version}"

    def _acct(self, account_id: str | None) -> str:
        acct = account_id or self.creds.ad_account_id
        if not acct:
            raise ValueError("no Meta ad account id (set META_AD_ACCOUNT_ID or BrandRef.meta_account_id)")
        return acct

    async def _get(self, path: str, params: dict) -> dict:
        return await self.http.get_json(f"{self._base}/{path}",
                                        params={**params, "access_token": self.creds.access_token})

    async def health(self) -> ConnectorStatus:
        acct = self._acct(None)
        await self._get(acct, {"fields": "account_id,name,currency"})
        return ConnectorStatus(platform=self.platform, state="ok")

    async def _insights_paged(self, account: str, params: dict, max_rows=5000) -> list[dict]:
        rows: list[dict] = []
        body = await self._get(f"{account}/insights", params)
        while True:
            rows.extend(body.get("data", []))
            nxt = body.get("paging", {}).get("next")
            if not nxt or len(rows) >= max_rows:
                break
            body = await self.http.get_json(nxt)   # `next` carries token + cursor
        return rows[:max_rows]

    async def fetch_facts(self, account_id: str | None, window: DateWindow) -> list[UnifiedFact]:
        acct = self._acct(account_id)
        import json
        rows = await self._insights_paged(acct, {
            "level": "campaign",
            "fields": ",".join(nz.INSIGHT_FIELDS),
            "action_attribution_windows": json.dumps(nz.ATTRIBUTION_WINDOWS),
            "time_range": json.dumps({"since": window.since, "until": window.until}),
            "time_increment": 1,
            "limit": 500,
        })
        return [nz.row_to_fact(r, acct) for r in rows]

    # --- assets (winning creatives) ------------------------------------------

    @staticmethod
    def _rank(rows, top_n):
        best: dict[str, tuple[str, float]] = {}
        for r in rows:
            aid = r.get("ad_id")
            if not aid:
                continue
            roas = 0.0
            for key in ("purchase_roas", "website_purchase_roas"):
                arr = r.get(key) or []
                if arr:
                    try:
                        roas = max(roas, float(arr[0].get("value") or 0))
                    except (TypeError, ValueError, AttributeError):
                        pass
            name, prev = best.get(aid, (r.get("ad_name", "?"), 0.0))
            best[aid] = (r.get("ad_name", name), max(prev, roas))
        ranked = sorted(((a, n, ro) for a, (n, ro) in best.items()),
                        key=lambda t: t[2], reverse=True)
        return ranked[:top_n]

    @staticmethod
    def _image_urls(creative: dict) -> list[str]:
        urls = []
        if creative.get("image_url"):
            urls.append(creative["image_url"])
        ld = (creative.get("object_story_spec") or {}).get("link_data") or {}
        if ld.get("picture"):
            urls.append(ld["picture"])
        for ch in ld.get("child_attachments") or []:
            if ch.get("picture"):
                urls.append(ch["picture"])
        for im in (creative.get("asset_feed_spec") or {}).get("images") or []:
            if im.get("url"):
                urls.append(im["url"])
        return list(dict.fromkeys(urls))

    async def fetch_assets(self, account_id: str | None, top_n: int) -> list[AssetRecord]:
        acct = self._acct(account_id)
        import json
        rows = await self._insights_paged(acct, {
            "level": "ad", "fields": ",".join(AD_FIELDS),
            "date_preset": "last_30d", "limit": 200,
        }, max_rows=2000)
        out_dir = Path(self.settings.asset_dir) / "meta"
        assets: list[AssetRecord] = []
        for i, (ad_id, ad_name, roas) in enumerate(self._rank(rows, top_n), 1):
            body = await self._get(ad_id, {"fields": CREATIVE_FIELDS})
            creative = body.get("creative", {}) or {}
            urls = self._image_urls(creative)
            local = None
            if urls:
                try:
                    local = await self.http.download(urls[0], out_dir / f"winner_{i:02d}.png")
                except Exception:  # noqa: BLE001 -- a single bad asset never sinks the set
                    local = None
            assets.append(AssetRecord(platform="meta", entity_id=ad_id, entity_name=ad_name,
                                      kind="image", local_path=local,
                                      durable_ref=creative.get("image_hash"), roas=roas))
        return assets
