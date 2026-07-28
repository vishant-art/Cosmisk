"""Competitor intelligence -- orchestration + code-computed aggregates.

Ties the two data-acquisition modules together and turns raw competitor ads into
a compact, code-computed COMPETITOR INTEL block for the chat:

    account (Meta) -> auto_context() -> discover.ensure() (LLM, cached)
                   -> apify_ads.scrape() (Apify, cached) -> aggregate() -> render_block()

Everything here that is a NUMBER (CTA mix, offer prevalence, format split,
longest-running "proven" ads) is computed in code, not by an LLM, matching the
rest of the analysis system. The chat's LLM only reasons over the block (hooks to
steal, gaps, positioning). Discovery + scrape results are cached to disk and
reused unless stale/refreshed, so a normal chat launch spends nothing.

Auto-context makes discovery hands-free: the brand descriptor is derived from the
Meta account name + the connected Shopify store + campaign-name signals, so no
per-account seeding is needed (the account is just an example).
"""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from pathlib import Path

import httpx

import discover
import apify_ads

STALE_DAYS = 7                       # re-scrape competitors older than this
_OFFER_RE = re.compile(
    r"\b(\d{1,3}\s?%|\d{1,3}\s?%?\s?off|flat\s?\d+|sale|discount|offer|deal|"
    r"free\s?shipping|save|upto|up to|limited time|clearance|bogo)\b", re.IGNORECASE)
_PRICE_RE = re.compile(r"(?:₹|rs\.?|inr|\$|usd)\s?\d", re.IGNORECASE)


# --- auto-context (hands-free discovery input) ------------------------------

def _shopify_context(env: dict) -> dict | None:
    store, tok = env.get("SHOPIFY_STORE"), env.get("SHOPIFY_TOKEN")
    if not (store and tok):
        return None
    ver = env.get("SHOPIFY_API_VERSION", "2024-07")
    try:
        r = httpx.get(f"https://{store}/admin/api/{ver}/products.json",
                      params={"limit": 30, "fields": "title,product_type,tags"},
                      headers={"X-Shopify-Access-Token": tok}, timeout=30)
        if r.status_code != 200:
            return {"domain": store}
        prods = r.json().get("products", [])
    except Exception:  # noqa: BLE001
        return {"domain": store}
    types = sorted({p.get("product_type") for p in prods if p.get("product_type")})
    titles = [p.get("title") for p in prods if p.get("title")][:8]
    return {"domain": store, "types": types, "sample_titles": titles}


def _geo_hint(campaign_names: list[str]) -> str | None:
    tokens = {"India": ("_IND", "INDIA", "_IN_"), "US": ("_USA", "_US_", "USA"),
              "UK": ("_UK_", "UK"), "UAE": ("_UAE", "UAE")}
    counts = {k: sum(any(t in n.upper() for t in ts) for n in campaign_names)
              for k, ts in tokens.items()}
    ranked = [k for k, v in sorted(counts.items(), key=lambda x: -x[1]) if v]
    return ", ".join(ranked[:2]) if ranked else None


def auto_context(env: dict, ds) -> dict:
    """Build the discovery descriptor automatically from the account + Shopify."""
    names = [f["campaign_name"] for f in ds.facts]
    spend_by = {}
    for f in ds.facts:
        spend_by[f["campaign_name"]] = spend_by.get(f["campaign_name"], 0.0) + f["spend"]
    top_campaigns = [n for n, _ in sorted(spend_by.items(), key=lambda x: -x[1])[:8]]

    shop = _shopify_context(env)
    website = shop.get("domain") if shop else None
    notes = []
    if shop and shop.get("types"):
        notes.append("Product types: " + ", ".join(shop["types"][:8]))
    if shop and shop.get("sample_titles"):
        notes.append("Sample products: " + "; ".join(shop["sample_titles"][:6]))
    if top_campaigns:
        notes.append("Top Meta campaigns: " + ", ".join(top_campaigns))
    return {
        "brand": ds.account_name,
        "website": website,
        "category": None,               # let the model infer from products/name
        "geo": _geo_hint(names),
        "notes": " | ".join(notes) or None,
    }


# --- code aggregates over scraped ads ---------------------------------------

def _fmt(ad: dict) -> str:
    if ad.get("is_carousel"):
        return "carousel"
    if ad.get("has_video"):
        return "video"
    return "image"


def _ad_text(ad: dict) -> str:
    return " ".join([ad.get("primary_text") or "", ad.get("title") or "",
                     ad.get("caption") or "", " ".join(ad.get("card_texts") or [])])


def _tally(items) -> list[tuple[str, int]]:
    counts: dict[str, int] = {}
    for it in items:
        if it:
            counts[it] = counts.get(it, 0) + 1
    return sorted(counts.items(), key=lambda x: -x[1])


