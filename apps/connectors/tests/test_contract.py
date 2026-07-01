from connectors.contract import (
    AssetRecord,
    Blended,
    BrandRef,
    ConnectorStatus,
    DateWindow,
    UnifiedFact,
    UnifiedSnapshot,
)


def test_date_window_last_n_days_inclusive():
    w = DateWindow.last_n_days(30, today="2026-06-30")
    assert w.until == "2026-06-30"
    assert w.since == "2026-06-01"      # 30 inclusive days


def test_brandref_optional_ids_default_none():
    b = BrandRef(brand_id="acme")
    assert b.meta_account_id is None and b.shopify_domain is None


def test_snapshot_helpers_and_partial_status():
    snap = UnifiedSnapshot(
        brand_id="acme", since="2026-06-01", until="2026-06-30",
        facts=[UnifiedFact(platform="meta", account_id="a1", entity_id="c1",
                           date="2026-06-01", spend=10, revenue=40)],
        blended=Blended(spend=10, revenue_shopify=50, blended_roas=5.0),
        assets=[AssetRecord(platform="meta", entity_id="c1", roas=4.0)],
        statuses=[
            ConnectorStatus(platform="meta", state="ok", fact_count=1),
            ConnectorStatus(platform="shopify", state="ok"),
            ConnectorStatus(platform="google", state="skipped", detail="no creds"),
        ],
    )
    assert set(snap.ok_platforms) == {"meta", "shopify"}      # skipped excluded
    assert snap.status_for("google").state == "skipped"
    assert snap.blended.blended_roas == 5.0


def test_models_roundtrip_json():
    snap = UnifiedSnapshot(brand_id="acme", since="2026-06-01", until="2026-06-02")
    assert UnifiedSnapshot.model_validate_json(snap.model_dump_json()).brand_id == "acme"


def test_unified_fact_is_flat_superset_all_float_non_null():
    f = UnifiedFact(platform="meta", account_id="a1", entity_id="c1", date="2026-06-01")
    # every metric field exists, defaults to 0.0, and is a float (never None/int)
    for name in ("spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc",
                 "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
                 "add_to_cart", "checkout", "conversions", "revenue", "roas", "cpa"):
        val = getattr(f, name)
        assert val == 0.0 and isinstance(val, float), name


def test_currency_fields_present_with_defaults():
    assert ConnectorStatus(platform="meta", state="ok").currency is None
    b = Blended()
    assert b.currency == "" and b.currency_mismatch is False
    snap = UnifiedSnapshot(brand_id="x", since="2026-06-01", until="2026-06-02")
    assert snap.currency == ""
