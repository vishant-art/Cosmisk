"""Guard: the ai-layer brain formats fields directly (int(reach), f'{cpc:.2f}', ...) and is NOT
None-safe. A default UnifiedFact must survive that formatting with no TypeError. We replicate the
formatting here (isolation: the connector must not import ai-layer)."""
from connectors.contract import UnifiedFact


def test_default_unified_fact_survives_brain_style_formatting():
    f = UnifiedFact(platform="shopify", account_id="a1", entity_id="orders", date="2026-06-01")
    # Mirror chat.build_context's direct int()/:.2f formatting over every consumed field.
    line = (
        f"reach={int(f.reach)} freq={f.frequency:.2f} clicks={int(f.clicks)} "
        f"link_clicks={int(f.link_clicks)} link_ctr={f.link_ctr:.2f} cpc={f.cpc:.2f} "
        f"cost_per_link_click={f.cost_per_link_click:.2f} cpm={f.cpm:.2f} "
        f"atc={int(f.add_to_cart)} checkout={int(f.checkout)} purchases={int(f.conversions)} "
        f"revenue={f.revenue:.2f} roas={f.roas:.2f} cpa={f.cpa:.2f} ctr={f.ctr:.2f} "
        f"impressions={int(f.impressions)} spend={f.spend:.2f}"
    )
    assert "reach=0" in line and "roas=0.00" in line   # formatted, no TypeError
