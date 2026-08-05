"""Competitor discovery -- a live LLM call that identifies who a brand's
competitors are, so the scraper (Apify) knows what to collect.

Apify cannot discover competitors; it only scrapes brands we already name. This
module fills that gap: given a brand (name + whatever context we have -- website,
category, geo, product notes), it asks an OpenRouter model to return the most
direct competitors plus a few adjacent ones, each with the handles the downstream
Meta Ads Library / web scrapers need (website, Facebook page, Instagram).

The result is stored as flat JSON (competitors/<key>.json, gitignored) and reused
on later runs unless a refresh is requested. Page handles are the model's best
guess and are marked with a confidence; a later Apify pass is what actually
confirms which pages return live ads.

Standalone use:
    ../../.venv/Scripts/python discover.py
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from openai import OpenAI

from ai_layer import config, cost_ledger
from ai_layer.db import repository as _repo

DISCOVERY_MODEL = "openai/gpt-5.4-mini"
DEFAULT_N = 12

SYSTEM = (
    "You are a competitive-intelligence analyst for e-commerce / DTC marketing. "
    "Given a brand, identify the companies it most directly competes with for the "
    "same customers -- brands selling similar products to a similar audience in a "
    "similar price tier and geography. First infer, from the name/website/notes, "
    "exactly what the brand sells and to whom (category, price tier, primary "
    "country). Then list competitors.\n"
    "Return ONLY a JSON object of this shape:\n"
    "{\n"
    '  "brand_understanding": "one sentence: what the brand sells + audience + geo + price tier",\n'
    '  "competitors": [\n'
    "    {\n"
    '      "name": "Brand name",\n'
    '      "website": "primary domain, e.g. brand.com (no https://), or null",\n'
    '      "facebook": "Facebook page slug or full page URL usable in the Meta Ad Library, or null",\n'
    '      "instagram": "instagram handle without @, or null",\n'
    '      "tier": "direct | adjacent",\n'
    '      "why": "one short clause on why they compete",\n'
    '      "confidence": "high | medium | low"\n'
    "    }\n"
    "  ]\n"
    "}\n"
    "Rules: prefer DIRECT competitors (same product + audience + geo) first, then a "
    "few ADJACENT ones (overlapping but broader or different tier). Match the brand's "
    "home geography -- do NOT default to US brands for a non-US brand. Only include "
    "real, currently-operating brands; if unsure of a handle, use null rather than "
    "guessing wildly, and set confidence honestly. No commentary outside the JSON."
)


# --- storage ----------------------------------------------------------------

def load(key: str, brand_id: str | None = None) -> dict | None:
    intel = _repo.load_competitor_intel(key, brand_id=brand_id)
    return intel["discovery"] if intel else None


def save(key: str, record: dict, brand_id: str | None = None) -> None:
    _repo.save_competitor_discovery(key, record, brand_id=brand_id)


# --- discovery --------------------------------------------------------------

def _describe(brand: str, website: str | None, category: str | None,
              geo: str | None, notes: str | None) -> str:
    lines = [f"Brand: {brand}"]
    if website:
        lines.append(f"Website: {website}")
    if category:
        lines.append(f"Category: {category}")
    if geo:
        lines.append(f"Primary geography: {geo}")
    if notes:
        lines.append(f"Context / signals: {notes}")
    lines.append(f"\nList up to {DEFAULT_N} competitors as specified.")
    return "\n".join(lines)


def discover(brand: str, website: str | None = None, category: str | None = None,
             geo: str | None = None, notes: str | None = None,
             n: int = DEFAULT_N, account: str | None = None) -> tuple[dict, float]:
    """One live OpenRouter call. Returns (record, cost_usd). Raises on API/JSON error."""
    if not config.OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    client = OpenAI(api_key=config.OPENROUTER_API_KEY, base_url=config.OPENROUTER_BASE_URL)
    user = _describe(brand, website, category, geo, notes)

    last_err = ""
    for attempt in (1, 2):
        resp = client.chat.completions.create(
            model=DISCOVERY_MODEL, temperature=0.4,
            response_format={"type": "json_object"},
            messages=[{"role": "system", "content": SYSTEM},
                      {"role": "user", "content": user}])
        content = resp.choices[0].message.content or ""
        usage = getattr(resp, "usage", None)
        real = getattr(usage, "model_extra", {}).get("cost") if usage is not None else None
        cost = cost_ledger.record(
            DISCOVERY_MODEL,
            getattr(usage, "prompt_tokens", 0) or 0,
            getattr(usage, "completion_tokens", 0) or 0,
            op="discover", account=account,
            cost_usd_actual=float(real) if real is not None else None)
        try:
            parsed = json.loads(content)
        except json.JSONDecodeError as exc:
            last_err = str(exc)
            user = _describe(brand, website, category, geo, notes) + \
                f"\n\nYour previous reply was not valid JSON ({exc}). Return ONLY corrected JSON."
            continue
        competitors = parsed.get("competitors", []) or []
        record = {
            "brand": {"name": brand, "website": website, "category": category, "geo": geo},
            "brand_understanding": parsed.get("brand_understanding", ""),
            "discovered_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "model": DISCOVERY_MODEL,
            "competitors": competitors[:n],
        }
        return record, cost
    raise RuntimeError(f"discovery: model did not return valid JSON after 2 attempts ({last_err})")


def ensure(key: str, brand: str, refresh: bool = False, brand_id: str | None = None, **ctx) -> dict:
    """Return the stored competitor list for `key`, discovering it if missing or
    if refresh=True. `key` is typically the Meta account id; ctx is passed to
    discover() (website/category/geo/notes/n)."""
    if not refresh:
        existing = load(key, brand_id=brand_id)
        if existing and existing.get("competitors"):
            return existing
    record, cost = discover(brand, account=key, **ctx)
    record["discovery_cost_usd"] = round(cost, 6)
    save(key, record, brand_id=brand_id)
    return record


# --- rendering (for injecting into the chat context, later) ------------------

def render_block(record: dict) -> str:
    comps = record.get("competitors", [])
    if not comps:
        return "(No competitors discovered.)"
    lines = [f"Brand read: {record.get('brand_understanding', '')}",
             f"Discovered competitors ({len(comps)}):"]
    for c in comps:
        handle = c.get("facebook") or c.get("website") or "?"
        lines.append(f"  - {c.get('name', '?')} [{c.get('tier', '?')}, "
                     f"conf={c.get('confidence', '?')}] {handle}: {c.get('why', '')}")
    return "\n".join(lines)
