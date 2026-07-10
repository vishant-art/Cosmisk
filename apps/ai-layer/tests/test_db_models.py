from dataclasses import fields

from ai_layer import meta_transform as mt
from ai_layer.db import models as m


def test_schema_is_ai_layer():
    assert m.Base.metadata.schema == "ai_layer"


def test_fact_columns_match_campaigndayfact():
    """Drift guard: Fact's metric/dim columns == the 20 CampaignDayFact fields."""
    tenant = {"brand_id", "platform", "account_id", "updated_at"}
    model_cols = {c.name for c in m.Fact.__table__.columns} - tenant
    dataclass_fields = {f.name for f in fields(mt.CampaignDayFact)}
    assert model_cols == dataclass_fields


def test_fact_primary_key():
    pk = {c.name for c in m.Fact.__table__.primary_key.columns}
    assert pk == {"brand_id", "platform", "account_id", "campaign_id", "date"}


def test_tables_present():
    names = set(m.Base.metadata.tables)  # schema-qualified
    assert {"ai_layer.brands", "ai_layer.accounts", "ai_layer.facts",
            "ai_layer.cost_ledger", "ai_layer.brand_config",
            "ai_layer.creative_jobs"} <= names
