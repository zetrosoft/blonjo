from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.models.base import Base
from app.models.tenant import Tenant  # noqa: F401
import enum

class ParserType(str, enum.Enum):
    LOCAL = "local"
    OLLAMA = "ollama"
    GEMINI = "gemini"

class AIParsingLog(Base):
    """
    Log history of prompt parsing
    """
    __tablename__ = "ai_parsing_logs"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    original_text = Column(Text, nullable=False)
    prompt = Column(Text, nullable=True)
    parsed_result = Column(Text, nullable=False)
    token_in = Column(Integer, default=0)
    token_out = Column(Integer, default=0)
    processor = Column(String(150), default="local", nullable=False) # Increased to 150 for long host URLs
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    tenant = relationship("Tenant")

class AIModelQuota(Base):
    """
    Track daily usage per AI model to estimate remaining quota.
    """
    __tablename__ = "ai_model_quotas"

    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String(100), nullable=False)
    usage_date = Column(DateTime(timezone=False), default=lambda: datetime.now().date())
    request_count = Column(Integer, default=0)
    token_count = Column(Integer, default=0)

    # Unique constraint per model per day
    __table_args__ = (
        UniqueConstraint("model_name", "usage_date", name="uq_model_quota_date"),
    )
