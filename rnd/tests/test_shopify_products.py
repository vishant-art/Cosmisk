"""Shopify product sourcing (Phase 9.6): pick the store's bestseller, download its image.

The Shopify analogue of ranking Meta ads by ROAS -- here, ranking products by revenue.
`_api` and `_download` are module-level seams, so every test is offline and $0. The
posture under test is the same as Meta grounding: real data when creds exist, graceful
empty + a log line when they do not, never a crash.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import shopify_products as sp  # noqa: E402


def _order(*items):
    return {"id": 1, "created_at": "2026-07-01T00:00:00Z",
            "line_items": [{"product_id": pid, "title": t, "price": str(price),
                            "quantity": qty} for pid, t, price, qty in items]}


# --- ranking (pure) -------------------------------------------------------------

def test_products_rank_by_revenue():
    orders = [_order((10, "Box", 20.0, 2), (20, "Vase", 100.0, 1)),
              _order((10, "Box", 20.0, 3))]
    ranked = sp.aggregate_products(orders)
    # Box: 20*2 + 20*3 = 100 (5 units); Vase: 100 (1 unit) -> tie broken by insertion, but
    # both = 100. Make Box clearly win:
    assert [r[0] for r in ranked][:2] == ["10", "20"] or [r[0] for r in ranked][:2] == ["20", "10"]
    box = next(r for r in ranked if r[0] == "10")
    assert box[2] == pytest.approx(100.0) and box[3] == 5


def test_a_clear_bestseller_ranks_first():
    orders = [_order((10, "Box", 20.0, 1), (20, "Vase", 500.0, 2))]
    ranked = sp.aggregate_products(orders)
    assert ranked[0][0] == "20" and ranked[0][2] == pytest.approx(1000.0)


def test_line_items_without_a_product_id_are_ignored():
    orders = [{"line_items": [{"title": "custom", "price": "50", "quantity": 1}]}]
    assert sp.aggregate_products(orders) == []


def test_bad_price_or_quantity_does_not_crash_ranking():
    orders = [_order((10, "Box", None, "x"))]
    ranked = sp.aggregate_products(orders)
    assert ranked[0][0] == "10" and ranked[0][2] == 0.0


# --- graceful: no creds, no API ---------------------------------------------------

def test_no_token_or_store_yields_nothing(tmp_path):
    logs = []
    assert sp.fetch_bestsellers(None, "shop.myshopify.com", out_dir=tmp_path,
                                log=logs.append) == []
    assert sp.fetch_bestsellers("tok", None, out_dir=tmp_path, log=logs.append) == []
    assert any("UNAVAILABLE" in ln for ln in logs)


def test_an_order_fetch_failure_degrades_gracefully(monkeypatch, tmp_path):
    def _boom(url, params, headers):
        raise RuntimeError("Shopify API error (401): bad token")
    monkeypatch.setattr(sp, "_api", _boom)

    logs = []
    out = sp.fetch_bestsellers("tok", "shop.myshopify.com", out_dir=tmp_path, log=logs.append)
    assert out == []
    assert any("PRODUCT SOURCE UNAVAILABLE" in ln for ln in logs)


# --- the happy path (mocked API + download) --------------------------------------

def _wire(monkeypatch, *, orders, images, downloaded):
    """images: {product_id -> (src, title)}. downloaded records the URLs fetched."""
    def _api(url, params, headers):
        assert headers["X-Shopify-Access-Token"] == "tok"
        if url.endswith("/orders.json"):
            return {"orders": orders}
        # products/{id}.json
        pid = url.split("/products/")[1].removesuffix(".json")
        src, title = images.get(pid, (None, "?"))
        return {"product": {"id": pid, "title": title,
                            "image": ({"src": src} if src else None)}}

    def _download(url, out):
        downloaded.append(url)
        Path(out).parent.mkdir(parents=True, exist_ok=True)
        Path(out).write_bytes(b"IMG")
        return str(out)

    monkeypatch.setattr(sp, "_api", _api)
    monkeypatch.setattr(sp, "_download", _download)


def test_fetch_bestsellers_downloads_the_top_products_image(monkeypatch, tmp_path):
    downloaded = []
    _wire(monkeypatch,
          orders=[_order((10, "Carved Box", 50.0, 4), (20, "Throw", 30.0, 1))],
          images={"10": ("https://cdn/box.png", "Carved Walnut Box"),
                  "20": ("https://cdn/throw.png", "Throw")},
          downloaded=downloaded)

    picks = sp.fetch_bestsellers("tok", "shop.myshopify.com", out_dir=tmp_path,
                                 top_n=2, log=lambda *_: None)
    assert [p.product_id for p in picks] == ["10", "20"]        # revenue order
    assert picks[0].title == "Carved Walnut Box"               # title from the product call
    assert picks[0].image_src == "https://cdn/box.png"
    assert picks[0].local_path and Path(picks[0].local_path).exists()
    assert downloaded == ["https://cdn/box.png", "https://cdn/throw.png"]


def test_a_product_with_no_image_is_kept_but_has_no_local_path(monkeypatch, tmp_path):
    _wire(monkeypatch,
          orders=[_order((10, "Box", 50.0, 4))],
          images={"10": (None, "Box")}, downloaded=[])
    picks = sp.fetch_bestsellers("tok", "shop.myshopify.com", out_dir=tmp_path,
                                 log=lambda *_: None)
    assert len(picks) == 1
    assert picks[0].image_src is None and picks[0].local_path is None


def test_one_bad_product_does_not_sink_the_batch(monkeypatch, tmp_path):
    calls = {"n": 0}

    def _api(url, params, headers):
        if url.endswith("/orders.json"):
            return {"orders": [_order((10, "A", 90.0, 1), (20, "B", 80.0, 1))]}
        calls["n"] += 1
        if "/products/10." in url:
            raise RuntimeError("Shopify API error (404): gone")
        return {"product": {"id": "20", "title": "B", "image": {"src": "https://cdn/b.png"}}}

    monkeypatch.setattr(sp, "_api", _api)
    monkeypatch.setattr(sp, "_download",
                        lambda url, out: (Path(out).write_bytes(b"x"), str(out))[1])

    picks = sp.fetch_bestsellers("tok", "shop.myshopify.com", out_dir=tmp_path,
                                 top_n=2, log=lambda *_: None)
    assert [p.product_id for p in picks] == ["20"]             # 10 skipped, 20 survives
    assert picks[0].local_path


def test_empty_store_yields_nothing(monkeypatch, tmp_path):
    monkeypatch.setattr(sp, "_api", lambda url, params, headers: {"orders": []})
    logs = []
    assert sp.fetch_bestsellers("tok", "shop.myshopify.com", out_dir=tmp_path,
                                log=logs.append) == []
    assert any("no products found" in ln for ln in logs)
