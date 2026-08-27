"""merge multiple heads

Revision ID: 6dc2f2936e02
Revises: ba237ab31947, e58d8414d890
Create Date: 2026-07-24 10:51:04.049090

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6dc2f2936e02'
down_revision: Union[str, None] = ('ba237ab31947', 'e58d8414d890')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
