"""intelligence stores: insight cache, monthly facts, competitor intel

Four additive tables backing the Meta Ads intelligence chat:

- insight_rows: the fetch cache's raw row store (any level, full actions arrays kept raw
  so re-normalization is free when fact logic evolves).
- insight_fetch_log: the cache's fetched_dates set -- one row per (scope, date) already
  pulled from Meta.
- monthly_facts: durable month rollups (exact rnd history.py shape, incl. mom) that
  survive past Meta's 37-month retention window.
- competitor_intel: discovery + scraped-ads records per account, with independent
  timestamps since discovery is ~permanent while ads go stale after STALE_DAYS.

Additive: no existing table is touched.

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'insight_rows',
        sa.Column('brand_id', sa.Text(), nullable=False),
        sa.Column('account_id', sa.Text(), nullable=False),
        sa.Column('level', sa.Text(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('row_key', sa.Text(), nullable=False),
        sa.Column('raw', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('brand_id', 'account_id', 'level', 'date', 'row_key'),
        schema='ai_layer',
    )
    op.create_index('ix_insight_rows_scope_date', 'insight_rows',
                    ['brand_id', 'account_id', 'level', 'date'], unique=False, schema='ai_layer')

    op.create_table(
        'insight_fetch_log',
        sa.Column('brand_id', sa.Text(), nullable=False),
        sa.Column('account_id', sa.Text(), nullable=False),
        sa.Column('level', sa.Text(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('fetched_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('brand_id', 'account_id', 'level', 'date'),
        schema='ai_layer',
    )

    op.create_table(
        'monthly_facts',
        sa.Column('brand_id', sa.Text(), nullable=False),
        sa.Column('account_id', sa.Text(), nullable=False),
        sa.Column('level', sa.Text(), nullable=False),
        sa.Column('month', sa.Text(), nullable=False),
        sa.Column('rollup', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('brand_id', 'account_id', 'level', 'month'),
        schema='ai_layer',
    )

    op.create_table(
        'competitor_intel',
        sa.Column('brand_id', sa.Text(), nullable=False),
        sa.Column('account_id', sa.Text(), nullable=False),
        sa.Column('discovery_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('discovered_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('ads_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('scraped_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('brand_id', 'account_id'),
        schema='ai_layer',
    )


def downgrade() -> None:
    op.drop_table('competitor_intel', schema='ai_layer')
    op.drop_table('monthly_facts', schema='ai_layer')
    op.drop_table('insight_fetch_log', schema='ai_layer')
    op.drop_index('ix_insight_rows_scope_date', table_name='insight_rows', schema='ai_layer')
    op.drop_table('insight_rows', schema='ai_layer')
