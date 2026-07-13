"""add_cashflow_projection_snapshots

Revision ID: a1b2c3d4e5f6
Revises: add_payment_and_due_date
Create Date: 2026-07-05
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '1a2b3c4d5e6f'
branch_labels = None
depends_on = None



def upgrade():
    op.create_table(
        'cashflow_projection_snapshots',
        sa.Column('id',               sa.Integer(),     primary_key=True, autoincrement=True),
        sa.Column('tenant_id',        sa.Integer(),     sa.ForeignKey('tenants.id'), nullable=False),
        sa.Column('projection_date',  sa.Date(),        nullable=False),
        sa.Column('target_date',      sa.Date(),        nullable=False),
        sa.Column('projected_inflow', sa.Numeric(18,2), nullable=True, server_default='0'),
        sa.Column('projected_outflow',sa.Numeric(18,2), nullable=True, server_default='0'),
        sa.Column('projected_net',    sa.Numeric(18,2), nullable=True, server_default='0'),
        sa.Column('actual_inflow',    sa.Numeric(18,2), nullable=True),
        sa.Column('actual_outflow',   sa.Numeric(18,2), nullable=True),
        sa.Column('actual_net',       sa.Numeric(18,2), nullable=True),
        sa.Column('note',             sa.String(255),   nullable=True),
        sa.Column('created_at',       sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at',       sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('tenant_id', 'projection_date', 'target_date',
                            name='uq_cashflow_snapshot'),
    )
    op.create_index('ix_cashflow_snapshot_tenant', 'cashflow_projection_snapshots', ['tenant_id'])
    op.create_index('ix_cashflow_snapshot_target', 'cashflow_projection_snapshots', ['target_date'])


def downgrade():
    op.drop_index('ix_cashflow_snapshot_target', table_name='cashflow_projection_snapshots')
    op.drop_index('ix_cashflow_snapshot_tenant', table_name='cashflow_projection_snapshots')
    op.drop_table('cashflow_projection_snapshots')
