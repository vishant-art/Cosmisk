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
