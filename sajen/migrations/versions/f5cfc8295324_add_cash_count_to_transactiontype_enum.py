"""add cash_count to transactiontype enum

Revision ID: f5cfc8295324
Revises: 1cad1c7b538f
Create Date: 2026-06-01 04:50:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'f5cfc8295324'
down_revision: Union[str, None] = '1cad1c7b538f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # We must use autocommit block since ALTER TYPE ADD VALUE cannot run in a transaction in PostgreSQL
    with op.get_context().autocommit_block():
        connection = op.get_bind()
        val = 'CASH_COUNT'
        # Query if value exists
        res = connection.execute(sa.text(
            f"SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
            f"WHERE pg_type.typname = 'transactiontype' AND pg_enum.enumlabel = '{val}'"
        )).fetchone()
        if not res:
            connection.execute(sa.text(f"ALTER TYPE transactiontype ADD VALUE '{val}'"))

def downgrade() -> None:
    pass
