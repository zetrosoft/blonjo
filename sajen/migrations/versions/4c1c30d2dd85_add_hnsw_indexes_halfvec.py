"""add_hnsw_indexes_halfvec

Revision ID: 4c1c30d2dd85
Revises: 6442ac5c25c4
Create Date: 2026-06-04 15:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4c1c30d2dd85'
down_revision: Union[str, None] = '6442ac5c25c4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Convert columns to halfvec(3072) - Supported in pgvector 0.7.0+
    op.execute("ALTER TABLE products ALTER COLUMN embedding TYPE halfvec(3072);")
    op.execute("ALTER TABLE ai_learning_templates ALTER COLUMN embedding TYPE halfvec(3072);")
    
    # 2. Add HNSW Indexes using halfvec_cosine_ops
    op.execute("CREATE INDEX IF NOT EXISTS ix_products_embedding_hnsw ON products USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);")
    op.execute("CREATE INDEX IF NOT EXISTS ix_ai_templates_embedding_hnsw ON ai_learning_templates USING hnsw (embedding halfvec_cosine_ops) WITH (m = 16, ef_construction = 64);")


def downgrade() -> None:
    # Drop indexes
    op.execute("DROP INDEX IF EXISTS ix_products_embedding_hnsw;")
    op.execute("DROP INDEX IF EXISTS ix_ai_templates_embedding_hnsw;")
    
    # Revert to standard vector(3072)
    op.execute("ALTER TABLE products ALTER COLUMN embedding TYPE vector(3072);")
    op.execute("ALTER TABLE ai_learning_templates ALTER COLUMN embedding TYPE vector(3072);")
