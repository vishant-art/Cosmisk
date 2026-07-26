from connectors.config import Settings, get_settings
from connectors.fx import RateProvider


def test_fx_settings_default_inert():
    s = Settings()
    assert s.fx_enabled is False
    assert s.fx_target_currency is None
    assert s.fx_cache_ttl_hours == 24
    assert s.fx_source == "frankfurter"
    assert s.fx_rate_url is None


def test_fx_settings_read_from_env(monkeypatch):
    monkeypatch.setenv("CONNECTOR_FX_ENABLED", "true")
    monkeypatch.setenv("CONNECTOR_FX_TARGET_CURRENCY", "USD")
    monkeypatch.setenv("CONNECTOR_FX_CACHE_TTL_HOURS", "12")
    monkeypatch.setenv("CONNECTOR_FX_SOURCE", "ecb")
    monkeypatch.setenv("CONNECTOR_FX_RATE_URL", "https://example.test/rates")
    s = get_settings()
    assert s.fx_enabled is True
    assert s.fx_target_currency == "USD"
    assert s.fx_cache_ttl_hours == 12
    assert s.fx_source == "ecb"
    assert s.fx_rate_url == "https://example.test/rates"


def test_rate_provider_is_a_runtime_checkable_protocol():
    class FixedRate:
        def rate(self, base, quote):
            return 80.0
    assert isinstance(FixedRate(), RateProvider)
