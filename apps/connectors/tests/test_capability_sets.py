from connectors import META_METRICS, GOOGLE_METRICS, SHOPIFY_METRICS
from connectors.capabilities import METRIC_FIELDS, measures


def test_meta_measures_everything():
    assert META_METRICS == frozenset(METRIC_FIELDS)
    assert len(METRIC_FIELDS) == 17


def test_google_excludes_only_truly_absent_fields():
    assert GOOGLE_METRICS == META_METRICS - {"reach", "frequency", "add_to_cart", "checkout"}
    assert "ctr" in GOOGLE_METRICS and "roas" in GOOGLE_METRICS   # derived counts as measured
    assert "reach" not in GOOGLE_METRICS


def test_shopify_measures_only_revenue_and_conversions():
    assert SHOPIFY_METRICS == frozenset({"revenue", "conversions"})


def test_measures_helper():
    assert measures("shopify", "revenue") is True
    assert measures("shopify", "spend") is False
    assert measures("google", "reach") is False
    assert measures("meta", "add_to_cart") is True
