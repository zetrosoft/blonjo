"""add_sales_visit_day

Revision ID: ba237ab31947
Revises: b140b7c8d34e
Create Date: 2026-07-12 23:51:01.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ba237ab31947'
down_revision: Union[str, None] = 'b140b7c8d34e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def safe_execute(conn, func, *args, **kwargs):
    from sqlalchemy import text
    try:
        conn.execute(text('SAVEPOINT sp1'))
        func(*args, **kwargs)
        conn.execute(text('RELEASE SAVEPOINT sp1'))
    except Exception as e:
        conn.execute(text('ROLLBACK TO SAVEPOINT sp1'))
        print(f"Skipping due to error: {e}")

def upgrade() -> None:
    conn = op.get_bind()
    safe_execute(conn, op.add_column, 'contacts', sa.Column('sales_visit_day', sa.String(length=20), nullable=True))
    safe_execute(conn, op.add_column, 'contacts', sa.Column('sales_visit_interval', sa.Integer(), nullable=True))


def downgrade() -> None:
    conn = op.get_bind()
    safe_execute(conn, op.drop_column, 'contacts', 'sales_visit_interval')
    safe_execute(conn, op.drop_column, 'contacts', 'sales_visit_day')
