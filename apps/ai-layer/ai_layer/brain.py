"""File 1 -- the deterministic "brain".

Reads a Meta Ads Insights pull (mock or live-exported JSON) and prints
declarative, plain-English statements about it. NO LLM: every sentence is
computed from the numbers and filled into a template, so it cannot hallucinate.
Optionally renders EDA charts with --plots.

    python brain.py                  # uses mock_meta_ads.json
    python brain.py --data path.json
    python brain.py --plots          # also writes charts to ./plots
"""
from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

from ai_layer import meta_transform as mt

# Windows consoles default to cp1252 and choke on ₹/€; force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def fmt_money(x, currency="INR"):
    sym = {"INR": "₹", "USD": "$", "EUR": "€", "GBP": "£"}.get(currency, "")
    if abs(x) >= 1e7:
        return f"{sym}{x / 1e7:.2f}Cr"
    if abs(x) >= 1e5:
        return f"{sym}{x / 1e5:.2f}L"
    if abs(x) >= 1e3:
        return f"{sym}{x / 1e3:.1f}K"
    return f"{sym}{x:,.0f}"


def pct(x):
    return f"{x:+.1f}%"


def direction(x, up="rose", down="fell", flat="held steady"):
    if x > 1.5:
        return up
    if x < -1.5:
        return down
    return flat


# Adapter-only gate (kept from the legacy engine): ROAS is untrustworthy below
# this many whole-window purchases, used by statements()'s best/worst gate.
MIN_PURCHASES_FOR_ROAS = 10


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


def statements(df, currency: str = "INR") -> list[tuple[str, str]]:
    """Legacy (tag, sentence) contract for GET /insights, now driven by analyze().
    Tags stay within api._PRIORITY's vocabulary so the cards keep rendering."""
    facts = df.to_dict("records")
    for f in facts:                                # normalize dates to ISO strings
        d = f.get("date")
        f["date"] = d.isoformat()[:10] if hasattr(d, "isoformat") else str(d)[:10]
    out: list[tuple[str, str]] = []

    total_spend = sum(f["spend"] for f in facts)
    total_rev = sum(f["revenue"] for f in facts)
    blended = total_rev / total_spend if total_spend else 0.0
    days = len({f["date"] for f in facts})
    n_campaigns = len({f["campaign_name"] for f in facts})
    out.append(("Overview",
        f"Across {days} days and {n_campaigns} campaigns you spent "
        f"{fmt_money(total_spend, currency)} and generated {fmt_money(total_rev, currency)} "
        f"in attributed revenue -- a blended ROAS of {blended:.2f}x on "
        f"{int(sum(f['purchases'] for f in facts)):,} purchases."))

    res = analyze(facts, currency=currency)

    if res["account"]:
        a = res["account"][0]                      # freshest period (WoW when available)
        p, ra, pa = a["pct"], a["recent"], a["prior"]
        out.append(("Trend",
            f"{a['period']}: blended ROAS moved {pa['roas']:.2f}x -> {ra['roas']:.2f}x "
            f"({_sign(p['roas'])}, {_direction(p['roas'])}); spend {_sign(p['spend'])}, "
            f"revenue {_sign(p['revenue'])}, purchases {_sign(p['purchases'])}."))

    # best / worst / wasted / concentration: whole-window campaign totals,
    # same gates as the old statements (materiality + MIN_PURCHASES_FOR_ROAS)
    by_camp: dict[str, dict] = {}
    for f in facts:
        g = by_camp.setdefault(f["campaign_name"],
                               {"spend": 0.0, "revenue": 0.0, "purchases": 0.0})
        g["spend"] += f["spend"]; g["revenue"] += f["revenue"]; g["purchases"] += f["purchases"]
    floor = total_spend * MATERIAL_SPEND_PCT
    material = {n: g for n, g in by_camp.items() if g["spend"] >= floor}
    reliable = {n: g for n, g in material.items()
                if g["purchases"] >= MIN_PURCHASES_FOR_ROAS}
    if reliable:
        roas_of = {n: (g["revenue"] / g["spend"] if g["spend"] else 0.0)
                   for n, g in reliable.items()}
        bn, wn = max(roas_of, key=roas_of.get), min(roas_of, key=roas_of.get)
        b, w = reliable[bn], reliable[wn]
        out.append(("Best campaign",
            f"'{bn}' is the efficiency leader at {roas_of[bn]:.2f}x ROAS "
            f"({fmt_money(b['revenue'], currency)} on {fmt_money(b['spend'], currency)}, "
            f"{int(b['purchases'])} purchases)."))
        out.append(("Worst campaign",
            f"'{wn}' is the weakest converter that still has scale at "
            f"{roas_of[wn]:.2f}x ROAS -- {fmt_money(w['spend'], currency)} spent for "
            f"{fmt_money(w['revenue'], currency)} back."))
    zero = sorted((x for x in material.items() if x[1]["purchases"] == 0),
                  key=lambda x: -x[1]["spend"])
    if zero:
        names = ", ".join(f"'{n}' ({fmt_money(g['spend'], currency)})" for n, g in zero[:3])
        out.append(("Wasted spend",
            f"{len(zero)} material campaign(s) spent with ZERO attributed purchases: {names}."))
    if by_camp:
        top_n = max(by_camp, key=lambda n: by_camp[n]["spend"])
        tg = by_camp[top_n]
        share = tg["spend"] / total_spend * 100 if total_spend else 0.0
        troas = tg["revenue"] / tg["spend"] if tg["spend"] else 0.0
        out.append(("Budget concentration",
            f"'{top_n}' absorbs {share:.0f}% of spend "
            f"({fmt_money(tg['spend'], currency)}) at {troas:.2f}x ROAS."))

    for c in res["campaigns"]:                     # calendar-period flags -> legacy tags
        p = c["pct"]
        if c["flag"] == "FATIGUE":
            out.append(("WARN fatigue",
                f"'{c['campaign']}' shows fatigue ({c['period']}): ROAS "
                f"{c['prior']['roas']:.2f}x -> {c['recent']['roas']:.2f}x "
                f"({_sign(p['roas'])}) while frequency moved {_sign(p['frequency'])}."))
        elif c["flag"] == "SCALING":
            out.append(("UP scaling",
                f"'{c['campaign']}' is heating up ({c['period']}): ROAS "
                f"{c['prior']['roas']:.2f}x -> {c['recent']['roas']:.2f}x "
                f"({_sign(p['roas'])}) -- a candidate for more budget."))

    if res.get("anomaly"):
        w = res["anomaly"]
        out.append(("Bad day",
            f"{w['date']} was the worst day: ROAS {w['roas']:.2f}x, {w['dev']:.0f}% below "
            f"its ~{w['mean']:.2f}x 7-day trend."))
    return out


