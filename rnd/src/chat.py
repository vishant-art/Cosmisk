"""File 3 -- RAG chatbot over Meta Ads data (context-injection style).

A single account's metrics are compact, so instead of embedding + retrieving we
inject a compressed, factual snapshot of the whole dataset into the model's
system context every turn. The model answers ONLY from that snapshot, which
removes retrieval-miss risk and keeps it from inventing numbers. Uses OpenRouter
(OpenAI-compatible API). Data comes through the L1 transform contract
(meta_transform.Dataset), never raw Meta JSON.

By default it pulls LIVE Meta Ads data on session start; --data loads a JSON file
instead (offline / repeatable).

    python chat.py                                  # live, first account, last_30d
    python chat.py --account act_123 --preset last_14d
    python chat.py --data ../data/_real_sample.json # offline from a saved pull
"""
from __future__ import annotations

import argparse
import itertools
import os
import sys
import threading
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_live as ml       # noqa: E402  (live fetch -> Dataset)
import meta_transform as mt  # noqa: E402

# Windows consoles default to cp1252 and choke on ₹/€; force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# ---- model config (change here, not in env) ----
# Chosen via A/B on FULL 84-campaign data (see chat-latency-and-fixes.md):
#   google/gemini-2.5-flash       <- current: best full-data extraction (~6s, values exact)
#   google/gemini-2.5-flash-lite  cheapest+fastest (~3s) but UNRELIABLE on big dumps (wrong rows)
#   openai/gpt-5-nano             cheap but slow (~18-25s) and inconsistent on full data
# (For the small SUMMARY-only path, gpt-5-nano w/ reasoning=minimal is fine + cheapest.)
MODEL = "google/gemini-2.5-flash"
TEMPERATURE = 0.2
# REASONING_EFFORT only applies to reasoning models (gpt-5 family): minimal cuts their
# latency hugely. Gemini flash handles full-data extraction well WITHOUT forced effort,
# so leave None here. Set "minimal" if you switch MODEL back to gpt-5-nano.
REASONING_EFFORT = None   # minimal | low | medium | high | None (gpt-5 only)
# Trim the per-campaign SUMMARY list to the top-N campaigns by spend (None = all).
MAX_CAMPAIGNS = None
# FULL_DATA appends EVERY (campaign x date) row with all fields, so nothing is lost
# (the model can drill into per-campaign daily detail). The summary is still sent
# too, so pre-computed aggregates stay exact. Tradeoff: large input every turn
# (~55k tokens for an 84-campaign month) -> higher cost + a bit more latency.
FULL_DATA = True
STREAM = True                  # stream tokens so replies feel instant (better TTFT)

SYSTEM = (
    "You are a Meta Ads analyst. Answer the user's questions using ONLY the data "
    "snapshot below. Do NOT invent numbers; if an answer is not derivable from the "
    "snapshot, say so plainly. Be concise and specific, cite the actual figures with "
    "their currency, and when useful compute simple derived values (ratios, % change) "
    "directly from the snapshot.\n\n"
    "=== DATA SNAPSHOT ===\n{context}\n=== END SNAPSHOT ==="
)


class Spinner:
    """Tiny terminal spinner for slow ops (the live fetch). No-op when stdout is
    not a TTY (piped/tests), so output stays clean."""
    FRAMES = "|/-\\"

    def __init__(self, message: str):
        self.message = message
        self._stop = threading.Event()
        self._tty = sys.stdout.isatty()
        self._thread = threading.Thread(target=self._spin, daemon=True)

    def _spin(self):
        for ch in itertools.cycle(self.FRAMES):
            if self._stop.is_set():
                break
            print(f"\r{self.message} {ch}", end="", flush=True)
            time.sleep(0.1)

    def __enter__(self):
        if self._tty:
            self._thread.start()
        else:
            print(self.message + " ...", flush=True)
        return self

    def __exit__(self, *exc):
        self._stop.set()
        if self._tty:
            self._thread.join()
            print("\r" + " " * (len(self.message) + 4) + "\r", end="", flush=True)
        return False


