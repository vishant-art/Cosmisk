"""Multi-turn latency benchmark for chat.py (File 3).

Replays scripted multi-turn conversations against the same model + snapshot that
chat.py uses, recording per-reply latency and token usage, so we can see WHERE the
time goes (input size vs reasoning vs generation) and A/B candidate fixes.

This is a manual harness (not a pytest test -> name is bench_*, not test_*), since
it makes real, paid OpenRouter calls.

    python bench_chat.py                                         # mock data, current model
    python bench_chat.py --data ../data/_real_sample.json        # real 84-campaign snapshot
    python bench_chat.py --data ../data/_real_sample.json --reasoning-effort minimal
    python bench_chat.py --data ../data/_real_sample.json --max-campaigns 25
    python bench_chat.py --stream                                # also measure time-to-first-token
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import chat as ch          # noqa: E402  (reuse SYSTEM, MODEL, build_context)
import meta_transform as mt  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# A realistic mix: lookups (cheap, deterministic-able) + reasoning (needs the model).
SCENARIOS = {
    "discovery": [
        "What's my blended ROAS and total spend?",                 # pure lookup
        "Which campaign has the best ROAS?",                       # lookup + sort
        "And the worst, among campaigns with real spend?",        # filter + sort
        "Should I cut the worst one? One line.",                  # reasoning
        "Summarize the account's health in two sentences.",       # synthesis
    ],
}


def build_context(ds: mt.Dataset, max_campaigns: int | None) -> str:
    """chat.build_context, optionally trimmed to the top-N campaigns by spend."""
    if not max_campaigns:
        return ch.build_context(ds)
    df = ds.to_dataframe()
    cs = mt.campaign_summary(df)
    keep = set(cs.head(max_campaigns).campaign_name)
    trimmed = mt.normalize({
        "meta": {"account_name": ds.account_name, "currency": ds.currency,
                 "date_range": {"since": ds.since, "until": ds.until}},
        "data": [],
    })
    # rebuild a Dataset whose facts are only the kept campaigns
    facts = tuple(f for f in ds.facts if f.campaign_name in keep)
    trimmed = mt.Dataset(ds.account_id, ds.account_name, ds.currency, ds.since,
                         ds.until, ds.level, ds.source, facts)
    note = f"\n(NOTE: showing top {max_campaigns} of {cs.shape[0]} campaigns by spend.)"
    return ch.build_context(trimmed) + note


def run_scenario(client, model, context, questions, reasoning_effort, stream):
    messages = [{"role": "system", "content": ch.SYSTEM.format(context=context)}]
    rows = []
    extra = {"reasoning": {"effort": reasoning_effort}} if reasoning_effort else {}
    for i, q in enumerate(questions, 1):
        messages.append({"role": "user", "content": q})
        t0 = time.perf_counter()
        ttft = None
        if stream:
            chunks = []
            s = client.chat.completions.create(
                model=model, temperature=0.2, messages=messages, stream=True,
                stream_options={"include_usage": True}, extra_body=extra)
            usage = None
            for ch_ in s:
                if ch_.choices and ch_.choices[0].delta.content:
                    if ttft is None:
                        ttft = time.perf_counter() - t0
                    chunks.append(ch_.choices[0].delta.content)
                if getattr(ch_, "usage", None):
                    usage = ch_.usage
            ans = "".join(chunks)
        else:
            resp = client.chat.completions.create(
                model=model, temperature=0.2, messages=messages, extra_body=extra)
            if not getattr(resp, "choices", None):
                ans = f"[no choices: {getattr(resp, 'error', resp)}]"
                usage = getattr(resp, "usage", None)
            else:
                ans = resp.choices[0].message.content or ""
                usage = resp.usage
        dt = time.perf_counter() - t0
        messages.append({"role": "assistant", "content": ans})
        pt = getattr(usage, "prompt_tokens", 0) or 0
        ct = getattr(usage, "completion_tokens", 0) or 0
        rt = 0
        details = getattr(usage, "completion_tokens_details", None)
        if details is not None:
            rt = getattr(details, "reasoning_tokens", 0) or 0
        rows.append((i, dt, ttft, pt, ct, rt, len(ans)))
    return rows


def main():
    ap = argparse.ArgumentParser(description="Multi-turn latency benchmark for chat.py")
    rnd_root = Path(__file__).resolve().parents[1]
    ap.add_argument("--data", default=str(rnd_root / "data" / "mock_meta_ads.json"))
    ap.add_argument("--model", default=ch.MODEL)
    ap.add_argument("--reasoning-effort", default=None,
                    help="minimal|low|medium|high (gpt-5 family)")
    ap.add_argument("--max-campaigns", type=int, default=None,
                    help="trim snapshot to top-N campaigns by spend")
    ap.add_argument("--stream", action="store_true", help="measure time-to-first-token")
    ap.add_argument("--scenario", default="discovery", choices=list(SCENARIOS))
    args = ap.parse_args()

    load_dotenv(rnd_root.parent / ".env")
    key = os.getenv("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY not set in repo-root .env")
        sys.exit(1)
    client = OpenAI(api_key=key, base_url=os.getenv("OPENROUTER_BASE_URL",
                    "https://openrouter.ai/api/v1"))

    ds = mt.load(args.data)
    context = build_context(ds, args.max_campaigns)
    ctx_chars = len(context)

    cfg = (f"model={args.model} data={Path(args.data).name} "
           f"reasoning={args.reasoning_effort or 'default'} "
           f"max_campaigns={args.max_campaigns or 'all'} stream={args.stream}")
    print(f"\n=== bench: {cfg} ===")
    print(f"snapshot: {ctx_chars} chars, {ds.to_dataframe().campaign_name.nunique()} campaigns\n")

    rows = run_scenario(client, args.model, context, SCENARIOS[args.scenario],
                        args.reasoning_effort, args.stream)

    print(f"{'turn':>4} {'latency_s':>10} {'ttft_s':>8} {'prompt_tok':>11} "
          f"{'compl_tok':>10} {'reason_tok':>11} {'ans_chars':>10}")
    for i, dt, ttft, pt, ct, rt, ac in rows:
        print(f"{i:>4} {dt:>10.2f} {('' if ttft is None else f'{ttft:.2f}'):>8} "
              f"{pt:>11} {ct:>10} {rt:>11} {ac:>10}")

    lat = [r[1] for r in rows]
    pts = [r[3] for r in rows]
    cts = [r[4] for r in rows]
    rts = [r[5] for r in rows]
    print(f"\nSUMMARY  turns={len(rows)}  avg_latency={sum(lat)/len(lat):.2f}s  "
          f"min={min(lat):.2f}  max={max(lat):.2f}  "
          f"avg_prompt_tok={sum(pts)//len(pts)}  avg_compl_tok={sum(cts)//len(cts)}  "
          f"avg_reason_tok={sum(rts)//len(rts)}")


if __name__ == "__main__":
    main()
