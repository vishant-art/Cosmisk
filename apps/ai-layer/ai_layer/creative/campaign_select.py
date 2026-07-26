"""Pick the source campaigns the brand kit is grounded in, and compress them into
a factual text summary for the brain.

Reuses the rnd L1 transform (`meta_transform`) so the campaign aggregates are the
same trusted contract the rest of the AI layer uses.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

# rnd/creative/src -> rnd/src (the shared L1 transform lives there)
from ai_layer import meta_transform as mt

Strategy = str  # "last-n" | "top-roas" | "top-revenue" | "all"


def load_dataset(path: str) -> mt.Dataset:
    return mt.load(path)


def select_campaigns(ds: mt.Dataset, strategy: Strategy = "top-roas",
                     n: int = 5) -> pd.DataFrame:
    """Return a per-campaign summary frame for the selected subset."""
    df = ds.to_dataframe()
    if df.empty:
        return df
    cs = mt.campaign_summary(df)                 # sorted by spend desc
    if strategy == "all":
        return cs
    if strategy == "top-roas":
        cs = cs.sort_values("roas", ascending=False)
    elif strategy == "top-revenue":
        cs = cs.sort_values("revenue", ascending=False)
    elif strategy == "last-n":
        # most-recently-active campaigns: rank by each campaign's latest date
        last = (df.groupby("campaign_name")["date"].max()
                  .sort_values(ascending=False).head(n).index)
        return cs[cs.campaign_name.isin(last)].reset_index(drop=True)
    else:  # default: top spenders (campaign_summary is already spend-sorted)
        pass
    return cs.head(n).reset_index(drop=True)


def summarize(ds: mt.Dataset, subset: pd.DataFrame) -> str:
    """Compact, factual block describing the selected winners -- what the brand
    kit is reasoned from (what's working for this brand)."""
    if subset.empty:
        return f"ACCOUNT: {ds.account_name} ({ds.currency})\n(no campaigns selected)"
    lines = [
        f"ACCOUNT: {ds.account_name}   CURRENCY: {ds.currency}   "
        f"WINDOW: {ds.since or '?'} to {ds.until or '?'}",
        f"SELECTED {len(subset)} CAMPAIGNS (name | spend | revenue | roas | purchases | link_ctr%):",
    ]
    for _, r in subset.iterrows():
        lines.append(
            f"  - {r.campaign_name}: spend={r.spend:.0f} | revenue={r.revenue:.0f} | "
            f"roas={r.roas:.2f} | purchases={int(r.purchases)} | link_ctr={r.link_ctr:.2f}"
        )
    return "\n".join(lines)
