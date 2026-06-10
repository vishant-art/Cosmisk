"""File 2 -- live Meta Ads probe.

Uses META_ACCESS_TOKEN from the repo-root .env to call the real Graph API and
show, in the CLI, exactly what we receive: which ad accounts the token can see,
plus a real Insights pull (raw JSON of one row + the field/action_type inventory
+ a flattened table). This answers "what content are we actually getting from
Meta, and in what shape?".

    python meta_live.py                                   # first account, last_7d, campaign level
    python meta_live.py --account act_123 --preset last_30d --level ad
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import pandas as pd
import requests
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
import meta_common as mc  # noqa: E402

# Windows consoles default to cp1252 and choke on non-ASCII; force UTF-8 output.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# Bump if Meta deprecates the version. v23.0 is current/non-deprecated as of 2026.
GRAPH_API_VERSION = "v23.0"
BASE = f"https://graph.facebook.com/{GRAPH_API_VERSION}"

# Representative field set -- what we'd actually request in production.
FIELDS = [
    "campaign_id", "campaign_name", "adset_name", "ad_name",
    "spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc", "cpm",
    "actions", "action_values", "purchase_roas", "date_start", "date_stop",
]


def get(path, params):
    r = requests.get(f"{BASE}/{path}", params=params, timeout=60)
    try:
        body = r.json()
    except ValueError:
        print(f"\n[x] Non-JSON response ({r.status_code}): {r.text[:300]}")
        sys.exit(1)
    if isinstance(body, dict) and "error" in body:
        e = body["error"]
        print(f"\n[x] Meta API error ({r.status_code}): {e.get('message')}")
        print(f"    type={e.get('type')} code={e.get('code')} "
              f"subcode={e.get('error_subcode')} fbtrace_id={e.get('fbtrace_id')}")
        sys.exit(1)
    return body


def main():
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
    token = os.getenv("META_ACCESS_TOKEN")
    if not token:
        print("META_ACCESS_TOKEN not set in ../.env")
        sys.exit(1)

    ap = argparse.ArgumentParser()
    ap.add_argument("--account", help="act_<id>; defaults to first account on the token")
    ap.add_argument("--preset", default="last_7d", help="Meta date_preset (e.g. last_7d, last_30d)")
    ap.add_argument("--level", default="campaign", choices=["account", "campaign", "adset", "ad"])
    ap.add_argument("--rows", type=int, default=10, help="max insight rows to fetch")
    args = ap.parse_args()

    print(f"Graph API {GRAPH_API_VERSION}\n")

    me = get("me", {"access_token": token, "fields": "id,name"})
    print(f"Token belongs to: {me.get('name')} (id {me.get('id')})")

    accts = get("me/adaccounts", {
        "access_token": token,
        "fields": "account_id,name,currency,account_status,amount_spent",
        "limit": 50,
    }).get("data", [])
    print(f"\nAd accounts visible to this token: {len(accts)}")
    for a in accts:
        print(f"   act_{a['account_id']}  {a.get('name', '?'):28.28}  "
              f"{a.get('currency', '?'):4}  status={a.get('account_status')}")
    if not accts:
        print("No ad accounts on this token.")
        return

    account = args.account or f"act_{accts[0]['account_id']}"
    print(f"\nPulling insights for {account} (level={args.level}, {args.preset}, daily)...")
    insights = get(f"{account}/insights", {
        "access_token": token,
        "level": args.level,
        "fields": ",".join(FIELDS),
        "date_preset": args.preset,
        "time_increment": 1,
        "limit": args.rows,
    })
    rows = insights.get("data", [])
    print(f"Received {len(rows)} insight rows.")
    if not rows:
        print("No rows (account may have no spend in this window). Try --preset last_90d.")
        return

    print("\n--- RAW JSON of first row (the real shape we receive) ---")
    print(json.dumps(rows[0], indent=2))

    fields_present = sorted({k for r in rows for k in r.keys()})
    action_types = sorted({a.get("action_type") for r in rows for a in r.get("actions", [])})
    value_types = sorted({a.get("action_type") for r in rows for a in r.get("action_values", [])})
    print("\n--- Fields present across rows ---")
    print(", ".join(fields_present))
    print("\n--- action_types seen in `actions` ---")
    print(", ".join(t for t in action_types if t) or "(none)")
    print("\n--- action_types seen in `action_values` ---")
    print(", ".join(t for t in value_types if t) or "(none)")

    print("\n--- Flattened (what the brain / chat will consume) ---")
    df = mc.to_dataframe(rows)
    cols = [c for c in ["campaign_name", "date", "spend", "impressions", "clicks",
                        "ctr", "purchases", "revenue", "roas"] if c in df.columns]
    with pd.option_context("display.max_columns", None, "display.width", 200):
        print(df[cols].to_string(index=False))


if __name__ == "__main__":
    main()
