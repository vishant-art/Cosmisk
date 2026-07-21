from creative_studio.config import Settings, asyncpg_dsn, get_settings

def test_settings_load_from_root_env():
    s = get_settings()
    has_openrouter_prefix = s.openrouter_api_key.startswith("sk-or-")
    assert has_openrouter_prefix
    fal_admin_key_stripped = s.fal_admin_key == s.fal_admin_key.strip()
    assert fal_admin_key_stripped
    assert s.storage_bucket == "cosmisk-mvp-v1"

def test_meta_app_fields_exist():
    s = get_settings()
    assert isinstance(s.meta_app_id, str) and isinstance(s.meta_app_secret, str)

def test_asyncpg_dsn_strips_channel_binding():
    raw = "postgresql://u:p@h/db?sslmode=require&channel_binding=require"
    assert asyncpg_dsn(raw) == "postgresql://u:p@h/db?sslmode=require"
