"""add auto_adjusted to tenant_product_prices

Revision ID: 99e96fcde85f
Revises: 1cad1c7b538f
Create Date: 2026-07-01 18:38:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '99e96fcde85f'
down_revision: Union[str, None] = 'e738d729a1b2'
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
    safe_execute(conn, op.add_column, 
        'tenant_product_prices',
        sa.Column('auto_adjusted', sa.Boolean(), nullable=True, server_default=sa.text('false'))
    )


def downgrade() -> None:
    conn = op.get_bind()
    safe_execute(conn, op.drop_column, 'tenant_product_prices', 'auto_adjusted')
