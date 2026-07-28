"""Deterministic analysis layer for the Meta Ads chat -- pure Python, NO LLM.

Every number here is computed in code and templated into text, so it cannot
hallucinate. The chat injects this block alongside the raw snapshot; the LLM is
told to treat it as ground truth for trends/deltas and only phrase the causes we
hand it -- it never recomputes the math.

Design mirrors the product's own analysis engines (apps/ai-layer/ai_layer/brain.py
and the trend-analyzer patterns), rewritten standalone:
  - period-over-period delta = (recent - prior) / prior * 100, with a noise band
  - direction bucketing (rising / declining / stable) at +/-NOISE_PCT
  - materiality + volume gates so thin campaigns never produce fake trends
  - flags: fatigue, scaling, CTR decline, CPM spike
  - a 7-day trailing rolling-mean anomaly ("worst day")
  - a rule engine that emits deterministic CANDIDATE CAUSES from the evidence

Operates on the same fact dicts chat.normalize() produces (keys: campaign_name,
date, spend, revenue, impressions, purchases, roas, frequency, cpm, link_ctr...).
"""
from __future__ import annotations

from datetime import date, timedelta

# --- thresholds (ported from the product's brain.py) ------------------------
NOISE_PCT = 10.0            # +/- band below which a move is "stable" / ignored
MATERIAL_SPEND_PCT = 0.01   # a campaign must be >=1% of account spend to matter
MIN_WINDOW_PURCHASES = 5    # min purchases in the recent window for ROAS to be trusted
FATIGUE_ROAS_DROP = 25.0    # ROAS down >=25% ...
FATIGUE_FREQ_RISE = 10.0    # ... AND frequency up >=10% -> fatigue
SCALING_ROAS_RISE = 25.0    # ROAS up >=25% -> scaling / heating up
CTR_DROP = 20.0             # link CTR down >=20% -> weakening hook
CPM_SPIKE = 30.0            # CPM up >=30% -> delivery getting expensive
ANOMALY_DEV = 20.0          # a day >=20% below its 7-day trailing ROAS is a "bad day"
MAX_CAMPAIGN_FINDINGS = 8   # keep the injected block compact

# metrics we compute deltas for, in display order
_DELTA_METRICS = ("roas", "spend", "revenue", "purchases", "cpa", "link_ctr", "cpm", "frequency")


def _d(iso: str) -> date:
    return date.fromisoformat(iso)


def _pct_change(recent: float, prior: float) -> float | None:
    """(recent - prior) / prior * 100. None when there's no comparable prior."""
    if prior == 0:
        return None if recent == 0 else 100.0
    return (recent - prior) / prior * 100.0


def _direction(pct: float | None) -> str:
    if pct is None:
        return "n/a"
    if pct >= NOISE_PCT:
        return "rising"
    if pct <= -NOISE_PCT:
        return "declining"
    return "stable"


def _aggregate(rows: list[dict]) -> dict:
    """Roll a set of (campaign x day) rows into one window aggregate. Ratios are
    recomputed from the summed base metrics (never averaged); frequency is the
    mean of daily frequency (it can't be summed -- reach dedupes across days)."""
    spend = sum(r["spend"] for r in rows)
    revenue = sum(r["revenue"] for r in rows)
    impressions = sum(r["impressions"] for r in rows)
    link_clicks = sum(r["link_clicks"] for r in rows)
    purchases = sum(r["purchases"] for r in rows)
    freqs = [r["frequency"] for r in rows if r["frequency"]]
    return {
        "spend": spend,
        "revenue": revenue,
        "impressions": impressions,
        "purchases": purchases,
        "roas": revenue / spend if spend else 0.0,
        "cpa": spend / purchases if purchases else 0.0,
        "link_ctr": link_clicks / impressions * 100 if impressions else 0.0,
        "cpm": spend / impressions * 1000 if impressions else 0.0,
        "frequency": sum(freqs) / len(freqs) if freqs else 0.0,
        "days": len({r["date"] for r in rows}),
    }


def _split(rows: list[dict], max_date: date, period_days: int) -> tuple[list[dict], list[dict]]:
    """Recent = last `period_days`; prior = the `period_days` before that."""
    recent_start = max_date - timedelta(days=period_days - 1)
    prior_start = max_date - timedelta(days=2 * period_days - 1)
    recent = [r for r in rows if recent_start <= _d(r["date"]) <= max_date]
    prior = [r for r in rows if prior_start <= _d(r["date"]) < recent_start]
    return recent, prior


