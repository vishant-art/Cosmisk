"""Meta Ads connector — async port of meta_live (paginated insights) + meta_creatives
(winning-ad asset retrieval). Network goes through `base.Http` (injectable for $0 tests).
"""
from __future__ import annotations

import logging
from pathlib import Path

from ..base import Http
from ..config import MetaCredentials, Settings
from ..contract import AssetRecord, ConnectorStatus, DateWindow, UnifiedFact
from . import normalize as nz

logger = logging.getLogger("connectors.meta")

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

    @staticmethod
    def _deep_find(obj, key: str):
        """First value for `key` anywhere in a nested dict/list (Meta nests video_id under
        video_data / template_data / link_data / child_attachments depending on format)."""
        stack = [obj]
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                if cur.get(key):
                    return cur[key]
                stack.extend(cur.values())
            elif isinstance(cur, list):
                stack.extend(cur)
        return None

    @staticmethod
    def _deep_collect(obj, keys: set[str]) -> list[str]:
        """Every http(s) string under any of `keys`, anywhere in the spec."""
        out, stack = [], [obj]
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                for k, v in cur.items():
                    if k in keys and isinstance(v, str) and v.startswith("http"):
                        out.append(v)
                    stack.append(v)
            elif isinstance(cur, list):
                stack.extend(cur)
        return out

    @staticmethod
    def _video_id(creative: dict) -> str | None:
        """A creative is a video ad if a video_id appears anywhere in its spec."""
        return MetaConnector._deep_find(creative, "video_id")

    @staticmethod
    def _thumb_urls(creative: dict) -> list[str]:
        """Still-frame previews for a video creative. Prefer full-size stills (picture/image_url,
        VLM-usable); the top-level thumbnail_url is a 64x64 crop, used only as a last resort."""
        full = MetaConnector._deep_collect(creative, {"image_url", "picture"})
        thumb = [creative["thumbnail_url"]] if creative.get("thumbnail_url") else []
        return list(dict.fromkeys(full + thumb))

    async def _resolve_video_source(self, video_id: str) -> str | None:
        """The mp4 `source` URL is time-limited; re-resolve later from the durable video_id."""
        try:
            body = await self._get(video_id, {"fields": "source,permalink_url"})
            return body.get("source") or body.get("permalink_url")
        except Exception as e:  # noqa: BLE001 -- a missing source never sinks the winner
            logger.debug("[meta] video %s source unresolved: %s", video_id, str(e)[:80])
            return None

    async def _one_winner(self, ad_id, ad_name, roas, out_dir, i) -> AssetRecord:
        """Pull a single winner's creative + asset. Raises on API errors so the caller can
        isolate per winner (one bad ad never sinks the batch). Images download the still;
        videos download a thumbnail and resolve the source URL."""
        body = await self._get(ad_id, {"fields": CREATIVE_FIELDS})
        creative = body.get("creative", {}) or {}
        video_id = self._video_id(creative)
        if video_id:
            kind, durable, source_url = "video", video_id, await self._resolve_video_source(video_id)
            urls, ext = self._thumb_urls(creative), "jpg"
        else:
            kind, durable, source_url = "image", creative.get("image_hash"), None
            urls, ext = self._image_urls(creative), "png"
        local = None
        for url in urls:  # try candidates in order (full-size still → thumbnail) until one lands
            try:
                local = await self.http.download(url, out_dir / f"winner_{i:02d}.{ext}")
                break
            except Exception:  # noqa: BLE001 -- a single bad asset URL never sinks the winner
                local = None
        return AssetRecord(platform="meta", entity_id=ad_id, entity_name=ad_name, kind=kind,
                           local_path=local, durable_ref=durable, source_url=source_url, roas=roas)

    async def fetch_assets(self, account_id: str | None, top_n: int) -> list[AssetRecord]:
        acct = self._acct(account_id)
        rows = await self._insights_paged(acct, {
            "level": "ad", "fields": ",".join(AD_FIELDS),
            "date_preset": "last_30d", "limit": 200,
        }, max_rows=2000)
        out_dir = Path(self.settings.asset_dir) / "meta"
        assets: list[AssetRecord] = []
        for i, (ad_id, ad_name, roas) in enumerate(self._rank(rows, top_n), 1):
            try:
                assets.append(await self._one_winner(ad_id, ad_name, roas, out_dir, i))
            except Exception as e:  # noqa: BLE001 -- isolate per-winner API failures
                logger.warning("[meta] winner '%s' (ad %s) skipped: %s",
                               ad_name[:40], ad_id, str(e)[:90])
        return assets
