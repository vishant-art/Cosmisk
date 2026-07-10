"""ORM models for the `ai_layer` schema. All tables are brand_id-keyed."""
from __future__ import annotations

import datetime as dt

from sqlalchemy import (BigInteger, Date, DateTime, Double, ForeignKey, Index,
                        Integer, MetaData, Text, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from ai_layer.db.engine import SCHEMA

# The 17 float metric columns (the 3 dim cols campaign_id/campaign_name/date are separate).
FACT_METRIC_COLS = [
    "spend", "impressions", "reach", "frequency", "clicks", "ctr", "cpc",
    "link_clicks", "link_ctr", "cost_per_link_click", "cpm",
    "add_to_cart", "checkout", "purchases", "revenue", "roas", "cpa",
]


class Base(DeclarativeBase):
    metadata = MetaData(schema=SCHEMA)


class Brand(Base):
    __tablename__ = "brands"
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    brand_name: Mapped[str | None] = mapped_column(Text)
    meta_account_id: Mapped[str | None] = mapped_column(Text)
    google_customer_id: Mapped[str | None] = mapped_column(Text)
    shopify_domain: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Account(Base):
    __tablename__ = "accounts"
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    platform: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    account_name: Mapped[str | None] = mapped_column(Text)
    currency: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Fact(Base):
    __tablename__ = "facts"
    __table_args__ = (Index("ix_facts_brand_date", "brand_id", "date"),)
    brand_id: Mapped[str] = mapped_column(Text, primary_key=True)
    platform: Mapped[str] = mapped_column(Text, primary_key=True)
    account_id: Mapped[str] = mapped_column(Text, primary_key=True)
    campaign_id: Mapped[str] = mapped_column(Text, primary_key=True)
    date: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    campaign_name: Mapped[str] = mapped_column(Text, default="")
    spend: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    impressions: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    reach: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    frequency: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    clicks: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    ctr: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cpc: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    link_clicks: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    link_ctr: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cost_per_link_click: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cpm: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    add_to_cart: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    checkout: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    purchases: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    revenue: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    roas: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    cpa: Mapped[float] = mapped_column(Double, nullable=False, default=0.0)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CostLedgerEntry(Base):
    __tablename__ = "cost_ledger"
    __table_args__ = (Index("ix_cost_brand_created", "brand_id", "created_at"),)
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    brand_id: Mapped[str | None] = mapped_column(Text)
    account_id: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    op: Mapped[str] = mapped_column(Text)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    cost_usd: Mapped[float] = mapped_column(Double, default=0.0)
    priced: Mapped[str] = mapped_column(Text)
    cache_discount_usd: Mapped[float | None] = mapped_column(Double)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BrandConfig(Base):
    __tablename__ = "brand_config"
    brand_id: Mapped[str] = mapped_column(Text, ForeignKey("brands.brand_id"), primary_key=True)
    brand_kit_json: Mapped[dict | None] = mapped_column(JSONB)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CreativeJob(Base):
    __tablename__ = "creative_jobs"
    __table_args__ = (Index("ix_jobs_brand_created", "brand_id", "created_at"),)
    job_id: Mapped[str] = mapped_column(Text, primary_key=True)
    brand_id: Mapped[str | None] = mapped_column(Text, ForeignKey("brands.brand_id"))  # NULLABLE (brief mode)
    account_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str | None] = mapped_column(Text)
    stage: Mapped[str | None] = mapped_column(Text)
    request_json: Mapped[dict | None] = mapped_column(JSONB)
    brand_kit_json: Mapped[dict | None] = mapped_column(JSONB)
    assets_json: Mapped[list | None] = mapped_column(JSONB)
    video_json: Mapped[dict | None] = mapped_column(JSONB)
    winners_json: Mapped[list | None] = mapped_column(JSONB)
    rejected_json: Mapped[list | None] = mapped_column(JSONB)
    progress_json: Mapped[list | None] = mapped_column(JSONB)
    ledger_json: Mapped[dict | None] = mapped_column(JSONB)
    cost_usd: Mapped[float] = mapped_column(Double, default=0.0)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
