"""migrate_rag_to_mcp_and_drop

Revision ID: c6a98b816738
Revises: 1a2b3c4d5e6f
Create Date: 2026-07-03 14:14:08.836213

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c6a98b816738'
down_revision: Union[str, None] = '1a2b3c4d5e6f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. ETL Data dari ai_learning_templates (Sajen) ke knowledge_vectors (MCP)
    # Gunakan text() dan bind.execute()
    bind = op.get_bind()
    
    # Periksa apakah knowledge_vectors (tabel MCP) ada di database
    check_table = bind.execute(sa.text("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'knowledge_vectors');")).scalar()
    
    if not check_table:
        raise Exception("Tabel 'knowledge_vectors' milik MCP Server belum ada di database (blonjo_db). Silakan jalankan init-db/01-init.sql dari mcp-server terlebih dahulu sebelum mendeploy SAJEN.")
        
    # Jalankan migrasi
    bind.execute(sa.text("""
        INSERT INTO knowledge_vectors (content, metadata, embedding)
        SELECT 
            raw_ocr_text AS content, 
            jsonb_build_object(
                'app_context', 'sajen_ocr',
                'tenant_id', tenant_id,
                'file_name', file_name,
                'expected_output', expected_output,
                'usage_count', usage_count
            ) AS metadata, 
            embedding::halfvec(3072) AS embedding
        FROM ai_learning_templates
        WHERE embedding IS NOT NULL;
    """))
        
    # 2. Hapus tabel lama (bersihkan storage)
    op.drop_index('ix_ai_learning_templates_id', table_name='ai_learning_templates')
    op.drop_index('ix_ai_learning_templates_tenant_id', table_name='ai_learning_templates')
    op.drop_table('ai_learning_templates')


def downgrade() -> None:
    # Karena kita menghapus data, downgrade tidak mengembalikan data yang sudah berpindah ke MCP
    # Kita hanya membuat ulang strukturnya saja
    op.create_table('ai_learning_templates',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('tenant_id', sa.Integer(), nullable=True),
        sa.Column('file_name', sa.String(), nullable=True),
        sa.Column('raw_ocr_text', sa.Text(), nullable=False),
        sa.Column('expected_output', sa.Text(), nullable=False),
        sa.Column('usage_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('embedding', sa.VARCHAR(), nullable=True), # Note: using original vector representation
        sa.ForeignKeyConstraint(['tenant_id'], ['tenants.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_ai_learning_templates_tenant_id', 'ai_learning_templates', ['tenant_id'], unique=False)
    op.create_index('ix_ai_learning_templates_id', 'ai_learning_templates', ['id'], unique=False)
