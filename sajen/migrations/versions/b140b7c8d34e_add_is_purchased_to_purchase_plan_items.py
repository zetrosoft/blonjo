"""add_is_purchased_to_purchase_plan_items

Revision ID: b140b7c8d34e
Revises: merge_heads_c1
Create Date: 2026-07-06 11:08:52.133907

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b140b7c8d34e'
down_revision: Union[str, None] = 'merge_heads_c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('purchase_plan_items', sa.Column('is_purchased', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade() -> None:
    op.drop_column('purchase_plan_items', 'is_purchased')
