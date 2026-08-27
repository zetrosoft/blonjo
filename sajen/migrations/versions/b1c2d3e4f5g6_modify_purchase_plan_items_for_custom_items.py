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


def safe_execute(conn, func, *args, **kwargs):
    from sqlalchemy import text
    try:
        conn.execute(text('SAVEPOINT sp1'))
        func(*args, **kwargs)
        conn.execute(text('RELEASE SAVEPOINT sp1'))
    except Exception as e:
        conn.execute(text('ROLLBACK TO SAVEPOINT sp1'))
        print(f"Skipping due to error: {e}")

def upgrade():
    conn = op.get_bind()
    # 1. Jadikan product_id nullable di purchase_plan_items
    safe_execute(conn, op.alter_column, 'purchase_plan_items', 'product_id',
                    existing_type=sa.Integer(),
                    nullable=True)
    # 2. Tambah kolom custom_product_name
    safe_execute(conn, op.add_column, 'purchase_plan_items', sa.Column('custom_product_name', sa.String(length=100), nullable=True))


def downgrade():
    conn = op.get_bind()
    safe_execute(conn, op.drop_column, 'purchase_plan_items', 'custom_product_name')
    safe_execute(conn, op.alter_column, 'purchase_plan_items', 'product_id',
                    existing_type=sa.Integer(),
                    nullable=False)
