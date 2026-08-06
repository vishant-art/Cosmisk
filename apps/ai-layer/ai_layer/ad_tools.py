"""Ad-level tools for the chat's agent loop -- pure code, no LLM, no fetching.

These operate on already-fetched ad-level fact dicts (chat.py owns the fetching
and caching; it calls these to compute results, then feeds them back to the
model). Every number is code-computed, so the model reasons over exact ad-level
data it pulled on demand -- it never sees raw rows and never invents figures.

The OpenAI-style tool schemas are exported as TOOL_SCHEMAS; chat.py hands them to
the model and dispatches tool calls back into execute() with fetched facts.
"""
from __future__ import annotations

# metrics rankable by top_ads; True = higher is better (for label only)
_METRICS = ("roas", "spend", "revenue", "purchases", "cpa", "link_ctr", "frequency")
_MIN_SPEND = 500.0        # ignore trivially-small ads
_MIN_PURCHASES = 3        # required before trusting an ad's ROAS/CPA
_NOISE = 10.0             # % move below which a trend is "flat"

TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "top_ads",
            "description": ("Rank INDIVIDUAL ADS by a metric over the last N days, using "
                            "ad-level Meta data fetched on demand. Use for questions about "
                            "specific ads: 'top/best/worst ads by ROAS/CTR/spend', 'which "
                            "ads to cut', 'top 5 ads and what they have in common'. Not for "
                            "campaign-level questions (those are already in the snapshot)."),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": list(_METRICS),
                               "description": "metric to rank by"},
                    "n": {"type": "integer", "description": "how many ads, default 5"},
                    "days": {"type": "integer", "description": "lookback window, default 14, max 60"},
                    "order": {"type": "string", "enum": ["top", "bottom"],
                              "description": "top = highest metric first (best for roas/ctr); "
                                             "bottom = lowest first (best for cpa, or worst ads)"},
                },
                "required": ["metric"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ad_trends",
            "description": ("Daily metric trend for ONE ad (frequency, CPM, link CTR, ROAS "
                            "day by day) plus a fatigue verdict. Use when asked to show the "
                            "metric movement behind a call on a specific ad."),
            "parameters": {
                "type": "object",
                "properties": {
                    "ad_name": {"type": "string", "description": "the ad name (or a distinctive part of it)"},
                    "days": {"type": "integer", "description": "lookback window, default 14, max 60"},
                },
                "required": ["ad_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "video_hook_rates",
            "description": ("Rank VIDEO ads by true hook rate = 3-second video views / "
                            "impressions (thumbstop), NOT CTR, over the last N days. Also "
                            "returns thruplay hold %. Use for 'hook rate', '3-second view "
                            "rate', 'which videos hook best'."),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "lookback window, default 14, max 60"},
                    "n": {"type": "integer", "description": "how many ads, default 10"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "audience_breakdown",
            "description": ("Ad-SET level performance (audiences/targeting) over the last N "
                            "days -- spend, ROAS, CTR, purchases per ad set. Use for questions "
                            "about audiences or which ad sets/targeting are winning."),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "lookback window, default 14, max 60"},
                    "n": {"type": "integer", "description": "how many ad sets, default 12"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "placement_breakdown",
            "description": ("Performance by PLACEMENT (publisher_platform x platform_position, "
                            "e.g. facebook/reels, instagram/stories) over the last N days -- "
                            "spend, ROAS, purchases, CTR per placement. Use for placement "
                            "questions or the placement layer of a root-cause breakdown."),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "lookback window, default 14, max 60"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "ad_fatigue_scan",
            "description": ("Scan ALL active ads for fatigue at the ad level and return the "
                            "fatiguing ones with their frequency, CPM and CTR trend (first "
                            "half vs second half of the window). Use for 'which ads are "
                            "fatiguing right now' with the supporting metric movement."),
            "parameters": {
                "type": "object",
                "properties": {
                    "days": {"type": "integer", "description": "lookback window, default 14, max 60"},
                },
            },
        },
    },
]