def aggregate(ads_record: dict, top_hooks: int = 8) -> dict:
    by_comp = ads_record.get("ads_by_competitor", {}) or {}
    all_ads = [a for ads in by_comp.values() for a in ads]
    n = len(all_ads)
    if not n:
        return {"total_ads": 0, "competitors": {}, "cta_mix": [], "format_mix": [],
                "offer_pct": 0, "price_pct": 0, "top_hooks": []}

    offers = sum(bool(_OFFER_RE.search(_ad_text(a))) for a in all_ads)
    prices = sum(bool(_PRICE_RE.search(_ad_text(a))) for a in all_ads)

    per_comp = {}
    for name, ads in by_comp.items():
        if not ads:
            continue
        longest = max(ads, key=lambda a: a.get("active_days") or 0)
        per_comp[name] = {
            "ads": len(ads),
            "active": sum(1 for a in ads if a.get("active")),
            "top_format": (_tally([_fmt(a) for a in ads]) or [("?", 0)])[0][0],
            "top_cta": (_tally([a.get("cta_type") for a in ads]) or [("?", 0)])[0][0],
            "longest_days": longest.get("active_days"),
            "offer_pct": round(sum(bool(_OFFER_RE.search(_ad_text(a))) for a in ads) / len(ads) * 100),
        }

    # "proven" creatives = longest continuously-running ads across all competitors,
    # skipping dynamic-catalog templates ({{...}}) and empty copy, deduped by text.
    def _snip(a):
        return (a.get("primary_text") or a.get("title")
                or (a.get("card_texts") or [""])[0] or "").strip().replace("\n", " ")
    meaningful = [a for a in all_ads if _snip(a) and "{{" not in _snip(a)]
    ranked = sorted(meaningful, key=lambda a: a.get("active_days") or 0, reverse=True)
    hooks, seen = [], set()
    for a in ranked:
        snippet = _snip(a)[:160]
        if snippet in seen:
            continue
        seen.add(snippet)
        hooks.append({"competitor": a.get("competitor"), "days": a.get("active_days"),
                      "format": _fmt(a), "cta": a.get("cta_type"), "snippet": snippet})
        if len(hooks) >= top_hooks:
            break

    return {
        "total_ads": n,
        "competitors": per_comp,
        "cta_mix": _tally([a.get("cta_type") for a in all_ads])[:6],
        "format_mix": _tally([_fmt(a) for a in all_ads]),
        "offer_pct": round(offers / n * 100),
        "price_pct": round(prices / n * 100),
        "top_hooks": hooks,
    }


# --- rendering --------------------------------------------------------------

def render_block(discovered: dict, ads_record: dict, agg: dict) -> str:
    if not agg.get("total_ads"):
        comps = ", ".join(c.get("name", "?") for c in discovered.get("competitors", [])[:8])
        return (f"Competitors identified: {comps}. No live ads were scraped "
                f"(scraping disabled or pages returned nothing).")

    lines = [
        f"Brand read: {discovered.get('brand_understanding', '')}",
        f"Scraped {agg['total_ads']} live competitor ads across "
        f"{len(agg['competitors'])} brands (scraped {ads_record.get('scraped_at', '?')[:10]}).",
        f"Across all competitor ads: offers/discounts in {agg['offer_pct']}%, "
        f"explicit prices in {agg['price_pct']}%.",
        f"CTA mix: {', '.join(f'{c}({n})' for c, n in agg['cta_mix']) or 'n/a'}.",
        f"Format mix: {', '.join(f'{c} {n}' for c, n in agg['format_mix'])}.",
        "",
        "PER COMPETITOR (ads | active | top format | top CTA | longest-running ad | offer%):",
    ]
    for name, c in sorted(agg["competitors"].items(), key=lambda x: -x[1]["ads"]):
        days = f"{c['longest_days']:.0f}d" if c.get("longest_days") else "?"
        lines.append(f"  - {name}: {c['ads']} ads | {c['active']} active | {c['top_format']} | "
                     f"{c['top_cta']} | longest {days} | offers {c['offer_pct']}%")
    lines += ["", "PROVEN CREATIVES (longest continuously-running = what competitors keep "
                  "paying for -- strongest 'what works' signal):"]
    for h in agg["top_hooks"]:
        days = f"{h['days']:.0f}d" if h.get("days") else "?"
        lines.append(f"  - {h['competitor']} [{h['format']}, {days}, {h.get('cta') or '-'}]: "
                     f"{h['snippet']}")
    return "\n".join(lines)


# --- orchestration ----------------------------------------------------------

def _is_stale(ads_record: dict | None) -> bool:
    if not ads_record:
        return True
    ts = ads_record.get("scraped_at", "")[:10]
    try:
        return (date.today() - date.fromisoformat(ts)).days >= STALE_DAYS
    except ValueError:
        return True


def build(env: dict, account: str, ds, refresh: bool = False,
         max_competitors: int = apify_ads.MAX_COMPETITORS,
         ads_per: int = apify_ads.ADS_PER_COMPETITOR, progress=None) -> tuple[str, dict]:
    """Full competitor pipeline for one account. Returns (block_text, meta).
    Discovery + scrape are cached; scraping (which costs money) runs only when
    missing/stale/refresh. `progress(stage, detail)` is optional."""
    key = account
    ctx = auto_context(env, ds)
    if progress:
        progress("context", f"{ctx['brand']} | geo={ctx['geo']} | site={ctx['website']}")

    discovered = discover.ensure(env, key, ctx["brand"], refresh=refresh,
                                 website=ctx["website"], category=ctx["category"],
                                 geo=ctx["geo"], notes=ctx["notes"])
    if progress:
        progress("discovery", f"{len(discovered.get('competitors', []))} competitors")

    ads_record = apify_ads.load_ads(key)
    scraped_now = False
    if env.get("APIFY_TOKEN") and (refresh or _is_stale(ads_record)):
        def _sp(i, total, name, mode):
            if progress:
                progress("scrape", f"[{i}/{total}] {name} ({mode})")
        ads_record = apify_ads.scrape(env, key, discovered, max_competitors=max_competitors,
                                      ads_per=ads_per, progress=_sp)
        scraped_now = True
    ads_record = ads_record or {"ads_by_competitor": {}}

    agg = aggregate(ads_record)
    block = render_block({**discovered, "brand_understanding": discovered.get("brand_understanding", "")},
                         ads_record, agg)
    meta = {"discovered": len(discovered.get("competitors", [])),
            "scraped_ads": agg.get("total_ads", 0), "scraped_now": scraped_now,
            "stale": _is_stale(ads_record)}
    return block, meta
