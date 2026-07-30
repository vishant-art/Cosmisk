"""Historic-facts layer -- long-term monthly memory for the Meta Ads chat.

Phase 2 of the analysis system. The tiering the user asked for:

  - Recent 6 months: raw daily rows live in the fetch cache (cache.py); the brain
    (brain.py) does fine-grained WoW / daily analysis on them.
  - 6-37 months back: we DO NOT keep raw rows. We keep only computed monthly
    FACTS -- account ROAS/spend/revenue/purchases, MoM deltas, best/worst campaign
    -- rolled up in code (no LLM, so exact). These are cheap to fetch (one monthly
    aggregate call per month) and, once stored, survive PAST Meta's 37-month
    retention: the store becomes memory Meta itself no longer has.

Both the monthly facts and the recent months are rendered into a compact
HISTORIC FACTS block that rides into the LLM alongside the raw snapshot.

Storage: the `monthly_facts` table (see `ai_layer.db.repository.load_monthly_facts`
/ `save_monthly_facts`), keyed by (brand_id, account_id, level, month).

This module is pure: it operates on already-normalized fact dicts (the caller
decides whether a month's facts come from the raw cache or a fresh monthly pull)
and never imports chat.py.
"""
from __future__ import annotations

from datetime import date

from ai_layer.db import repository as _repo

RETENTION_MONTHS = 37       # Meta's raw retention; how far back we try to build
REBUILD_RECENT_MONTHS = 2   # always recompute the last N months (may have changed)
MATERIAL_SPEND_PCT = 0.01   # a campaign must be >=1% of month spend to be "notable"
MIN_PURCHASES = 5           # ... and have real conversions before we rank its ROAS
NOISE_PCT = 10.0


# --- month arithmetic -------------------------------------------------------

def _add_months(y: int, m: int, delta: int) -> tuple[int, int]:
    idx = (y * 12 + (m - 1)) + delta
    return idx // 12, idx % 12 + 1


def _key(y: int, m: int) -> str:
    return f"{y:04d}-{m:02d}"


def month_bounds(ym: str) -> tuple[date, date]:
    y, m = int(ym[:4]), int(ym[5:7])
    first = date(y, m, 1)
    ny, nm = _add_months(y, m, 1)
    last = date(ny, nm, 1).toordinal() - 1
    return first, date.fromordinal(last)


def months_range(today: date, months_back: int = RETENTION_MONTHS) -> list[str]:
    """Complete months from ~months_back ago up to LAST month (current month is
    partial and excluded -- the recent raw tier covers it)."""
    last_y, last_m = _add_months(today.year, today.month, -1)   # previous month
    start_y, start_m = _add_months(today.year, today.month, -months_back)
    out, y, m = [], start_y, start_m
    while (y, m) <= (last_y, last_m):
        out.append(_key(y, m))
        y, m = _add_months(y, m, 1)
    return out


# --- rollup (facts -> one month's stored facts) -----------------------------

def rollup(facts: list[dict]) -> dict:
    """Aggregate a month's normalized fact dicts into stored monthly facts.
    Ratios recomputed from summed bases; no raw rows retained."""
    spend = sum(f["spend"] for f in facts)
    revenue = sum(f["revenue"] for f in facts)
    impressions = sum(f["impressions"] for f in facts)
    link_clicks = sum(f["link_clicks"] for f in facts)
    purchases = sum(f["purchases"] for f in facts)
    freqs = [f["frequency"] for f in facts if f["frequency"]]

    # per-campaign ROAS for best/worst, gated on materiality + volume
    by_camp: dict[str, dict] = {}
    for f in facts:
        g = by_camp.setdefault(f["campaign_name"], {"spend": 0.0, "revenue": 0.0, "purchases": 0.0})
        g["spend"] += f["spend"]
        g["revenue"] += f["revenue"]
        g["purchases"] += f["purchases"]
    material = [(n, g["revenue"] / g["spend"]) for n, g in by_camp.items()
               if g["spend"] >= MATERIAL_SPEND_PCT * (spend or 1) and g["purchases"] >= MIN_PURCHASES]
    best = max(material, key=lambda x: x[1]) if material else None
    worst = min(material, key=lambda x: x[1]) if material else None

    return {
        "spend": round(spend, 2),
        "revenue": round(revenue, 2),
        "purchases": int(purchases),
        "roas": round(revenue / spend, 4) if spend else 0.0,
        "cpa": round(spend / purchases, 2) if purchases else 0.0,
        "link_ctr": round(link_clicks / impressions * 100, 4) if impressions else 0.0,
        "cpm": round(spend / impressions * 1000, 2) if impressions else 0.0,
        "frequency": round(sum(freqs) / len(freqs), 3) if freqs else 0.0,
        "campaigns": len(by_camp),
        "best_campaign": [best[0], round(best[1], 2)] if best else None,
        "worst_campaign": [worst[0], round(worst[1], 2)] if worst else None,
    }


def _pct(recent: float, prior: float) -> float | None:
    if prior == 0:
        return None if recent == 0 else 100.0
    return round((recent - prior) / prior * 100, 1)


