"""merge heads

Revision ID: merge_heads_c1
Revises: 72cfba056d95, b1c2d3e4f5g6
Create Date: 2026-07-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'merge_heads_c1'
down_revision: Union[str, Sequence[str], None] = ('72cfba056d95', 'b1c2d3e4f5g6')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
