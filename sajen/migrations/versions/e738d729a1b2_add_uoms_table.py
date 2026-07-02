"""add uoms table

Revision ID: e738d729a1b2
Revises: 3028a945ea11
Create Date: 2026-06-29 18:35:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'e738d729a1b2'
down_revision: Union[str, None] = '3028a945ea11'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Create uoms table
    op.create_table(
        'uoms',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('code', sa.String(length=20), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False, server_default='count'),
        sa.Column('description', sa.String(length=255), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='active'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_uoms_id'), 'uoms', ['id'], unique=False)
    op.create_index(op.f('ix_uoms_code'), 'uoms', ['code'], unique=True)

    # Insert default UOMs
    op.execute("INSERT INTO uoms (code, name, category, description, status) VALUES ('pcs', 'Pieces / Biji', 'count', 'Satuan hitung barang eceran satuan tunggal', 'active') ON CONFLICT (code) DO NOTHING")
    op.execute("INSERT INTO uoms (code, name, category, description, status) VALUES ('kg', 'Kilogram', 'weight', 'Satuan standar untuk berat/massa sembako', 'active') ON CONFLICT (code) DO NOTHING")
    op.execute("INSERT INTO uoms (code, name, category, description, status) VALUES ('ltr', 'Liter', 'volume', 'Satuan volume zat cair seperti minyak goreng', 'active') ON CONFLICT (code) DO NOTHING")
    op.execute("INSERT INTO uoms (code, name, category, description, status) VALUES ('box', 'Kotak / Dus', 'count', 'Satuan kemasan karton/dus isi banyak', 'active') ON CONFLICT (code) DO NOTHING")
    op.execute("INSERT INTO uoms (code, name, category, description, status) VALUES ('lusin', 'Lusin', 'count', 'Satuan isi 12 pcs', 'active') ON CONFLICT (code) DO NOTHING")

def downgrade() -> None:
    op.drop_index(op.f('ix_uoms_code'), table_name='uoms')
    op.drop_index(op.f('ix_uoms_id'), table_name='uoms')
    op.drop_table('uoms')
