from ai_layer import meta_transform as mt
from ai_layer.db import models as m


def test_schema_is_ai_layer():
    assert m.Base.metadata.schema == "ai_layer"


def test_fact_columns_match_campaigndayfact():
    """Drift guard: Fact's metric/dim columns == the 20 stable FACT_FIELDS (the
    table contract), NOT the full CampaignDayFact dataclass -- which also carries
    extended ad/adset/video fields that never reach this table."""
    tenant = {"brand_id", "platform", "account_id", "updated_at"}
    model_cols = {c.name for c in m.Fact.__table__.columns} - tenant
    assert model_cols == set(mt.FACT_FIELDS)


def test_fact_primary_key():
    pk = {c.name for c in m.Fact.__table__.primary_key.columns}
    assert pk == {"brand_id", "platform", "account_id", "campaign_id", "date"}


def test_tables_present():
    names = set(m.Base.metadata.tables)  # schema-qualified
    assert {"ai_layer.brands", "ai_layer.accounts", "ai_layer.facts",
            "ai_layer.cost_ledger", "ai_layer.brand_config",
            "ai_layer.creative_jobs"} <= names


def test_intelligence_tables_exist(db_session):
    from sqlalchemy import inspect
    from ai_layer.db import engine
    insp = inspect(engine.get_engine() if hasattr(engine, "get_engine") else db_session.bind)
    tables = insp.get_table_names(schema="ai_layer")
    for t in ("insight_rows", "insight_fetch_log", "monthly_facts", "competitor_intel"):
        assert t in tables, f"missing table {t}"