def attach_deltas(months: dict) -> None:
    """Add MoM deltas (roas/spend/revenue) vs the prior stored month, in place."""
    keys = sorted(months)
    for i, k in enumerate(keys):
        if i == 0:
            months[k]["mom"] = None
            continue
        cur, pri = months[k], months[keys[i - 1]]
        months[k]["mom"] = {
            "roas": _pct(cur["roas"], pri["roas"]),
            "spend": _pct(cur["spend"], pri["spend"]),
            "revenue": _pct(cur["revenue"], pri["revenue"]),
        }


# --- persistence ------------------------------------------------------------

def load(account: str, level: str, brand_id: str | None = None) -> dict:
    try:
        return _repo.load_monthly_facts(account, level, brand_id=brand_id)
    except Exception:  # noqa: BLE001 -- store down: behave like an empty history
        return {}


def save(account: str, level: str, months: dict, brand_id: str | None = None) -> None:
    _repo.save_monthly_facts(account, level, months, brand_id=brand_id)


# --- build ------------------------------------------------------------------

def ensure(account: str, level: str, facts_for_month, today: date,
           months_back: int = RETENTION_MONTHS, progress=None, brand_id: str | None = None) -> dict:
    """Build any missing monthly facts (and refresh the last few), then persist.

    `facts_for_month(first_date, last_date) -> list[fact dict] | None` is supplied
    by the caller: for recent months it reads the raw cache, for older months it
    does a one-shot monthly aggregate pull. Returns None -> month skipped."""
    months = load(account, level, brand_id=brand_id)
    wanted = months_range(today, months_back)
    # a stored month older than the refresh window is final -> keep it, never refetch
    refresh_cutoff = set(wanted[-REBUILD_RECENT_MONTHS:])
    todo = [ym for ym in wanted if ym not in months or ym in refresh_cutoff]

    built = 0
    for i, ym in enumerate(todo, 1):
        first, last = month_bounds(ym)
        if progress:
            progress(i, len(todo), ym)
        try:
            facts = facts_for_month(first, last)
        except KeyboardInterrupt:
            raise
        except Exception:  # noqa: BLE001 -- one bad month never kills the backfill
            continue
        if facts:
            months[ym] = rollup(facts)
            built += 1
    attach_deltas(months)
    if built:
        save(account, level, months, brand_id=brand_id)
    return months


# --- rendering --------------------------------------------------------------

def _fmt_money(v: float) -> str:
    if abs(v) >= 1_000_000:
        return f"{v / 1_000_000:.2f}M"
    if abs(v) >= 1_000:
        return f"{v / 1_000:.0f}k"
    return f"{v:.0f}"


def _sign(pct: float | None) -> str:
    return "" if pct is None else f" ({pct:+.0f}%)"


def render_history_block(months: dict, currency: str = "INR", tail: int = 24) -> str:
    """Compact monthly timeline. Shows the last `tail` months in full; older ones
    are summarized so the block stays small even with 3 years of history."""
    if not months:
        return "(No historic monthly facts stored yet.)"
    keys = sorted(months)
    lines = [
        f"Monthly account facts ({keys[0]} .. {keys[-1]}), code-computed and exact. "
        f"Raw daily rows are retained only for the last ~6 months; everything here is "
        f"a stored monthly rollup (kept even past Meta's retention).",
        f"Format: ROAS | spend {currency} | revenue {currency} | purchases  (MoM delta on ROAS):",
    ]
    shown = keys[-tail:]
    if len(keys) > tail:
        lines.append(f"  (... {len(keys) - tail} earlier months stored, omitted here for brevity ...)")
    for k in shown:
        f = months[k]
        mom = f.get("mom") or {}
        lines.append(f"  {k}: {f['roas']:.2f}x | {_fmt_money(f['spend'])} | "
                     f"{_fmt_money(f['revenue'])} | {f['purchases']}p"
                     f"{_sign(mom.get('roas'))}")

    # summary facts over the stored history
    roas_by = [(k, months[k]["roas"]) for k in keys if months[k]["spend"] > 0]
    if roas_by:
        best = max(roas_by, key=lambda x: x[1])
        worst = min(roas_by, key=lambda x: x[1])
        lines.append("")
        lines.append(f"Best month: {best[0]} ({best[1]:.2f}x); worst: {worst[0]} ({worst[1]:.2f}x).")
        if len(roas_by) >= 6:
            recent6 = [r for _, r in roas_by[-6:]]
            prior6 = [r for _, r in roas_by[-12:-6]] or recent6
            ra, pa = sum(recent6) / len(recent6), sum(prior6) / len(prior6)
            p = _pct(ra, pa)
            direction = "declining" if (p or 0) <= -NOISE_PCT else \
                        "improving" if (p or 0) >= NOISE_PCT else "roughly flat"
            lines.append(f"Last 6 months avg ROAS {ra:.2f}x vs prior 6 months {pa:.2f}x "
                         f"({direction}{_sign(p)}).")
    return "\n".join(lines)