def _deltas(recent_agg: dict, prior_agg: dict) -> dict:
    return {m: _pct_change(recent_agg[m], prior_agg[m]) for m in _DELTA_METRICS}


def _causes(pct: dict) -> list[str]:
    """Deterministic candidate-cause tags from the metric deltas. The LLM only
    phrases/ranks these; it does not invent causes. Each tag carries its numbers."""
    causes: list[str] = []

    def dn(m):  # declined beyond noise
        return pct.get(m) is not None and pct[m] <= -NOISE_PCT

    def up(m):  # rose beyond noise
        return pct.get(m) is not None and pct[m] >= NOISE_PCT

    def flat(m):
        return pct.get(m) is not None and abs(pct[m]) < NOISE_PCT

    if dn("roas") and up("frequency"):
        causes.append(f"creative fatigue -- frequency up {pct['frequency']:.0f}% "
                      f"while ROAS fell {abs(pct['roas']):.0f}%")
    if dn("roas") and up("cpm"):
        causes.append(f"rising delivery cost -- CPM up {pct['cpm']:.0f}%")
    if dn("purchases") and (flat("link_ctr") or up("link_ctr")):
        causes.append(f"downstream conversion drop -- traffic held (CTR "
                      f"{'+' if (pct['link_ctr'] or 0) >= 0 else ''}{pct['link_ctr']:.0f}%) "
                      f"but purchases fell {abs(pct['purchases']):.0f}% (offer / landing / checkout)")
    if dn("link_ctr"):
        causes.append(f"weakening hook -- link CTR down {abs(pct['link_ctr']):.0f}%")
    if up("spend") and dn("roas"):
        causes.append(f"scaling at a cost -- spend up {pct['spend']:.0f}% but "
                      f"ROAS down {abs(pct['roas']):.0f}%")
    if up("spend") and up("roas"):
        causes.append(f"efficient scaling -- spend up {pct['spend']:.0f}% with "
                      f"ROAS up {pct['roas']:.0f}%")
    return causes


def _flag(pct: dict) -> str | None:
    r, f = pct.get("roas"), pct.get("frequency")
    if r is not None and r <= -FATIGUE_ROAS_DROP and f is not None and f >= FATIGUE_FREQ_RISE:
        return "FATIGUE"
    if r is not None and r >= SCALING_ROAS_RISE:
        return "SCALING"
    if pct.get("link_ctr") is not None and pct["link_ctr"] <= -CTR_DROP:
        return "CTR-DECLINE"
    if pct.get("cpm") is not None and pct["cpm"] >= CPM_SPIKE:
        return "CPM-SPIKE"
    return None


def _worst_day(facts: list[dict]) -> dict | None:
    """Account daily ROAS vs its trailing 7-day mean; return the worst dip."""
    by_date: dict[str, dict] = {}
    for f in facts:
        g = by_date.setdefault(f["date"], {"spend": 0.0, "revenue": 0.0})
        g["spend"] += f["spend"]
        g["revenue"] += f["revenue"]
    series = sorted(by_date.items())
    roas = [(v["revenue"] / v["spend"] if v["spend"] else 0.0) for _, v in series]
    worst = None
    for i in range(len(series)):
        window = roas[max(0, i - 6):i + 1]
        if len(window) < 3:
            continue
        mean = sum(window) / len(window)
        if mean <= 0:
            continue
        dev = (roas[i] - mean) / mean * 100
        if worst is None or dev < worst["dev"]:
            worst = {"date": series[i][0], "roas": roas[i], "mean": mean, "dev": dev}
    if worst and worst["dev"] <= -ANOMALY_DEV:
        return worst
    return None


