"""add_new_transaction_types_to_enum

Revision ID: 16c4b1b11f18
Revises: 5113e41f145a
Create Date: 2026-05-25 14:28:06.881079

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '16c4b1b11f18'
down_revision: Union[str, None] = '5113e41f145a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # We must use autocommit block since ALTER TYPE ADD VALUE cannot run in a transaction in PostgreSQL
    with op.get_context().autocommit_block():
        connection = op.get_bind()
        
        for val in ['INCOME', 'OPERATIONAL', 'NON_CASH_OUT', 'NON_CASH_IN', 'CAPITAL']:
            # Query if value exists
            res = connection.execute(sa.text(
                f"SELECT 1 FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
                f"WHERE pg_type.typname = 'transactiontype' AND pg_enum.enumlabel = '{val}'"
            )).fetchone()
            if not res:
                connection.execute(sa.text(f"ALTER TYPE transactiontype ADD VALUE '{val}'"))


def downgrade() -> None:
    # PostgreSQL does not easily support dropping enum values without recreating the enum type.
    # Therefore, downgrade is left as pass.
    pass
