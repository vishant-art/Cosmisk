"""Fetch the actual creative assets (images / video stills / owned MP4s) of an
account's winning RUNNING ads, to condition the creative pipeline on what already
converts.

Background + the full API map: dev_reports/ai_serv/creative/meta-api-creative-asset-retrieval.md.
Reuses meta_live's Graph session/token/version. Every Meta CDN URL is signed and
EXPIRES, so assets are downloaded immediately into out_dir; the durable hash /
permalink is kept on the record for later re-resolution.

`_api` and `_download` are module-level seams so tests run with zero network.
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_live  # noqa: E402  (reuse get / get_insights_paged / GRAPH_API_VERSION)

# Ad-level insight fields needed to pick + identify winners.
AD_FIELDS = ["ad_id", "ad_name", "spend", "impressions",
             "purchase_roas", "website_purchase_roas", "actions"]

# Expanded creative field set: every place an image hash or video id can hide.
_CREATIVE_FIELDS = ("name,creative{id,image_url,image_hash,thumbnail_url,video_id,"
                    "object_story_spec,asset_feed_spec,effective_object_story_id}")


@dataclass
class CreativeAsset:
    ad_id: str
    ad_name: str
    roas: float
    kind: str                       # "image" | "video"
    local_path: str | None = None   # downloaded file (None if nothing usable)
    image_hash: str | None = None   # durable reference (re-resolve via adimages)
    permalink: str | None = None    # durable facebook.com permalink
    video_id: str | None = None
    has_source: bool = False         # True only when we got the playable MP4


# --- network seams (patched in tests) ----------------------------------------

def _api(path: str, params: dict) -> dict:
    return meta_live.get(path, params)


def _download(url: str, out_path) -> str:
    import requests                     # lazy
    out = Path(out_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(requests.get(url, timeout=120).content)
    return str(out)


# --- pure helpers -------------------------------------------------------------

def _dedup(xs):
    seen, out = set(), []
    for x in xs:
        if x and x not in seen:
            seen.add(x)
            out.append(x)
    return out


def roas_of(row: dict) -> float:
    for key in ("purchase_roas", "website_purchase_roas"):
        arr = row.get(key) or []
        if arr:
            try:
                return float(arr[0].get("value") or 0)
            except (TypeError, ValueError, AttributeError):
                pass
    return 0.0


def rank_winners(rows, top_n: int = 5):
    """[(ad_id, ad_name, roas)] sorted by ROAS desc, one entry per ad."""
    best: dict[str, tuple[str, float]] = {}
    for r in rows:
        aid = r.get("ad_id")
        if not aid:
            continue
        name, prev = best.get(aid, (r.get("ad_name", "?"), 0.0))
        best[aid] = (r.get("ad_name", name), max(prev, roas_of(r)))
    ranked = sorted(((aid, n, ro) for aid, (n, ro) in best.items()),
                    key=lambda t: t[2], reverse=True)
    return ranked[:top_n]


def image_targets(creative: dict):
    """(direct_urls, hashes) of every image asset in a creative, priority order."""
    urls, hashes = [], []
    if creative.get("image_url"):
        urls.append(creative["image_url"])
    oss = creative.get("object_story_spec") or {}
    ld = oss.get("link_data") or {}
    if ld.get("picture"):
        urls.append(ld["picture"])
    if ld.get("image_hash"):
        hashes.append(ld["image_hash"])
    for ch in ld.get("child_attachments") or []:           # carousel cards
        if ch.get("picture"):
            urls.append(ch["picture"])
        if ch.get("image_hash"):
            hashes.append(ch["image_hash"])
    photo = oss.get("photo_data") or {}
    if photo.get("url"):
        urls.append(photo["url"])
    if photo.get("image_hash"):
        hashes.append(photo["image_hash"])
    if creative.get("image_hash"):
        hashes.append(creative["image_hash"])
    for im in (creative.get("asset_feed_spec") or {}).get("images") or []:   # dynamic/Advantage+
        if im.get("url"):
            urls.append(im["url"])
        if im.get("hash"):
            hashes.append(im["hash"])
    return _dedup(urls), _dedup(hashes)


def video_ids(creative: dict):
    """video_id from all three locations a creative can store it."""
    ids = []
    if creative.get("video_id"):
        ids.append(creative["video_id"])
    vd = (creative.get("object_story_spec") or {}).get("video_data") or {}
    if vd.get("video_id"):
        ids.append(vd["video_id"])
    for v in (creative.get("asset_feed_spec") or {}).get("videos") or []:
        if v.get("video_id"):
            ids.append(v["video_id"])
    return _dedup(ids)


def preferred_thumb(video: dict):
    thumbs = (video.get("thumbnails") or {}).get("data") or []
    for t in thumbs:
        if t.get("is_preferred"):
            return t.get("uri")
    if thumbs:
        return thumbs[0].get("uri")
    return video.get("picture")


# --- API calls ----------------------------------------------------------------

def fetch_ad_insights(token: str, account: str, preset: str = "last_30d", max_rows: int = 2000):
    rows, _ = meta_live.get_insights_paged(account, {
        "access_token": token, "level": "ad", "fields": ",".join(AD_FIELDS),
        "date_preset": preset, "limit": 200,
    }, max_rows=max_rows)
    return rows


def get_creative(token: str, ad_id: str) -> dict:
    body = _api(ad_id, {"access_token": token, "fields": _CREATIVE_FIELDS})
    return body.get("creative", {}) or {}


def resolve_hashes(token: str, account: str, hashes) -> dict:
    if not hashes:
        return {}
    body = _api(f"{account}/adimages", {
        "access_token": token, "fields": "hash,url,permalink_url,width,height",
        "hashes": json.dumps(list(hashes))})
    return {d["hash"]: d for d in body.get("data", []) if d.get("hash")}


def get_video(token: str, video_id: str) -> dict:
    return _api(video_id, {"access_token": token,
                           "fields": "source,permalink_url,picture,length,thumbnails{uri,is_preferred}"})


# --- orchestration ------------------------------------------------------------

def _one_winner(token, account, ad_id, ad_name, roas, out_dir, i, want_video) -> CreativeAsset:
    """Pull a single winner's best asset. Raises on API errors -- the caller isolates."""
    creative = get_creative(token, ad_id)
    urls, hashes = image_targets(creative)

    url, img_hash, permalink = (urls[0] if urls else None), None, None
    if url is None and hashes:
        resolved = resolve_hashes(token, account, hashes[:1]).get(hashes[0])
        if resolved:
            url, img_hash, permalink = resolved.get("url"), hashes[0], resolved.get("permalink_url")
    if url:
        path = _download(url, out_dir / f"winner_{i:02d}.png")
        return CreativeAsset(ad_id, ad_name, roas, "image", path, img_hash, permalink)

    if want_video:
        vids = video_ids(creative)
        if vids:
            video = get_video(token, vids[0])
            if video.get("source"):
                path = _download(video["source"], out_dir / f"winner_{i:02d}.mp4")
                return CreativeAsset(ad_id, ad_name, roas, "video", path,
                                     video_id=vids[0], has_source=True,
                                     permalink=video.get("permalink_url"))
            thumb = preferred_thumb(video)
            if thumb:
                path = _download(thumb, out_dir / f"winner_{i:02d}.png")
                return CreativeAsset(ad_id, ad_name, roas, "image", path,
                                     video_id=vids[0], has_source=False,
                                     permalink=video.get("permalink_url"))
    return CreativeAsset(ad_id, ad_name, roas, "image", None)   # nothing usable


def fetch_winning_creatives(token: str, account: str, *, preset: str = "last_30d",
                            top_n: int = 5, out_dir, want_video: bool = True,
                            log=print) -> list[CreativeAsset]:
    """Rank an account's running ads by ROAS, pull each winner's creative asset, and
    download it immediately (URLs expire). One bad winner (permission error, catalog
    ad with no static creative, expired URL) is skipped, never fatal to the batch."""
    out_dir = Path(out_dir)
    winners = rank_winners(fetch_ad_insights(token, account, preset=preset), top_n)
    assets: list[CreativeAsset] = []
    for i, (ad_id, ad_name, roas) in enumerate(winners, 1):
        try:
            assets.append(_one_winner(token, account, ad_id, ad_name, roas,
                                      out_dir, i, want_video))
        except Exception as e:  # noqa: BLE001 -- isolate per-winner API failures
            log(f"[meta]   winner '{ad_name[:40]}' (ad {ad_id}) skipped: {e!s:.90}")
    return assets