def make_plots(df, outdir, currency):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    outdir = Path(outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    daily = mt.daily_totals(df)
    cs = mt.campaign_summary(df)
    saved = []

    def save(fig, name):
        p = outdir / name
        fig.savefig(p, dpi=110, bbox_inches="tight")
        plt.close(fig)
        saved.append(p)

    # 1. daily spend vs revenue
    fig, ax = plt.subplots(figsize=(10, 5))
    ax.plot(daily.date, daily.spend, color="#d9534f", label="Spend")
    ax.plot(daily.date, daily.revenue, color="#5cb85c", label="Revenue")
    ax.set_title("Daily spend vs revenue")
    ax.set_ylabel(currency)
    ax.legend()
    fig.autofmt_xdate()
    save(fig, "01_spend_vs_revenue.png")

    # 2. daily blended ROAS
    fig, ax = plt.subplots(figsize=(10, 4))
    ax.plot(daily.date, daily.roas, color="#0275d8", marker="o", ms=3)
    ax.axhline(1.0, color="grey", ls="--", lw=0.8)
    ax.set_title("Daily blended ROAS")
    ax.set_ylabel("ROAS (x)")
    fig.autofmt_xdate()
    save(fig, "02_blended_roas.png")

    # 3. spend by campaign
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.barh(cs.campaign_name, cs.spend, color="#f0ad4e")
    ax.set_title("Spend by campaign")
    ax.set_xlabel(currency)
    ax.invert_yaxis()
    save(fig, "03_spend_by_campaign.png")

    # 4. ROAS by campaign (red below 2x)
    fig, ax = plt.subplots(figsize=(9, 5))
    ax.barh(cs.campaign_name, cs.roas, color=["#5cb85c" if r >= 2 else "#d9534f" for r in cs.roas])
    ax.axvline(1.0, color="grey", ls="--", lw=0.8)
    ax.set_title("ROAS by campaign")
    ax.set_xlabel("ROAS (x)")
    ax.invert_yaxis()
    save(fig, "04_roas_by_campaign.png")

    # 5. spend share (pie)
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.pie(cs.spend, labels=cs.campaign_name, autopct="%1.0f%%", startangle=90)
    ax.set_title("Spend share by campaign")
    save(fig, "05_spend_share.png")

    # 6. conversion funnel (account total)
    funnel = {
        "Link clicks": df.link_clicks.sum(),
        "Add to cart": df.add_to_cart.sum(),
        "Checkout": df.checkout.sum(),
        "Purchases": df.purchases.sum(),
    }
    fig, ax = plt.subplots(figsize=(8, 5))
    ax.bar(list(funnel.keys()), list(funnel.values()), color="#5bc0de")
    ax.set_title("Conversion funnel (account total)")
    ax.set_ylabel("count")
    for i, v in enumerate(funnel.values()):
        ax.text(i, v, f"{int(v):,}", ha="center", va="bottom", fontsize=8)
    save(fig, "06_funnel.png")

    return saved


def main():
    app_root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser(description="Deterministic NL brain over Meta Ads data")
    ap.add_argument("--data", default=str(app_root / "data" / "mock_meta_ads.json"))
    ap.add_argument("--plots", action="store_true", help="also render EDA charts")
    ap.add_argument("--outdir", default=str(app_root / "plots"))
    args = ap.parse_args()

    ds = mt.load(args.data)
    currency = ds.currency
    df = ds.to_dataframe()
    if df.empty:
        print("No rows in data.")
        return

    print(f"\n=== BRAIN: {ds.account_name} "
          f"[{ds.since or '?'} -> {ds.until or '?'}] ===\n")
    for tag, line in statements(df, currency):
        print(f"- [{tag}] {line}\n")

    if args.plots:
        saved = make_plots(df, args.outdir, currency)
        print(f"Saved {len(saved)} charts to {args.outdir}:")
        for p in saved:
            print(f"   {p.name}")


if __name__ == "__main__":
    main()
