"""Add due_date and payment_method to Transaction

Revision ID: 1a2b3c4d5e6f
Revises: 
Create Date: 2026-07-02 22:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '1a2b3c4d5e6f'
down_revision = '99e96fcde85f'
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

def upgrade() -> None:
    conn = op.get_bind()
    safe_execute(conn, op.add_column, 'transactions', sa.Column('payment_method', sa.String(length=50), nullable=True))
    safe_execute(conn, op.add_column, 'transactions', sa.Column('due_date', sa.Date(), nullable=True))
    safe_execute(conn, op.create_index, op.f('ix_transactions_due_date'), 'transactions', ['due_date'], unique=False)

def downgrade() -> None:
    conn = op.get_bind()
    safe_execute(conn, op.drop_index, op.f('ix_transactions_due_date'), table_name='transactions')
    safe_execute(conn, op.drop_column, 'transactions', 'due_date')
    safe_execute(conn, op.drop_column, 'transactions', 'payment_method')
