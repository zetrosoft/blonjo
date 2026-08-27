"""add discount fields to inventorylog

Revision ID: e58d8414d890
Revises: d90631c263ad
Create Date: 2026-07-20 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e58d8414d890'
down_revision: Union[str, None] = 'd90631c263ad'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass

def downgrade() -> None:
    pass
