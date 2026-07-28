"""Apify ingestion -- scrape competitors' live Meta (Facebook/Instagram) ads.

Second half of the competitor pipeline: discover.py names the competitors, this
module collects the creatives they are actively spending on via Apify's Facebook
Ads Library scraper (apify/facebook-ads-scraper). Meta's own Ad Library API only
returns commercial ads for EU/UK, so scraping the public Ad Library is the only
route for other markets (e.g. India).

We scrape by PAGE (the discovered Facebook handle), not by keyword: a keyword
search on the Ad Library is noisy (a search for one brand returns unrelated
advertisers), whereas a page URL targets that specific advertiser's ads.

Costs are real (pay-per-result, ~$5/1000 ads on the free tier), so every call is
hard-capped: MAX_COMPETITORS pages and ADS_PER_COMPETITOR ads each. Results are
normalized to a compact schema and stored as flat JSON (competitors/<key>__ads.json,
gitignored); raw items are kept too for re-processing.

Standalone:
    ../../.venv/Scripts/python apify_ads.py
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

import discover

ACTOR = "apify~facebook-ads-scraper"
RUN_SYNC = f"https://api.apify.com/v2/acts/{ACTOR}/run-sync-get-dataset-items"

# hard caps (free-tier safe: 6 x 15 = 90 ads ~ $0.5)
MAX_COMPETITORS = 6
ADS_PER_COMPETITOR = 15
DEFAULT_COUNTRY = "ALL"      # Ad Library country filter for the keyword fallback

ADS_DIR = Path(__file__).resolve().parent / "competitors"


# --- Apify run --------------------------------------------------------------

def _page_url(handle: str) -> str | None:
    """Turn a discovered Facebook handle into a page URL the actor can scrape."""
    if not handle:
        return None
    h = handle.strip()
    if h.startswith("http"):
        return h
    h = h.strip("/").split("/")[-1]           # tolerate 'facebook.com/foo'
    if not h or "." in h:                      # a bare domain is not a FB slug
        return None
    return f"https://www.facebook.com/{h}"


def _keyword_url(name: str, country: str = DEFAULT_COUNTRY) -> str:
    q = name.replace(" ", "%20")
    return ("https://www.facebook.com/ads/library/?active_status=active&ad_type=all"
            f"&country={country}&q={q}&search_type=keyword_unordered&media_type=all")


def run_scraper(token: str, start_url: str, limit: int, wait: int = 300) -> list[dict]:
    """One synchronous actor run for a single start URL. Returns raw ad items."""
    run_input = {"startUrls": [{"url": start_url}], "resultsLimit": limit,
                 "activeStatus": "active"}
    resp = httpx.post(RUN_SYNC, params={"token": token, "timeout": wait},
                      json=run_input, timeout=wait + 20)
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"Apify run failed ({resp.status_code}): {resp.text[:200]}")
    items = resp.json()
    return items if isinstance(items, list) else []


# --- normalization ----------------------------------------------------------

def _text(node) -> str | None:
    if isinstance(node, dict):
        return node.get("text")
    return node or None


def _run_days(raw: dict) -> float | None:
    """How long the ad has been running -- a strong 'this works' proxy. Prefer
    totalActiveTime (seconds) when present; else derive from the startDate/endDate
    epochs (active ads run through to now; ended ads through their endDate)."""
    tat = raw.get("totalActiveTime")
    if isinstance(tat, (int, float)) and tat:
        return round(tat / 86400, 1)
    sd = raw.get("startDate")
    if not isinstance(sd, (int, float)) or not sd:
        return None
    ed = raw.get("endDate")
    if raw.get("isActive") or not isinstance(ed, (int, float)) or not ed:
        end = time.time()
    else:
        end = ed
    return max(0.0, round((end - sd) / 86400, 1))


def normalize_ad(raw: dict, competitor: str) -> dict:
    snap = raw.get("snapshot") or {}
    cards = snap.get("cards") or []
    card_texts = [t for c in cards for t in [_text(c.get("body")), c.get("title")] if t]
    has_video = bool(snap.get("videos")) or any(
        c.get("videoHdUrl") or c.get("videoSdUrl") for c in cards)
    active_days = _run_days(raw)
    return {
        "competitor": competitor,
        "ad_archive_id": raw.get("adArchiveID") or raw.get("adArchiveId") or raw.get("adId"),
        "page_name": raw.get("pageName") or snap.get("pageName"),
        "platforms": raw.get("publisherPlatform") or [],
        "active": raw.get("isActive"),
        "start_date": raw.get("startDateFormatted") or raw.get("startDate"),
        "end_date": raw.get("endDateFormatted") or raw.get("endDate"),
        "active_days": active_days,
        "countries": raw.get("targetedOrReachedCountries") or [],
        "display_format": snap.get("displayFormat"),
        "is_carousel": (snap.get("displayFormat") == "carousel") or len(cards) > 1,
        "has_video": has_video,
        "primary_text": _text(snap.get("body")),
        "title": snap.get("title"),
        "caption": snap.get("caption"),
        "cta_text": snap.get("ctaText"),
        "cta_type": snap.get("ctaType"),
        "link_url": snap.get("linkUrl"),
        "link_description": snap.get("linkDescription"),
        "card_count": len(cards),
        "card_texts": card_texts[:6],
        "page_categories": snap.get("pageCategories"),
        "page_like_count": snap.get("pageLikeCount"),
    }


# --- storage ----------------------------------------------------------------

def _path(key: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)
    return ADS_DIR / f"{safe}__ads.json"


def load_ads(key: str) -> dict | None:
    p = _path(key)
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save_ads(key: str, record: dict) -> None:
    ADS_DIR.mkdir(exist_ok=True)
    _path(key).write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")


# --- orchestration ----------------------------------------------------------

def scrape(env: dict, key: str, discovered: dict, max_competitors: int = MAX_COMPETITORS,
           ads_per: int = ADS_PER_COMPETITOR, keep_raw: bool = True, progress=None) -> dict:
    """Scrape the top competitors from a discovery record. Prefers page-URL
    targeting (precise); falls back to a keyword search only when no usable
    Facebook handle exists. Stores normalized ads (and optionally raw)."""
    token = env.get("APIFY_TOKEN")
    if not token:
        raise SystemExit("APIFY_TOKEN not set (repo-root .env)")

    comps = (discovered.get("competitors") or [])[:max_competitors]
    by_comp: dict[str, list[dict]] = {}
    raw_by_comp: dict[str, list[dict]] = {}
    skipped: list[tuple[str, str]] = []

    for i, c in enumerate(comps, 1):
        name = c.get("name", "?")
        page = _page_url(c.get("facebook"))
        url = page or _keyword_url(name)
        mode = "page" if page else "keyword"
        if progress:
            progress(i, len(comps), name, mode)
        try:
            raw = run_scraper(token, url, ads_per)
        except Exception as e:  # noqa: BLE001 -- one bad competitor never kills the sweep
            skipped.append((name, str(e)[:80]))
            continue
        by_comp[name] = [normalize_ad(r, name) for r in raw]
        if keep_raw:
            raw_by_comp[name] = raw

    total = sum(len(v) for v in by_comp.values())
    record = {
        "account_key": key,
        "scraped_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "actor": ACTOR,
        "caps": {"max_competitors": max_competitors, "ads_per_competitor": ads_per},
        "total_ads": total,
        "ads_by_competitor": by_comp,
        "skipped": skipped,
    }
    if keep_raw:
        record["_raw_by_competitor"] = raw_by_comp
    save_ads(key, record)
    return record


def main():
    env = discover.load_env(discover.find_root_env(Path(__file__).resolve().parent))
    key = discover._ask("Discovery storage key (Meta account id or brand)")
    disc = discover.load(key)
    if not disc or not disc.get("competitors"):
        raise SystemExit(f"no discovered competitors for '{key}' -- run discover.py first")
    n = discover._ask(f"Max competitors to scrape [{MAX_COMPETITORS}]", str(MAX_COMPETITORS))
    per = discover._ask(f"Ads per competitor [{ADS_PER_COMPETITOR}]", str(ADS_PER_COMPETITOR))

    def prog(i, total, name, mode):
        print(f"  [{i}/{total}] scraping {name} ({mode}) ...", flush=True)

    rec = scrape(env, key, disc, max_competitors=int(n), ads_per=int(per), progress=prog)
    print(f"\nScraped {rec['total_ads']} ads across {len(rec['ads_by_competitor'])} competitors "
          f"-> {_path(key)}")
    for name, ads in rec["ads_by_competitor"].items():
        active = sum(1 for a in ads if a.get("active"))
        print(f"  {name}: {len(ads)} ads ({active} active)")
    for name, why in rec["skipped"]:
        print(f"  skipped {name}: {why}")


if __name__ == "__main__":
    main()
