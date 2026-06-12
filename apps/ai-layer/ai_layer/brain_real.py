"""Combo: fetch live Meta Ads data, then run the deterministic brain on it.

Pulls a fresh paginated Insights export for one ad account (same fields +
attribution as meta_live), normalizes it through the L1 transform, CLEARS the
plots dir so stale charts don't linger, then prints the brain's statements and
renders fresh charts. Optionally --save the raw envelope for reuse.

    python brain_real.py                                  # first account, last_30d, + plots
    python brain_real.py --account act_1738503939658460 --preset last_30d
    python brain_real.py --no-plots
    python brain_real.py --save ../data/_real_sample.json
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from ai_layer import brain as br        # statements + make_plots
from ai_layer import config
from ai_layer import meta_live as ml    # live fetch helpers
from ai_layer import meta_transform as mt

# Windows consoles default to cp1252 and choke on ₹/€; force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def clear_dir(outdir: Path) -> int:
    """Delete existing files in the plots dir so we don't mix old + new charts."""
    outdir.mkdir(parents=True, exist_ok=True)
    removed = 0
    for p in outdir.iterdir():
        if p.is_file():
            p.unlink()
            removed += 1
    return removed


def main():
    app_root = Path(__file__).resolve().parents[1]
    token = config.META_ACCESS_TOKEN
    if not token:
        print("META_ACCESS_TOKEN not set (.env or environment)")
        sys.exit(1)

    ap = argparse.ArgumentParser(description="Fetch live Meta Ads data and run the brain on it")
    ap.add_argument("--account", help="act_<id>; defaults to first account on the token")
    ap.add_argument("--preset", default="last_30d", help="Meta date_preset (e.g. last_30d)")
    ap.add_argument("--level", default="campaign", choices=["account", "campaign", "adset", "ad"])
    ap.add_argument("--max-rows", type=int, default=5000)
    ap.add_argument("--no-plots", action="store_true", help="skip chart rendering")
    ap.add_argument("--outdir", default=str(app_root / "plots"))
    ap.add_argument("--save", metavar="PATH", help="also save the raw {meta,data} envelope JSON")
    args = ap.parse_args()

    # 1+2. discover account + fetch paginated insights (shared with chat.py)
    print(f"Graph API {ml.GRAPH_API_VERSION} -- fetching live ({args.preset})...")
    try:
        envelope = ml.fetch_envelope(account=args.account, token=token, preset=args.preset,
                                     level=args.level, max_rows=args.max_rows)
    except Exception as e:  # noqa: BLE001
        print(f"  [meta fetch error] {e}")
        return
    m = envelope["meta"]
    print(f"Account: {m['account_id']} ({m['account_name']}, {m['currency']}), "
          f"{len(envelope['data'])} rows across {m.get('pages', '?')} page(s).")
    if not envelope["data"]:
        print("No rows (no spend in this window?). Try --preset last_90d.")
        return

    # 3. save (raw) + normalize -> typed Dataset
    if args.save:
        Path(args.save).write_text(json.dumps(envelope, indent=2), encoding="utf-8")
        print(f"Saved envelope -> {args.save}")

    ds = mt.normalize(envelope)
    df = ds.to_dataframe()
    currency = ds.currency

    # 4. brain statements
    print(f"\n=== BRAIN: {ds.account_name} [{ds.since or '?'} -> {ds.until or '?'}] ===\n")
    for tag, line in br.statements(df, currency):
        print(f"- [{tag}] {line}\n")

    # 5. clear plots dir, then render fresh charts
    if not args.no_plots:
        outdir = Path(args.outdir)
        removed = clear_dir(outdir)
        print(f"Cleared {removed} old file(s) from {outdir}.")
        saved = br.make_plots(df, str(outdir), currency)
        print(f"Saved {len(saved)} charts to {outdir}:")
        for p in saved:
            print(f"   {p.name}")


if __name__ == "__main__":
    main()
