"""add_all_enum_values_to_transactiontype

Revision ID: e8492040fbc9
Revises: merge_heads_c1, 6dc2f2936e02
Create Date: 2026-08-17 19:18:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e8492040fbc9'
down_revision: Union[str, Sequence[str], None] = ('merge_heads_c1', '6dc2f2936e02')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # We must use autocommit block since ALTER TYPE ADD VALUE cannot run in a transaction in PostgreSQL
    with op.get_context().autocommit_block():
        connection = op.get_bind()
        new_values = [
            'CAPITAL_WITHDRAWAL',
            'CAPITAL_RECLASSIFICATION',
            'CUSTOMER_DEPOSIT',
            'CUSTOMER_WITHDRAWAL',
            'PURCHASE_RETURN',
            'SALES_RETURN'
        ]
        for val in new_values:
            # Query if value exists in pg_enum
            res = connection.execute(sa.text(
                f"SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
                f"WHERE pg_type.typname = 'transactiontype' AND pg_enum.enumlabel = '{val}'"
            )).fetchone()
            if not res:
                connection.execute(sa.text(f"ALTER TYPE transactiontype ADD VALUE '{val}'"))

def downgrade() -> None:
    pass
