"""creative_variants: the closed performance loop (T11)

One row per shipped variant. `variant_id` says what we changed, `meta_ad_id` says which ad
it became (stamped by an operator after publishing -- there is no auto-publisher), and the
metrics say what happened. Without it, N ads that shipped are N unattributable numbers.

Additive: no existing table is touched.

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-13
"""
from alembic import op
import sqlalchemy as sa

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'creative_variants',
        sa.Column('variant_id', sa.Text(), nullable=False),
        sa.Column('brand_id', sa.Text(), nullable=True),
        sa.Column('base_id', sa.Text(), nullable=False),
        sa.Column('axis', sa.Text(), nullable=False),
        sa.Column('value', sa.Text(), nullable=False),
        sa.Column('kind', sa.Text(), nullable=True),
        sa.Column('artifact_path', sa.Text(), nullable=True),
        # NULL until published -- the join.
        sa.Column('meta_ad_id', sa.Text(), nullable=True),
        # NULL until harvested. NULL means "not observed", NOT zero.
        sa.Column('thumb_stop_rate', sa.Double(), nullable=True),
        sa.Column('thruplay_rate', sa.Double(), nullable=True),
        sa.Column('impressions', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('spend', sa.Double(), nullable=False, server_default='0'),
        sa.Column('roas', sa.Double(), nullable=True),
        sa.Column('harvested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['brand_id'], ['ai_layer.brands.brand_id'], ),
        sa.PrimaryKeyConstraint('variant_id'),
        schema='ai_layer',
    )
    op.create_index('ix_variants_brand_axis', 'creative_variants', ['brand_id', 'axis'],
                    unique=False, schema='ai_layer')
    op.create_index('ix_variants_meta_ad', 'creative_variants', ['meta_ad_id'],
                    unique=False, schema='ai_layer')


def downgrade() -> None:
    op.drop_index('ix_variants_meta_ad', table_name='creative_variants', schema='ai_layer')
    op.drop_index('ix_variants_brand_axis', table_name='creative_variants', schema='ai_layer')
    op.drop_table('creative_variants', schema='ai_layer')
