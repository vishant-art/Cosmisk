"""Generate mock_meta_ads.json, shaped exactly like a Meta Ads Insights pull at
campaign level with daily breakdown (level=campaign, time_increment=1).

Realism that matters for the experiments:
  - numeric fields are STRINGS (the real API returns strings)
  - conversions/revenue live in nested actions / action_values / purchase_roas
  - each campaign carries a deliberate narrative the brain should detect
    (a fatiguing prospecting campaign, a scaling UGC winner, a steady star,
     and a high-spend low-ROAS "money pit").

Deterministic (seeded) so the file is reproducible. Run:  python make_mock.py
"""
from __future__ import annotations

import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

ACCOUNT = {
    "account_id": "act_1738503939658460",
    "account_name": "Pratapsons (mock)",
    "currency": "INR",
}
START = date(2026, 5, 1)
DAYS = 30

# name, base_spend, roas_start, roas_end, ctr%, cpm, aov, freq_start, freq_end
CAMPAIGNS = [
    ("Prospecting -- Summer Sale", 22000, 4.2, 2.0, 1.1, 95, 2000, 1.6, 4.4),   # fatigue
    ("UGC -- Reels Push",           9000, 3.0, 5.2, 1.9, 70, 1800, 1.2, 1.9),   # scaling winner
    ("Retargeting -- Evergreen",    4000, 6.5, 7.0, 2.4, 110, 2200, 2.1, 2.6),  # steady star
    ("Catalog -- DPA Broad",       18000, 1.9, 1.7, 0.8, 60, 1500, 3.0, 3.4),   # money pit
]


def lerp(a, b, t):
    return a + (b - a) * t


def noise(p=0.12):
    return 1 + random.uniform(-p, p)


def build_rows():
    rows = []
    for ci, (name, base_spend, roas0, roas1, ctr, cpm, aov, f0, f1) in enumerate(CAMPAIGNS):
        cid = f"23859{ci:04d}001"
        spend_trend = 1.6 if "UGC" in name else (0.85 if "Summer" in name else 1.0)
        for d in range(DAYS):
            t = d / (DAYS - 1)
            the_date = START + timedelta(days=d)

            spend = base_spend * lerp(1.0, spend_trend, t) * noise()
            roas = lerp(roas0, roas1, t) * noise(0.08)
            freq = lerp(f0, f1, t) * noise(0.05)
            day_cpm = cpm * noise()
            impressions = spend / day_cpm * 1000
            reach = impressions / freq
            day_ctr = ctr * noise(0.1)
            clicks = impressions * day_ctr / 100
            link_clicks = clicks * 0.92
            revenue = spend * roas
            purchases = max(0, round(revenue / aov))
            checkout = round(purchases * lerp(1.8, 2.2, random.random()))
            atc = round(checkout * lerp(1.7, 2.3, random.random()))

            rows.append({
                "campaign_id": cid,
                "campaign_name": name,
                "date_start": the_date.isoformat(),
                "date_stop": the_date.isoformat(),
                "spend": f"{spend:.2f}",
                "impressions": str(int(impressions)),
                "reach": str(int(reach)),
                "frequency": f"{freq:.2f}",
                "clicks": str(int(clicks)),
                "ctr": f"{day_ctr:.3f}",
                "cpc": f"{(spend / clicks if clicks else 0):.2f}",
                "cpm": f"{day_cpm:.2f}",
                "actions": [
                    {"action_type": "link_click", "value": str(int(link_clicks))},
                    {"action_type": "add_to_cart", "value": str(atc)},
                    {"action_type": "initiate_checkout", "value": str(checkout)},
                    {"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purchases)},
                ],
                "action_values": [
                    {"action_type": "offsite_conversion.fb_pixel_purchase", "value": f"{revenue:.2f}"},
                ],
                "purchase_roas": [
                    {"action_type": "offsite_conversion.fb_pixel_purchase", "value": f"{roas:.2f}"},
                ],
            })
    return rows


def main():
    rows = build_rows()
    envelope = {
        "meta": {
            **ACCOUNT,
            "level": "campaign",
            "time_increment": 1,
            "date_range": {
                "since": START.isoformat(),
                "until": (START + timedelta(days=DAYS - 1)).isoformat(),
            },
            "api_version": "v23.0",
            "note": (
                "MOCK data shaped like GET /act_<id>/insights?level=campaign&time_increment=1. "
                "Numeric fields are strings; conversions/revenue are nested in "
                "actions/action_values/purchase_roas."
            ),
        },
        "data": rows,
    }
    out = Path(__file__).with_name("mock_meta_ads.json")
    out.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    print(f"Wrote {out} -- {len(rows)} rows ({len(CAMPAIGNS)} campaigns x {DAYS} days)")


if __name__ == "__main__":
    main()
