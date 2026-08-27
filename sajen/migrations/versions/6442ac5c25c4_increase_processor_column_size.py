"""increase_processor_column_size

Revision ID: 6442ac5c25c4
Revises: f5cfc8295324
Create Date: 2026-06-04 14:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6442ac5c25c4'
down_revision: Union[str, None] = 'f5cfc8295324'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


from sqlalchemy.engine.reflection import Inspector

def upgrade() -> None:
    # Increase processor column size to 150 to accommodate long host URLs like ngrok
    conn = op.get_bind()
    inspector = Inspector.from_engine(conn)
    tables = inspector.get_table_names()
    
    if 'ai_parsing_logs' in tables:
        columns = [c['name'] for c in inspector.get_columns('ai_parsing_logs')]
        if 'processor' in columns:
            op.alter_column('ai_parsing_logs', 'processor',
                       existing_type=sa.String(length=50),
                       type_=sa.String(length=150),
                       existing_nullable=False)


def downgrade() -> None:
    op.alter_column('ai_parsing_logs', 'processor',
               existing_type=sa.String(length=150),
               type_=sa.String(length=50),
               existing_nullable=False)
