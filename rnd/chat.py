"""File 3 -- RAG chatbot over Meta Ads data (context-injection style).

A single account's metrics are compact, so instead of embedding + retrieving we
inject a compressed, factual snapshot of the whole dataset into the model's
system context every turn. The model answers ONLY from that snapshot, which
removes retrieval-miss risk and keeps it from inventing numbers. Uses OpenRouter
(OpenAI-compatible API).

    python chat.py                  # mock_meta_ads.json
    python chat.py --data path.json
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_common as mc  # noqa: E402

# Windows consoles default to cp1252 and choke on ₹/€; force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# ---- model config (change here, not in env) ----
MODEL = "google/gemini-3.1-flash-lite"
TEMPERATURE = 0.2

SYSTEM = (
    "You are a Meta Ads analyst. Answer the user's questions using ONLY the data "
    "snapshot below. Do NOT invent numbers; if an answer is not derivable from the "
    "snapshot, say so plainly. Be concise and specific, cite the actual figures with "
    "their currency, and when useful compute simple derived values (ratios, % change) "
    "directly from the snapshot.\n\n"
    "=== DATA SNAPSHOT ===\n{context}\n=== END SNAPSHOT ==="
)


def build_context(meta, df):
    """Compress the dataset into a factual text block the model reasons over."""
    currency = meta.get("currency", "INR")
    daily = mc.daily_totals(df)
    cs = mc.campaign_summary(df)
    dr = meta.get("date_range", {})

    lines = [
        f"ACCOUNT: {meta.get('account_name', '?')}   CURRENCY: {currency}   "
        f"WINDOW: {dr.get('since', '?')} to {dr.get('until', '?')}",
        f"TOTALS: spend={df.spend.sum():.0f}  revenue={df.revenue.sum():.0f}  "
        f"blended_roas={(df.revenue.sum() / df.spend.sum() if df.spend.sum() else 0):.2f}  "
        f"purchases={int(df.purchases.sum())}",
        "",
        "PER-CAMPAIGN TOTALS (spend | revenue | roas | purchases | cpa | avg_freq | ctr%):",
    ]
    for _, r in cs.iterrows():
        lines.append(
            f"  - {r.campaign_name}: spend={r.spend:.0f} | revenue={r.revenue:.0f} | "
            f"roas={r.roas:.2f} | purchases={int(r.purchases)} | cpa={r.cpa:.0f} | "
            f"avg_freq={r.avg_frequency:.2f} | ctr={r.ctr:.2f}"
        )
    lines += ["", "DAILY ACCOUNT TOTALS (date | spend | revenue | roas):"]
    for _, r in daily.iterrows():
        lines.append(f"  {r.date.date()} | {r.spend:.0f} | {r.revenue:.0f} | {r.roas:.2f}")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(Path(__file__).with_name("mock_meta_ads.json")))
    args = ap.parse_args()

    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    key = os.getenv("OPENROUTER_API_KEY")
    base = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    if not key:
        print("OPENROUTER_API_KEY not set in ../.env")
        sys.exit(1)

    meta, rows = mc.load_insights(args.data)
    df = mc.to_dataframe(rows)
    if df.empty:
        print("No data rows.")
        sys.exit(1)
    context = build_context(meta, df)

    client = OpenAI(api_key=key, base_url=base)
    messages = [{"role": "system", "content": SYSTEM.format(context=context)}]

    print(f"RAG chat over '{meta.get('account_name', 'data')}' via {MODEL}.")
    print("Ask about spend, ROAS, campaigns, trends, fatigue. 'exit' to quit.")
    print("Try: 'which campaign should I cut?'  'how did ROAS trend?'  'what's my blended ROAS?'\n")

    while True:
        try:
            q = input("you > ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not q:
            continue
        if q.lower() in {"exit", "quit", "/exit"}:
            break
        messages.append({"role": "user", "content": q})
        try:
            resp = client.chat.completions.create(
                model=MODEL, temperature=TEMPERATURE, messages=messages,
            )
        except Exception as e:  # noqa: BLE001 -- surface any API error, keep the REPL alive
            print(f"  [api error] {e}\n")
            messages.pop()
            continue
        ans = resp.choices[0].message.content
        messages.append({"role": "assistant", "content": ans})
        print(f"\nbot > {ans}\n")


if __name__ == "__main__":
    main()
