from sqlalchemy import Column, Integer, String, Text, ForeignKey, JSON, Boolean
from sqlalchemy.orm import relationship
from app.models.base import Base

class VibeChatSession(Base):
    """
    Sesi Percakapan Multi-Turn Vibes Chat per Tenant & User.
    """
    __tablename__ = "vibe_chat_sessions"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(255), nullable=False, default="Percakapan Baru")

    tenant = relationship("Tenant")
    user = relationship("User")
    messages = relationship("VibeChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="VibeChatMessage.id.asc()")

class VibeChatMessage(Base):
    """
    Log Pesan Chat per Sesi.
    """
    __tablename__ = "vibe_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("vibe_chat_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False) # 'user' | 'assistant'
    content = Column(Text, nullable=False)
    sources = Column(JSON, nullable=True) # ['Database Finansial Riil', ...]

    session = relationship("VibeChatSession", back_populates="messages")

class VibesMemory(Base):
    """
    Persistent Memory Store per Tenant (Basemind Model).
    Stores long-term insights, owner preferences, and business patterns.
    """
    __tablename__ = "vibes_memory"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    memory_type = Column(String(50), nullable=False, default="insight") # 'short_term', 'long_term', 'preference', 'insight'
    scope = Column(String(30), nullable=False, default="GENERAL", index=True) # 'FORMAT', 'COMMODITY', 'SUPPLIER', 'FINANCIAL', 'GENERAL'
    entity_key = Column(String(100), nullable=True, index=True)
    content = Column(Text, nullable=False)
    importance_score = Column(Integer, default=1, nullable=False) # 1 - 5
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    superseded_by = Column(Integer, nullable=True)
    
    tenant = relationship("Tenant")
