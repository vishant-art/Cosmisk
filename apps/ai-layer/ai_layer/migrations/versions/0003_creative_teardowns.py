"""creative_teardowns: the durable structural library (T12)

One row per torn-down real ad, BOTH cohorts. A teardown costs an ASR call plus a vision
call and is immutable (an ad's structure does not change after it ran), so caching it by
(brand_id, ad_id) turns a per-run cost into a library that compounds. Today the template
dies with the run directory and every run re-analyses the same winner.

Losers are stored too, and that is the point: a winner-only library cannot support a claim.

Additive: no existing table is touched.

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'creative_teardowns',
        sa.Column('brand_id', sa.Text(), nullable=False),
        sa.Column('ad_id', sa.Text(), nullable=False),
        sa.Column('cohort', sa.Text(), nullable=False),
        sa.Column('template_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('thumb_stop_rate', sa.Double(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('brand_id', 'ad_id'),
        schema='ai_layer',
    )
    op.create_index('ix_teardowns_brand_cohort', 'creative_teardowns',
                    ['brand_id', 'cohort'], unique=False, schema='ai_layer')


def downgrade() -> None:
    op.drop_index('ix_teardowns_brand_cohort', table_name='creative_teardowns',
                  schema='ai_layer')
    op.drop_table('creative_teardowns', schema='ai_layer')
