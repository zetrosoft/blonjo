"""add_image_hash_to_ocrtask

Revision ID: 9a8b7c6d5e4f
Revises: b140b7c8d34e
Create Date: 2026-08-24 15:36:00
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '9a8b7c6d5e4f'
down_revision: Union[str, Sequence[str], None] = ('b140b7c8d34e', 'b1c2d3e4f5g6')
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
    safe_execute(conn, op.add_column, 'ocr_tasks', sa.Column('image_hash', sa.String(), nullable=True))
    safe_execute(conn, op.create_index, 'ix_ocr_tasks_image_hash', 'ocr_tasks', ['image_hash'], unique=False)

def downgrade() -> None:
    conn = op.get_bind()
    safe_execute(conn, op.drop_index, 'ix_ocr_tasks_image_hash', table_name='ocr_tasks')
    safe_execute(conn, op.drop_column, 'ocr_tasks', 'image_hash')