def _agg(rows: list[dict]) -> dict:
    spend = sum(r["spend"] for r in rows)
    revenue = sum(r["revenue"] for r in rows)
    impressions = sum(r["impressions"] for r in rows)
    link_clicks = sum(r["link_clicks"] for r in rows)
    purchases = sum(r["purchases"] for r in rows)
    freqs = [r["frequency"] for r in rows if r["frequency"]]
    return {
        "spend": round(spend), "revenue": round(revenue), "purchases": int(purchases),
        "roas": round(revenue / spend, 2) if spend else 0.0,
        "cpa": round(spend / purchases) if purchases else 0.0,
        "link_ctr": round(link_clicks / impressions * 100, 2) if impressions else 0.0,
        "cpm": round(spend / impressions * 1000) if impressions else 0.0,
        "frequency": round(sum(freqs) / len(freqs), 2) if freqs else 0.0,
        "days": len({r["date"] for r in rows}),
    }


def _by_ad(facts: list[dict]) -> dict[str, list[dict]]:
    """Group by the UNIQUE ad key (ad_id), not ad_name -- the same creative name
    repeats across adsets, so grouping by name merges distinct ads."""
    groups: dict[str, list[dict]] = {}
    for f in facts:
        if not f.get("ad_name"):
            continue
        key = f.get("ad_id") or f"{f.get('campaign_name')}|{f.get('adset_name')}|{f.get('ad_name')}"
        groups.setdefault(key, []).append(f)
    return groups


def _label(rows: list[dict]) -> str:
    return rows[0].get("ad_name") or "?"


def _pct(recent: float, prior: float):
    if prior == 0:
        return None if recent == 0 else 100.0
    return round((recent - prior) / prior * 100, 1)


def top_ads(facts: list[dict], metric: str = "roas", n: int = 5, order: str = "top",
            window: str = "") -> dict:
    if metric not in _METRICS:
        metric = "roas"
    groups = _by_ad(facts)
    total_spend = sum(f["spend"] for f in facts) or 1.0
    rows = []
    for fs in groups.values():
        a = _agg(fs)
        if a["spend"] < max(_MIN_SPEND, total_spend * 0.005):
            continue
        if metric in ("roas", "cpa") and a["purchases"] < _MIN_PURCHASES:
            continue
        rows.append({"ad": _label(fs), "campaign": fs[0].get("campaign_name"),
                     "adset": fs[0].get("adset_name"), **a})
    rows.sort(key=lambda r: r.get(metric) or 0, reverse=(order != "bottom"))
    return {"window": window, "metric": metric, "order": order,
            "ads_considered": len(rows), "ads": rows[:max(1, n)]}


def ad_trends(facts: list[dict], ad_name: str, window: str = "") -> dict:
    q = (ad_name or "").lower().strip()
    groups = _by_ad(facts)
    matches = [rows for rows in groups.values()
               if q and (q in _label(rows).lower() or _label(rows).lower() in q)]
    if not matches:
        return {"error": f"no ad matching '{ad_name}' in the ad-level data for this window"}
    # if several distinct ads match, take the highest-spend one
    fs = max(matches, key=lambda rows: sum(r["spend"] for r in rows))
    name = _label(fs)
    fs = sorted(fs, key=lambda r: r["date"])
    series = []
    for r in fs:
        imp = r["impressions"]
        series.append({"date": r["date"], "spend": round(r["spend"]),
                       "roas": round(r["roas"], 2),
                       "cpm": round(r["spend"] / imp * 1000) if imp else 0,
                       "link_ctr": round(r["link_ctr"], 2),
                       "frequency": round(r["frequency"], 2)})
    verdict = _fatigue_verdict(fs)
    return {"window": window, "ad": name, "campaign": fs[0].get("campaign_name"),
            "series": series, "verdict": verdict}


def _fatigue_verdict(fs: list[dict]) -> dict:
    """First half vs second half of an ad's daily series."""
    fs = sorted(fs, key=lambda r: r["date"])
    if len(fs) < 4:
        return {"call": "insufficient-data"}
    mid = len(fs) // 2
    a, b = _agg(fs[:mid]), _agg(fs[mid:])
    d = {"roas": _pct(b["roas"], a["roas"]), "link_ctr": _pct(b["link_ctr"], a["link_ctr"]),
         "cpm": _pct(b["cpm"], a["cpm"]), "frequency": _pct(b["frequency"], a["frequency"])}
    fatigue = (d["link_ctr"] is not None and d["link_ctr"] <= -20) and \
              ((d["frequency"] or 0) >= _NOISE or (d["cpm"] or 0) >= _NOISE)
    return {"call": "fatiguing" if fatigue else "stable", "deltas_pct": d,
            "first_half": {k: a[k] for k in ("roas", "link_ctr", "cpm", "frequency")},
            "second_half": {k: b[k] for k in ("roas", "link_ctr", "cpm", "frequency")}}


