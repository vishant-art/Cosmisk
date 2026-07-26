"""Shopify orders → per-day UnifiedFact (the revenue TRUTH side of blended ROAS) and
per-product revenue aggregation (for winning-product assets). PII-minimized: we only read
order totals + line items, never customer records.
"""
from __future__ import annotations

from ..contract import UnifiedFact

# Minimal order fields — no customer PII.
ORDER_FIELDS = "id,created_at,total_price,current_total_price,financial_status,currency"
ORDER_LINE_FIELDS = "id,created_at,line_items"


def _f(v, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def orders_to_daily_facts(orders, domain: str) -> list[UnifiedFact]:
    by_day: dict[str, list] = {}     # date -> [revenue, count]
    currency = None                  # shop currency — first order that carries it
    for o in orders:
        d = (o.get("created_at") or "")[:10]
        if not d:
            continue
        if currency is None:
            currency = o.get("currency")
        rev = _f(o.get("current_total_price") or o.get("total_price"))
        agg = by_day.setdefault(d, [0.0, 0])
        agg[0] += rev
        agg[1] += 1
    return [
        UnifiedFact(platform="shopify", account_id=domain, entity_id="orders",
                    entity_name="Shopify orders", date=d, revenue=rev, conversions=cnt,
                    platform_extra={"orders": cnt, "currency": currency})
        for d, (rev, cnt) in sorted(by_day.items())
    ]


def aggregate_products(orders):
    """[(product_id, title, revenue, units)] sorted by revenue desc."""
    by_pid: dict[str, list] = {}
    for o in orders:
        for li in o.get("line_items") or []:
            pid = str(li.get("product_id") or "")
            if not pid:
                continue
            rev = _f(li.get("price")) * _f(li.get("quantity"))
            agg = by_pid.setdefault(pid, [li.get("title", "?"), 0.0, 0.0])
            agg[1] += rev
            agg[2] += _f(li.get("quantity"))
    ranked = sorted(by_pid.items(), key=lambda kv: kv[1][1], reverse=True)
    return [(pid, t, rev, units) for pid, (t, rev, units) in ranked]