def build_context(ds: mt.Dataset, max_campaigns: int | None = MAX_CAMPAIGNS,
                  full: bool = FULL_DATA) -> str:
    """Compress the dataset into a factual text block the model reasons over.

    Always emits pre-computed account + per-campaign + daily aggregates (so totals
    are exact, not LLM-summed). When `full`, ALSO appends every (campaign x date)
    row with all fields -> nothing is lost; the model can drill into any detail."""
    df = ds.to_dataframe()
    currency = ds.currency
    daily = mt.daily_totals(df)
    cs = mt.campaign_summary(df)

    lines = [
        f"ACCOUNT: {ds.account_name}   CURRENCY: {currency}   "
        f"WINDOW: {ds.since or '?'} to {ds.until or '?'}",
        f"TOTALS (all {cs.shape[0]} campaigns): spend={df.spend.sum():.0f}  "
        f"revenue={df.revenue.sum():.0f}  "
        f"blended_roas={(df.revenue.sum() / df.spend.sum() if df.spend.sum() else 0):.2f}  "
        f"purchases={int(df.purchases.sum())}",
        "",
    ]
    shown = cs if not max_campaigns else cs.head(max_campaigns)
    header = "PER-CAMPAIGN TOTALS (spend | revenue | roas | purchases | cpa | avg_freq | link_ctr%)"
    if max_campaigns and cs.shape[0] > max_campaigns:
        header += f" -- top {max_campaigns} of {cs.shape[0]} by spend"
    lines.append(header + ":")
    for _, r in shown.iterrows():
        lines.append(
            f"  - {r.campaign_name}: spend={r.spend:.0f} | revenue={r.revenue:.0f} | "
            f"roas={r.roas:.2f} | purchases={int(r.purchases)} | cpa={r.cpa:.0f} | "
            f"avg_freq={r.avg_frequency:.2f} | link_ctr={r.link_ctr:.2f}"
        )
    lines += ["", "DAILY ACCOUNT TOTALS (date | spend | revenue | roas):"]
    for _, r in daily.iterrows():
        lines.append(f"  {r.date.date()} | {r.spend:.0f} | {r.revenue:.0f} | {r.roas:.2f}")

    if full:
        lines += [
            "",
            f"FULL PER-CAMPAIGN DAILY ROWS ({len(df)} rows) -- the complete dataset "
            "(campaign | date | spend | impressions | reach | frequency | clicks | "
            "link_clicks | link_ctr | cpc | cost_per_link_click | cpm | add_to_cart | "
            "checkout | purchases | revenue | roas | cpa):",
        ]
        for _, r in df.iterrows():
            lines.append(
                f"  {r.campaign_name} | {r.date.date()} | {r.spend:.0f} | {int(r.impressions)} | "
                f"{int(r.reach)} | {r.frequency:.2f} | {int(r.clicks)} | {int(r.link_clicks)} | "
                f"{r.link_ctr:.2f} | {r.cpc:.2f} | {r.cost_per_link_click:.2f} | {r.cpm:.2f} | "
                f"{int(r.add_to_cart)} | {int(r.checkout)} | {int(r.purchases)} | {r.revenue:.0f} | "
                f"{r.roas:.2f} | {r.cpa:.0f}"
            )
    return "\n".join(lines)


def complete(client: OpenAI, messages, stream: bool = False) -> str:
    """One model call with the shared config (model, temperature, reasoning effort).
    Single source of truth so the REPL and tests exercise identical settings.
    When stream=True, prints tokens as they arrive and returns the full text."""
    extra = {"reasoning": {"effort": REASONING_EFFORT}} if REASONING_EFFORT else {}
    if not stream:
        resp = client.chat.completions.create(
            model=MODEL, temperature=TEMPERATURE, messages=messages, extra_body=extra)
        return resp.choices[0].message.content
    out = []
    s = client.chat.completions.create(
        model=MODEL, temperature=TEMPERATURE, messages=messages, stream=True, extra_body=extra)
    for chunk in s:
        delta = chunk.choices[0].delta.content if chunk.choices else None
        if delta:
            print(delta, end="", flush=True)
            out.append(delta)
    print()
    return "".join(out)


def main():
    rnd_root = Path(__file__).resolve().parents[1]
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", help="load from a JSON file instead of pulling live")
    ap.add_argument("--account", help="act_<id>; defaults to first on the token")
    ap.add_argument("--preset", default="last_30d", help="Meta date_preset (e.g. last_30d)")
    ap.add_argument("--level", default="campaign", choices=["account", "campaign", "adset", "ad"])
    ap.add_argument("--full", action=argparse.BooleanOptionalAction, default=FULL_DATA,
                    help="inject the complete per-(campaign x date) rows (default: on)")
    args = ap.parse_args()

    load_dotenv(rnd_root.parent / ".env")
    key = os.getenv("OPENROUTER_API_KEY")
    base = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    if not key:
        print("OPENROUTER_API_KEY not set in repo-root .env")
        sys.exit(1)

    # Pull live by default; --data is the offline override.
    if args.data:
        ds = mt.load(args.data)
    else:
        token = os.getenv("META_ACCESS_TOKEN")
        if not token:
            print("META_ACCESS_TOKEN not set in repo-root .env (or pass --data <file>)")
            sys.exit(1)
        try:
            with Spinner(f"Fetching live Meta Ads data ({args.preset})"):
                ds = ml.fetch_dataset(token, account=args.account,
                                      preset=args.preset, level=args.level)
        except Exception as e:  # noqa: BLE001
            print(f"[meta fetch error] {e}")
            sys.exit(1)

    if len(ds) == 0:
        print("No data rows for this account/window.")
        sys.exit(1)
    print(f"Loaded {len(ds)} rows | {ds.account_name} ({ds.currency}) "
          f"[{ds.since or '?'} -> {ds.until or '?'}]")
    context = build_context(ds, full=args.full)
    mode = f"FULL data ({len(ds)} rows)" if args.full else "summary only"
    print(f"Context: {mode} -- {len(context):,} chars sent each turn "
          f"(dense numeric tables tokenize ~0.8 tok/char, so ~{int(len(context) * 0.8):,} tokens).")

    client = OpenAI(api_key=key, base_url=base)
    messages = [{"role": "system", "content": SYSTEM.format(context=context)}]

    print(f"RAG chat over '{ds.account_name}' via {MODEL}.")
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
        print("\nbot > ", end="", flush=True)
        try:
            ans = complete(client, messages, stream=STREAM)
        except Exception as e:  # noqa: BLE001 -- surface any API error, keep the REPL alive
            print(f"\n  [api error] {e}\n")
            messages.pop()
            continue
        messages.append({"role": "assistant", "content": ans})
        print()


if __name__ == "__main__":
    main()
