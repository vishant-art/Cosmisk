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
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_transform as mt  # noqa: E402

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


# --- Materiality / reliability thresholds ---------------------------------
# Real accounts have a long tail of tiny/paused/engagement campaigns. ROAS on a
# campaign with 1-2 purchases is statistical noise (a single sale on ₹100 spend
# reads as 50x). These gates keep the brain from "discovering" that noise.
MATERIAL_SPEND_PCT = 0.01       # a campaign must be >=1% of total spend to count
MIN_PURCHASES_FOR_ROAS = 10     # ROAS untrustworthy below this many purchases
MIN_WINDOW_PURCHASES = 5        # per-window floor for trend (fatigue/scaling)
FATIGUE_DROP = 0.25             # ROAS must fall >=25% to call it fatigue
SCALING_RISE = 0.25             # ROAS must rise >=25% to call it scaling
FREQ_RISE = 1.10                # and frequency must climb >=10% for fatigue
MAX_FLAGS = 3                   # cap fatigue / scaling lines so output stays scannable


def campaign_windows(df):
    """Per-campaign totals + first-third vs last-third window stats, computed once."""
    rows = []
    for name, sub in df.groupby("campaign_name"):
        sub = sub.sort_values("date")
        k = max(1, len(sub) // 3)
        w0, w1 = sub.head(k), sub.tail(k)

        def _roas(x):
            s = x.spend.sum()
            return x.revenue.sum() / s if s else 0.0

        rows.append({
            "campaign_name": name,
            "spend": sub.spend.sum(),
            "revenue": sub.revenue.sum(),
            "purchases": sub.purchases.sum(),
            "roas": sub.revenue.sum() / sub.spend.sum() if sub.spend.sum() else 0.0,
            "active_days": int((sub.spend > 0).sum()),
            "w0_spend": w0.spend.sum(), "w1_spend": w1.spend.sum(),
            "w0_purch": w0.purchases.sum(), "w1_purch": w1.purchases.sum(),
            "r0": _roas(w0), "r1": _roas(w1),
            "f0": w0.frequency.mean(), "f1": w1.frequency.mean(),
        })
    return pd.DataFrame(rows)


def statements(df, currency):
    """Return a list of (tag, sentence) tuples, all deterministic."""
    out = []
    total_spend = df.spend.sum()
    total_rev = df.revenue.sum()
    blended = total_rev / total_spend if total_spend else 0
    days = df.date.nunique()

    out.append(("Overview",
        f"Across {days} days and {df.campaign_name.nunique()} campaigns you spent "
        f"{fmt_money(total_spend, currency)} and generated {fmt_money(total_rev, currency)} "
        f"in attributed revenue -- a blended ROAS of {blended:.2f}x on "
        f"{int(df.purchases.sum()):,} purchases."))

    # account-level trend: first third vs last third
    daily = mt.daily_totals(df)
    third = max(1, len(daily) // 3)
    first, last = daily.head(third), daily.tail(third)
    rev0, rev1 = first.revenue.sum(), last.revenue.sum()
    chg = (rev1 - rev0) / rev0 * 100 if rev0 else 0
    roas0 = first.revenue.sum() / first.spend.sum() if first.spend.sum() else 0
    roas1 = last.revenue.sum() / last.spend.sum() if last.spend.sum() else 0
    out.append(("Trend",
        f"Revenue {direction(chg)} {pct(chg)} from the first {third} days "
        f"({fmt_money(rev0, currency)}) to the last {third} days ({fmt_money(rev1, currency)}). "
        f"Blended ROAS moved {roas0:.2f}x -> {roas1:.2f}x."))

    # materiality-gated campaign analysis
    cw = campaign_windows(df)
    floor = total_spend * MATERIAL_SPEND_PCT
    material = cw[cw.spend >= floor]
    reliable = material[material.purchases >= MIN_PURCHASES_FOR_ROAS]

    # best / worst among campaigns that actually convert at volume
    if not reliable.empty:
        best = reliable.loc[reliable.roas.idxmax()]
        worst = reliable.loc[reliable.roas.idxmin()]
        out.append(("Best campaign",
            f"'{best.campaign_name}' is the efficiency leader at {best.roas:.2f}x ROAS "
            f"({fmt_money(best.revenue, currency)} on {fmt_money(best.spend, currency)}, "
            f"{int(best.purchases)} purchases)."))
        out.append(("Worst campaign",
            f"'{worst.campaign_name}' is the weakest converter that still has scale at "
            f"{worst.roas:.2f}x ROAS -- {fmt_money(worst.spend, currency)} spent for "
            f"{fmt_money(worst.revenue, currency)} back."))

    # wasted spend: material campaigns with zero attributed purchases
    zero = material[material.purchases == 0].sort_values("spend", ascending=False)
    if not zero.empty:
        names = ", ".join(f"'{r.campaign_name}' ({fmt_money(r.spend, currency)})"
                          for _, r in zero.head(3).iterrows())
        out.append(("Wasted spend",
            f"{len(zero)} material campaign(s) spent with ZERO attributed purchases: {names}."))

    # budget concentration (by spend, always meaningful)
    top = cw.loc[cw.spend.idxmax()]
    share = top.spend / total_spend * 100 if total_spend else 0
    out.append(("Budget concentration",
        f"'{top.campaign_name}' absorbs {share:.0f}% of spend "
        f"({fmt_money(top.spend, currency)}) at {top.roas:.2f}x ROAS."))

    # fatigue: material spend both windows, real first-window volume, ROAS drop + freq rise
    fat = material[
        (material.w0_spend >= floor * 0.3) & (material.w1_spend >= floor * 0.3)
        & (material.w0_purch >= MIN_WINDOW_PURCHASES) & (material.r0 > 0)
        & ((material.r1 - material.r0) / material.r0 <= -FATIGUE_DROP)
        & (material.f1 > material.f0 * FREQ_RISE)
    ].sort_values("w1_spend", ascending=False).head(MAX_FLAGS)
    for _, c in fat.iterrows():
        out.append(("WARN fatigue",
            f"'{c.campaign_name}' shows fatigue: ROAS fell "
            f"{pct((c.r1 - c.r0) / c.r0 * 100)} ({c.r0:.2f}x -> {c.r1:.2f}x) while frequency "
            f"climbed {c.f0:.1f} -> {c.f1:.1f}."))

    # scaling: material spend AND real volume in BOTH windows (kills 1-sale noise)
    scal = material[
        (material.w0_spend >= floor * 0.3) & (material.w1_spend >= floor * 0.3)
        & (material.w0_purch >= MIN_WINDOW_PURCHASES) & (material.w1_purch >= MIN_WINDOW_PURCHASES)
        & (material.r0 > 0)
        & ((material.r1 - material.r0) / material.r0 >= SCALING_RISE)
    ].sort_values("w1_spend", ascending=False).head(MAX_FLAGS)
    for _, c in scal.iterrows():
        out.append(("UP scaling",
            f"'{c.campaign_name}' is heating up: ROAS improved "
            f"{pct((c.r1 - c.r0) / c.r0 * 100)} ({c.r0:.2f}x -> {c.r1:.2f}x) -- "
            f"a candidate for more budget."))

    # "bad day": largest negative deviation from the trailing 7-day ROAS trend
    daily = daily.copy()
    daily["roll"] = daily.roas.rolling(7, min_periods=3).mean()
    daily["dev"] = (daily.roas - daily.roll) / daily.roll * 100
    bad = daily.dropna(subset=["dev"]).nsmallest(1, "dev")
    if not bad.empty:
        b = bad.iloc[0]
        out.append(("Bad day",
            f"{b.date.date()} was the worst day: ROAS {b.roas:.2f}x, {pct(b.dev)} below its "
            f"7-day trend, on {fmt_money(b.spend, currency)} spend."))
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
    ap = argparse.ArgumentParser(description="Deterministic NL brain over Meta Ads data")
    ap.add_argument("--data", default=str(Path(__file__).with_name("mock_meta_ads.json")))
    ap.add_argument("--plots", action="store_true", help="also render EDA charts")
    ap.add_argument("--outdir", default=str(Path(__file__).with_name("plots")))
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
