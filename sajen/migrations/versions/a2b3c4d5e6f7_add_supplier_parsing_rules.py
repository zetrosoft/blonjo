"""add supplier_parsing_rules table

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-08-31
"""
from alembic import op
import sqlalchemy as sa

revision = 'a2b3c4d5e6f7'
down_revision = 'f1a2b3c4d5e6'
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
        'supplier_parsing_rules',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('tenant_id', sa.Integer(), sa.ForeignKey('tenants.id', ondelete='CASCADE'), nullable=True),
        sa.Column('supplier_pattern', sa.String(255), nullable=False),
        sa.Column('rule_category', sa.String(50), nullable=False, server_default='general'),
        sa.Column('rule_instruction', sa.Text(), nullable=False),
        sa.Column('sample_diff', sa.JSON(), nullable=True),
        sa.Column('confidence_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True)
    )
    safe_execute(conn, op.create_index, 'ix_supplier_parsing_rules_tenant_id', 'supplier_parsing_rules', ['tenant_id'])
    safe_execute(conn, op.create_index, 'ix_supplier_parsing_rules_supplier_pattern', 'supplier_parsing_rules', ['supplier_pattern'])

def downgrade():
    conn = op.get_bind()
    safe_execute(conn, op.drop_table, 'supplier_parsing_rules')
