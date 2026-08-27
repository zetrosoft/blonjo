"""add vibes_memory table

Revision ID: f1a2b3c4d5e6
Revises: merge_heads_c1
Create Date: 2026-08-26
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'merge_heads_c1'
branch_labels = None
depends_on = None

def safe_execute(conn, func, *args, **kwargs):
    from sqlalchemy import text
    try:
        conn.execute(text('SAVEPOINT sp1'))
        func(*args, **kwargs)
        conn.execute(text('RELEASE SAVEPOINT sp1'))
    except Exception as e:
        conn.execute(text('ROLLBACK TO SAVEPOINT sp1'))
        print(f"Skipping due to error: {e}")

def upgrade():
    conn = op.get_bind()
    safe_execute(conn, op.create_table,
        'vibes_memory',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=False),
        sa.Column('memory_type', sa.String(50), nullable=False, server_default='insight'),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('importance_score', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True)
    )
    safe_execute(conn, op.create_index, 'ix_vibes_memory_tenant_id', 'vibes_memory', ['tenant_id'])
    safe_execute(conn, op.create_index, 'ix_vibes_memory_type', 'vibes_memory', ['memory_type'])

def downgrade():
    conn = op.get_bind()
    safe_execute(conn, op.drop_table, 'vibes_memory')
