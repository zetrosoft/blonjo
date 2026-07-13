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


def upgrade() -> None:
    op.add_column('contacts', sa.Column('sales_visit_day', sa.String(length=20), nullable=True))
    op.add_column('contacts', sa.Column('sales_visit_interval', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('contacts', 'sales_visit_interval')
    op.drop_column('contacts', 'sales_visit_day')