def ad_fatigue_scan(facts: list[dict], window: str = "", n: int = 10) -> dict:
    groups = _by_ad(facts)
    total_spend = sum(f["spend"] for f in facts) or 1.0
    fatiguing = []
    for fs in groups.values():
        a = _agg(fs)
        if a["spend"] < max(_MIN_SPEND, total_spend * 0.005) or a["purchases"] < _MIN_PURCHASES:
            continue
        v = _fatigue_verdict(fs)
        if v.get("call") == "fatiguing":
            fatiguing.append({"ad": _label(fs), "campaign": fs[0].get("campaign_name"),
                              "spend": a["spend"], "roas": a["roas"], "deltas_pct": v["deltas_pct"]})
    fatiguing.sort(key=lambda r: r["spend"], reverse=True)
    return {"window": window, "fatiguing_count": len(fatiguing), "ads": fatiguing[:n]}


def video_hook_rates(facts: list[dict], n: int = 10, window: str = "") -> dict:
    groups = _by_ad(facts)
    total_spend = sum(f["spend"] for f in facts) or 1.0
    rows = []
    for fs in groups.values():
        imp = sum(r["impressions"] for r in fs)
        v3 = sum(r.get("video_3s") or 0 for r in fs)
        tp = sum(r.get("thruplay") or 0 for r in fs)
        spend = sum(r["spend"] for r in fs)
        if not imp or v3 <= 0 or spend < max(_MIN_SPEND, total_spend * 0.005):
            continue                                  # not a (material) video ad
        rows.append({"ad": _label(fs), "campaign": fs[0].get("campaign_name"),
                     "spend": round(spend), "impressions": int(imp),
                     "hook_rate": round(v3 / imp * 100, 1),          # 3-sec view rate
                     "thruplay_hold_pct": round(tp / v3 * 100, 1) if v3 else 0.0,
                     "roas": _agg(fs)["roas"]})
    rows.sort(key=lambda r: r["hook_rate"], reverse=True)
    return {"window": window, "metric": "hook_rate = 3-sec video views / impressions",
            "video_ads": len(rows), "ads": rows[:max(1, n)]}


def _by_adset(facts: list[dict]) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {}
    for f in facts:
        name = f.get("adset_name")
        if name:
            key = f.get("adset_id") or f"{f.get('campaign_name')}|{name}"
            groups.setdefault(key, []).append(f)
    return groups


def audience_breakdown(facts: list[dict], n: int = 12, window: str = "") -> dict:
    groups = _by_adset(facts)
    total_spend = sum(f["spend"] for f in facts) or 1.0
    rows = []
    for fs in groups.values():
        a = _agg(fs)
        if a["spend"] < max(_MIN_SPEND, total_spend * 0.005):
            continue
        rows.append({"adset": fs[0].get("adset_name"), "campaign": fs[0].get("campaign_name"),
                     "spend": a["spend"], "roas": a["roas"], "purchases": a["purchases"],
                     "cpa": a["cpa"], "link_ctr": a["link_ctr"], "frequency": a["frequency"]})
    rows.sort(key=lambda r: r["spend"], reverse=True)
    return {"window": window, "adsets_considered": len(rows), "adsets": rows[:max(1, n)]}


def execute(name: str, args: dict, facts: list[dict], window: str = "") -> dict:
    """Dispatch a tool call over already-fetched ad-level facts."""
    if not facts:
        return {"error": "no ad-level data available for this window"}
    if name == "top_ads":
        return top_ads(facts, args.get("metric", "roas"), int(args.get("n", 5) or 5),
                       args.get("order", "top"), window)
    if name == "ad_trends":
        return ad_trends(facts, args.get("ad_name", ""), window)
    if name == "ad_fatigue_scan":
        return ad_fatigue_scan(facts, window)
    if name == "video_hook_rates":
        return video_hook_rates(facts, int(args.get("n", 10) or 10), window)
    if name == "audience_breakdown":
        return audience_breakdown(facts, int(args.get("n", 12) or 12), window)
    return {"error": f"unknown tool {name}"}
