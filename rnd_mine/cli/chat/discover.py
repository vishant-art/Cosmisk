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
from pathlib import Path

import httpx

DISCOVERY_MODEL = "openai/gpt-5.4-mini"
DISCOVERY_DIR = Path(__file__).resolve().parent / "competitors"
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


# --- env (self-contained so this never imports chat.py) ---------------------

def find_root_env(start: Path) -> Path:
    for parent in [start, *start.parents]:
        candidate = parent / ".env"
        if candidate.is_file() and (parent / "rnd_mine").is_dir():
            return candidate
    raise SystemExit("could not locate the repo root .env (looked upward from this file)")


def load_env(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values


# --- storage ----------------------------------------------------------------

def _path(key: str) -> Path:
    safe = "".join(c if c.isalnum() or c in "-_." else "_" for c in key)
    return DISCOVERY_DIR / f"{safe}.json"


def load(key: str) -> dict | None:
    p = _path(key)
    if not p.is_file():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def save(key: str, record: dict) -> None:
    DISCOVERY_DIR.mkdir(exist_ok=True)
    _path(key).write_text(json.dumps(record, indent=2, ensure_ascii=False), encoding="utf-8")


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


def discover(env: dict, brand: str, website: str | None = None, category: str | None = None,
             geo: str | None = None, notes: str | None = None, n: int = DEFAULT_N) -> tuple[dict, float]:
    """One live OpenRouter call. Returns (record, cost_usd). Raises on API/JSON error."""
    if not env.get("OPENROUTER_API_KEY"):
        raise SystemExit("OPENROUTER_API_KEY not set (repo-root .env)")
    url = env.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1") + "/chat/completions"
    headers = {"Authorization": f"Bearer {env['OPENROUTER_API_KEY']}"}
    user = _describe(brand, website, category, geo, notes)

    last_err = ""
    for attempt in (1, 2):
        body = {
            "model": DISCOVERY_MODEL,
            "messages": [{"role": "system", "content": SYSTEM},
                         {"role": "user", "content": user}],
            "response_format": {"type": "json_object"},
            "temperature": 0.4,
        }
        with httpx.Client(timeout=120) as client:
            resp = client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            raise SystemExit(f"discovery: OpenRouter returned {resp.status_code}: {resp.text[:200]}")
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        usage = data.get("usage") or {}
        cost = float(usage.get("cost") or 0.0)
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
    raise SystemExit(f"discovery: model did not return valid JSON after 2 attempts ({last_err})")


def ensure(env: dict, key: str, brand: str, refresh: bool = False, **ctx) -> dict:
    """Return the stored competitor list for `key`, discovering it if missing or
    if refresh=True. `key` is typically the Meta account id; ctx is passed to
    discover() (website/category/geo/notes/n)."""
    if not refresh:
        existing = load(key)
        if existing and existing.get("competitors"):
            return existing
    record, cost = discover(env, brand, **ctx)
    record["discovery_cost_usd"] = round(cost, 6)
    save(key, record)
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


# --- standalone entry -------------------------------------------------------

def _ask(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    try:
        return input(f"{label}{suffix}: ").strip() or default
    except (EOFError, KeyboardInterrupt):
        raise SystemExit(0)


def main():
    env = load_env(find_root_env(Path(__file__).resolve().parent))
    print("Competitor discovery (live LLM call).\n")
    brand = _ask("Brand name")
    if not brand:
        raise SystemExit("brand name required")
    website = _ask("Website (optional)")
    category = _ask("Category (optional)")
    geo = _ask("Primary geography (optional)")
    notes = _ask("Extra context/signals (optional)")
    key = _ask("Storage key", website or brand)

    print("\nDiscovering competitors ...")
    record = ensure(env, key, brand, refresh=True, website=website or None,
                    category=category or None, geo=geo or None, notes=notes or None)
    print()
    print(render_block(record))
    print(f"\nStored -> {_path(key)}  (cost ${record.get('discovery_cost_usd', 0):.4f})")


if __name__ == "__main__":
    main()
