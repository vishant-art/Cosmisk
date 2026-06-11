"""Generate mock_meta_ads.json, shaped exactly like a Meta Ads Insights pull at
campaign level with daily breakdown (level=campaign, time_increment=1).

Realism that matters for the experiments:
  - numeric fields are STRINGS (the real API returns strings)
  - conversions/revenue live in nested actions / action_values / purchase_roas
  - the `actions` array is intentionally MESSY, mirroring real responses: the same
    logical event (a purchase) shows up under several keys
    (offsite_conversion.fb_pixel_purchase, omni_purchase, onsite_web_purchase,
    purchase, web_in_store_purchase), with slightly DIFFERENT values, plus a long
    tail of view_content / landing_page_view / engagement / messaging events.
    This is what a real pull from a live account looks like (~50 action types).
  - each campaign carries a deliberate narrative the brain should detect
    (fatiguing prospecting, scaling UGC winner, steady star, money-pit catalog).

The canonical purchase/revenue for analysis is the fb_pixel_purchase value; the
omni/onsite variants are deliberately offset so tests can prove the parser's
first-match-wins disambiguation picks the right one (no double counting).

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


def build_actions(purchases, atc, checkout, link_clicks, vc, lpv, page_eng):
    """Mirror a real, messy `actions` array: the same purchase under multiple
    keys (pixel/omni/onsite/bare/in-store), plus the engagement long tail."""
    onsite_purch = max(0, round(purchases * 0.9))  # onsite variant under-reports a bit
    instore = max(0, round(purchases * 0.12))
    return [
        # --- the long tail Meta always returns first ---
        {"action_type": "post_engagement", "value": str(page_eng)},
        {"action_type": "page_engagement", "value": str(page_eng)},
        {"action_type": "link_click", "value": str(link_clicks)},
        {"action_type": "landing_page_view", "value": str(lpv)},
        {"action_type": "view_content", "value": str(vc)},
        {"action_type": "omni_view_content", "value": str(vc)},
        {"action_type": "offsite_conversion.fb_pixel_view_content", "value": str(vc)},
        {"action_type": "onsite_web_view_content", "value": str(vc)},
        {"action_type": "add_to_wishlist", "value": str(max(0, round(atc * 0.3)))},
        # --- add to cart, under several keys ---
        {"action_type": "add_to_cart", "value": str(atc)},
        {"action_type": "omni_add_to_cart", "value": str(atc)},
        {"action_type": "offsite_conversion.fb_pixel_add_to_cart", "value": str(atc)},
        {"action_type": "onsite_web_add_to_cart", "value": str(max(0, round(atc * 0.95)))},
        # --- checkout, under several keys ---
        {"action_type": "initiate_checkout", "value": str(checkout)},
        {"action_type": "omni_initiated_checkout", "value": str(checkout)},
        {"action_type": "offsite_conversion.fb_pixel_initiate_checkout", "value": str(checkout)},
        {"action_type": "add_payment_info", "value": str(max(0, round(purchases * 1.2)))},
        # --- purchase, under several keys with different values (the messy bit) ---
        {"action_type": "offsite_conversion.fb_pixel_purchase", "value": str(purchases)},
        {"action_type": "omni_purchase", "value": str(purchases)},
        {"action_type": "onsite_web_purchase", "value": str(onsite_purch)},
        {"action_type": "purchase", "value": str(purchases)},
        {"action_type": "web_in_store_purchase", "value": str(instore)},
    ]


def build_action_values(revenue):
    """Revenue under multiple keys with deliberate offsets (omni > pixel > onsite),
    exactly the 2-3x-disagreement problem real accounts have."""
    return [
        {"action_type": "offsite_conversion.fb_pixel_purchase", "value": f"{revenue:.2f}"},  # canonical
        {"action_type": "omni_purchase", "value": f"{revenue * 1.06:.2f}"},                  # over-reports
        {"action_type": "onsite_web_purchase", "value": f"{revenue * 0.92:.2f}"},            # under-reports
        {"action_type": "purchase", "value": f"{revenue:.2f}"},
        {"action_type": "offsite_conversion.fb_pixel_view_content", "value": f"{revenue * 6:.2f}"},
        {"action_type": "add_to_cart", "value": f"{revenue * 1.8:.2f}"},
    ]


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
            link_clicks = int(clicks * 0.92)
            revenue = spend * roas
            purchases = max(0, round(revenue / aov))
            checkout = round(purchases * lerp(1.8, 2.2, random.random()))
            atc = round(checkout * lerp(1.7, 2.3, random.random()))
            vc = int(link_clicks * 1.5)
            lpv = int(link_clicks * 0.95)
            page_eng = int(impressions * 0.02)

            rows.append({
                "campaign_id": cid,
                "campaign_name": name,
                "date_start": the_date.isoformat(),
                "date_stop": the_date.isoformat(),
                "spend": f"{spend:.2f}",
                "impressions": str(int(impressions)),
                "reach": str(int(reach)),
                "frequency": f"{freq:.2f}",
                "clicks": str(int(clicks)),                       # ALL clicks
                "ctr": f"{day_ctr:.3f}",                          # ALL-clicks CTR
                "cpc": f"{(spend / clicks if clicks else 0):.2f}",
                "inline_link_clicks": str(link_clicks),           # link clicks (headline)
                "inline_link_click_ctr": f"{(link_clicks / impressions * 100 if impressions else 0):.3f}",
                "cost_per_inline_link_click": f"{(spend / link_clicks if link_clicks else 0):.2f}",
                "cpm": f"{day_cpm:.2f}",
                "actions": build_actions(purchases, atc, checkout, link_clicks, vc, lpv, page_eng),
                "action_values": build_action_values(revenue),
                "purchase_roas": [
                    {"action_type": "offsite_conversion.fb_pixel_purchase", "value": f"{roas:.2f}"},
                    {"action_type": "omni_purchase", "value": f"{roas * 1.06:.2f}"},
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
                "Numeric fields are strings; the actions array is intentionally messy (same "
                "purchase under fb_pixel/omni/onsite/bare keys with offset values) to mirror "
                "real responses and exercise the parser's first-match-wins disambiguation."
            ),
        },
        "data": rows,
    }
    out = Path(__file__).resolve().parents[1] / "data" / "mock_meta_ads.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(envelope, indent=2), encoding="utf-8")
    n_actions = len(rows[0]["actions"]) if rows else 0
    print(f"Wrote {out} -- {len(rows)} rows ({len(CAMPAIGNS)} campaigns x {DAYS} days), "
          f"{n_actions} action_types/row")


if __name__ == "__main__":
    main()
