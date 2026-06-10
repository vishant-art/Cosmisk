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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_common as mc  # noqa: E402

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
    daily = mc.daily_totals(df)
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

    cs = mc.campaign_summary(df)
    best = cs.loc[cs.roas.idxmax()]
    worst = cs.loc[cs.roas.idxmin()]
    out.append(("Best campaign",
        f"'{best.campaign_name}' is the efficiency leader at {best.roas:.2f}x ROAS "
        f"({fmt_money(best.revenue, currency)} on {fmt_money(best.spend, currency)})."))
    out.append(("Worst campaign",
        f"'{worst.campaign_name}' is the laggard at {worst.roas:.2f}x ROAS -- "
        f"{fmt_money(worst.spend, currency)} spent for {fmt_money(worst.revenue, currency)} back."))

    top = cs.iloc[0]
    share = top.spend / total_spend * 100 if total_spend else 0
    out.append(("Budget concentration",
        f"'{top.campaign_name}' absorbs {share:.0f}% of spend "
        f"({fmt_money(top.spend, currency)}) at {top.roas:.2f}x ROAS."))

    # per-campaign fatigue / scaling detection
    for name, sub in df.groupby("campaign_name"):
        sub = sub.sort_values("date")
        k = max(1, len(sub) // 3)
        s0, s1 = sub.head(k), sub.tail(k)
        r0 = s0.revenue.sum() / s0.spend.sum() if s0.spend.sum() else 0
        r1 = s1.revenue.sum() / s1.spend.sum() if s1.spend.sum() else 0
        f0, f1 = s0.frequency.mean(), s1.frequency.mean()
        if r0 and (r1 - r0) / r0 < -0.2 and f1 > f0:
            out.append(("WARN fatigue",
                f"'{name}' shows fatigue: ROAS fell {pct((r1 - r0) / r0 * 100)} "
                f"({r0:.2f}x -> {r1:.2f}x) while frequency climbed {f0:.1f} -> {f1:.1f}."))
        elif r0 and (r1 - r0) / r0 > 0.2:
            out.append(("UP scaling",
                f"'{name}' is heating up: ROAS improved {pct((r1 - r0) / r0 * 100)} "
                f"({r0:.2f}x -> {r1:.2f}x) -- a candidate for more budget."))

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
    daily = mc.daily_totals(df)
    cs = mc.campaign_summary(df)
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

    meta, rows = mc.load_insights(args.data)
    currency = meta.get("currency", "INR")
    df = mc.to_dataframe(rows)
    if df.empty:
        print("No rows in data.")
        return

    dr = meta.get("date_range", {})
    print(f"\n=== BRAIN: {meta.get('account_name', '(unknown account)')} "
          f"[{dr.get('since', '?')} -> {dr.get('until', '?')}] ===\n")
    for tag, line in statements(df, currency):
        print(f"- [{tag}] {line}\n")

    if args.plots:
        saved = make_plots(df, args.outdir, currency)
        print(f"Saved {len(saved)} charts to {args.outdir}:")
        for p in saved:
            print(f"   {p.name}")


if __name__ == "__main__":
    main()
