from ai_layer.db import engine


def test_to_psycopg3_rewrites_scheme():
    assert engine.to_psycopg3("postgresql://u:p@h/db").startswith("postgresql+psycopg://")
    assert engine.to_psycopg3("postgres://u:p@h/db").startswith("postgresql+psycopg://")
    # already-qualified is left alone
    assert engine.to_psycopg3("postgresql+psycopg://x") == "postgresql+psycopg://x"


def test_to_psycopg3_requires_url():
    import pytest
    with pytest.raises(RuntimeError):
        engine.to_psycopg3("")


def test_preflight_ok_against_test_branch():
    engine.reset_engine()
    assert engine.preflight() is True


def test_engine_connect_args_include_keepalives():
    for k in ("keepalives", "keepalives_idle", "keepalives_interval",
              "keepalives_count", "connect_timeout"):
        assert k in engine.CONNECT_ARGS
    assert engine.CONNECT_ARGS["keepalives"] == 1
