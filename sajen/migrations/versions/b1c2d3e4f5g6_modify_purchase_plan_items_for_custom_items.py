"""modify_purchase_plan_items_for_custom_items

Revision ID: b1c2d3e4f5g6
Revises: a1b2c3d4e5f6
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = 'b1c2d3e4f5g6'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade():
    # 1. Jadikan product_id nullable di purchase_plan_items
    op.alter_column('purchase_plan_items', 'product_id',
                    existing_type=sa.Integer(),
                    nullable=True)
    # 2. Tambah kolom custom_product_name
    op.add_column('purchase_plan_items', sa.Column('custom_product_name', sa.String(length=100), nullable=True))


def downgrade():
    op.drop_column('purchase_plan_items', 'custom_product_name')
    op.alter_column('purchase_plan_items', 'product_id',
                    existing_type=sa.Integer(),
                    nullable=False)
