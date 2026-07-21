from creative_studio.config import Settings, asyncpg_dsn, get_settings

def test_settings_load_from_root_env():
    s = get_settings()
    assert s.openrouter_api_key.startswith("sk-or-")
    assert s.fal_admin_key == s.fal_admin_key.strip()
    assert s.storage_bucket == "cosmisk-mvp-v1"

def test_asyncpg_dsn_strips_channel_binding():
    raw = "postgresql://u:p@h/db?sslmode=require&channel_binding=require"
    assert asyncpg_dsn(raw) == "postgresql://u:p@h/db?sslmode=require"