def analyze(facts: list[dict], currency: str = "INR") -> dict:
    """Compute the full deterministic analysis over the loaded facts."""
    if not facts:
        return {"windows": [], "account": [], "campaigns": [], "anomaly": None,
                "span": None}

    max_date = max(_d(f["date"]) for f in facts)
    min_date = min(_d(f["date"]) for f in facts)
    span_days = (max_date - min_date).days + 1

    # which period comparisons the loaded window can actually support
    periods = []
    if span_days >= 14:
        periods.append(("WoW", 7))
    if span_days >= 60:
        periods.append(("MoM", 30))

    account: list[dict] = []
    for label, pdays in periods:
        rec, pri = _split(facts, max_date, pdays)
        if not rec or not pri:
            continue
        ra, pa = _aggregate(rec), _aggregate(pri)
        account.append({"period": label, "recent": ra, "prior": pa,
                        "pct": _deltas(ra, pa)})

    # per-campaign, only over the shortest available period (freshest signal)
    campaigns: list[dict] = []
    if periods:
        label, pdays = periods[0]
        rec_all, _ = _split(facts, max_date, pdays)
        acct_recent_spend = sum(r["spend"] for r in rec_all) or 1.0
        by_camp: dict[str, list[dict]] = {}
        for f in facts:
            by_camp.setdefault(f["campaign_name"], []).append(f)
        for name, rows in by_camp.items():
            rec, pri = _split(rows, max_date, pdays)
            if not rec or not pri:
                continue
            ra, pa = _aggregate(rec), _aggregate(pri)
            if ra["spend"] < MATERIAL_SPEND_PCT * acct_recent_spend:
                continue                                  # immaterial spend
            if ra["purchases"] < MIN_WINDOW_PURCHASES:
                continue                                  # too few conversions to trust ROAS
            pct = _deltas(ra, pa)
            flag = _flag(pct)
            roas_move = abs(pct["roas"]) if pct["roas"] is not None else 0.0
            if not flag and roas_move < 15:               # not noteworthy
                continue
            campaigns.append({"campaign": name, "period": label, "recent": ra,
                              "prior": pa, "pct": pct, "flag": flag,
                              "causes": _causes(pct), "spend": ra["spend"]})
        campaigns.sort(key=lambda c: (c["flag"] is None, -c["spend"]))
        campaigns = campaigns[:MAX_CAMPAIGN_FINDINGS]

    return {
        "windows": [p[0] for p in periods],
        "span": {"since": min_date.isoformat(), "until": max_date.isoformat(),
                 "days": span_days},
        "account": account,
        "campaigns": campaigns,
        "anomaly": _worst_day(facts),
    }


# --- rendering --------------------------------------------------------------

def _sign(pct: float | None) -> str:
    if pct is None:
        return "n/a"
    return f"{pct:+.0f}%"


def _acct_line(a: dict) -> str:
    p = a["pct"]
    ra, pa = a["recent"], a["prior"]
    roas = f"ROAS {pa['roas']:.2f}x -> {ra['roas']:.2f}x ({_direction(p['roas'])}, {_sign(p['roas'])})"
    parts = [f"spend {_sign(p['spend'])}", f"revenue {_sign(p['revenue'])}",
             f"purchases {_sign(p['purchases'])}", f"CPA {_sign(p['cpa'])}",
             f"CTR {_sign(p['link_ctr'])}", f"freq {_sign(p['frequency'])}"]
    return f"  {a['period']}: {roas} | " + " | ".join(parts)


def render_analysis_block(result: dict, currency: str = "INR") -> str:
    if not result.get("account") and not result.get("campaigns"):
        span = result.get("span")
        if span:
            return (f"(Window is {span['days']} days -- too short for a period-over-period "
                    f"comparison; need >=14 days for week-over-week. Only current numbers "
                    f"above apply.)")
        return "(No data to analyze.)"

    span = result["span"]
    lines = [
        f"Data window: {span['since']}..{span['until']} ({span['days']} days). "
        f"Comparisons available: {', '.join(result['windows'])}.",
        "All figures below are computed in code and exact.",
        "",
        "ACCOUNT TREND:",
    ]
    for a in result["account"]:
        lines.append(_acct_line(a))
    if not result["account"]:
        lines.append("  (not enough history for an account-level comparison)")

    if result.get("anomaly"):
        w = result["anomaly"]
        lines += ["", f"WORST DAY (vs its trailing 7-day ROAS): {w['date']} "
                      f"ROAS {w['roas']:.2f}x, {w['dev']:.0f}% below its ~{w['mean']:.2f}x trend."]

    if result.get("campaigns"):
        lines += ["", "CAMPAIGN SIGNALS (material campaigns only; period = "
                      f"{result['campaigns'][0]['period']}):"]
        for c in result["campaigns"]:
            p = c["pct"]
            tag = f"[{c['flag']}] " if c["flag"] else ""
            head = (f"  {tag}{c['campaign']}: ROAS {c['prior']['roas']:.2f}x -> "
                    f"{c['recent']['roas']:.2f}x ({_sign(p['roas'])}), "
                    f"spend {_sign(p['spend'])}, freq {_sign(p['frequency'])}, "
                    f"CTR {_sign(p['link_ctr'])}")
            lines.append(head)
            for cause in c["causes"]:
                lines.append(f"       likely: {cause}")
    return "\n".join(lines)
