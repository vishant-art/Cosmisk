import asyncio

from conftest import FakeHttp

from connectors.config import Settings, ShopifyCredentials
from connectors.contract import DateWindow
from connectors.shopify import ShopifyConnector
from connectors.shopify.normalize import aggregate_products, orders_to_daily_facts

CREDS = ShopifyCredentials(shop_domain="acme.myshopify.com", admin_token="t")
WINDOW = DateWindow(since="2026-06-01", until="2026-06-30")


def test_orders_to_daily_facts_groups_revenue_by_day():
    orders = [
        {"created_at": "2026-06-01T10:00:00Z", "current_total_price": "100"},
        {"created_at": "2026-06-01T12:00:00Z", "total_price": "50"},
        {"created_at": "2026-06-02T09:00:00Z", "current_total_price": "70"},
    ]
    facts = orders_to_daily_facts(orders, "acme.myshopify.com")
    assert [f.date for f in facts] == ["2026-06-01", "2026-06-02"]
    assert facts[0].revenue == 150 and facts[0].conversions == 2
    assert all(f.platform == "shopify" and f.spend == 0 for f in facts)


def test_orders_to_daily_facts_captures_currency_in_platform_extra():
    orders = [
        {"created_at": "2026-06-01T10:00:00Z", "current_total_price": "100", "currency": "INR"},
        {"created_at": "2026-06-01T12:00:00Z", "total_price": "50", "currency": "INR"},
    ]
    facts = orders_to_daily_facts(orders, "acme.myshopify.com")
    assert facts[0].platform_extra["currency"] == "INR"
    assert facts[0].platform_extra["orders"] == 2
    assert facts[0].revenue == 150 and facts[0].conversions == 2


def test_order_fields_requests_currency():
    from connectors.shopify.normalize import ORDER_FIELDS
    assert "currency" in ORDER_FIELDS


def test_aggregate_products_ranks_by_revenue():
    orders = [
        {"line_items": [{"product_id": 1, "title": "Mug", "price": "10", "quantity": "2"},
                        {"product_id": 2, "title": "Tee", "price": "30", "quantity": "1"}]},
        {"line_items": [{"product_id": 2, "title": "Tee", "price": "30", "quantity": "3"}]},
    ]
    ranked = aggregate_products(orders)
    assert ranked[0][0] == "2" and ranked[0][2] == 120     # Tee: 30*1 + 30*3
    assert ranked[1][0] == "1" and ranked[1][2] == 20


def test_fetch_facts_paginates_via_link_header():
    page1 = {"orders": [{"created_at": "2026-06-01T10:00:00Z", "total_price": "10"}]}
    page2 = {"orders": [{"created_at": "2026-06-02T10:00:00Z", "total_price": "20"}]}
    http = FakeHttp(
        json_map={"orders.json": page1, "page2": page2},
        headers_map={"orders.json": {"link": '<https://acme.myshopify.com/page2>; rel="next"'}},
    )
    conn = ShopifyConnector(CREDS, Settings(), http=http)
    facts = asyncio.run(conn.fetch_facts(None, WINDOW))
    assert [f.date for f in facts] == ["2026-06-01", "2026-06-02"]   # both pages


def test_fetch_assets_downloads_top_product_image():
    orders = {"orders": [{"line_items": [{"product_id": 7, "title": "Hat", "price": "25", "quantity": "4"}]}]}
    product = {"product": {"id": 7, "title": "Hat", "image": {"src": "https://cdn.shopify.com/hat.png"}}}
    http = FakeHttp(json_map={"orders.json": orders, "products/7": product},
                    files={"cdn.shopify.com": b"IMG"})
    conn = ShopifyConnector(CREDS, Settings(), http=http)
    assets = asyncio.run(conn.fetch_assets(None, top_n=3))
    assert len(assets) == 1
    assert assets[0].entity_name == "Hat" and assets[0].local_path
    assert assets[0].stats.revenue == 100      # 25*4
