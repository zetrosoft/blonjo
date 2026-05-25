from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base

class AppSetting(Base):
    """
    Dynamic configurations for storing store profiles, AI parameters, or integrations.
    Supports system-level global defaults (where tenant_id = NULL) and tenant override overrides.
    """
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    key = Column(String(100), nullable=False, index=True)
    value = Column(String(1000), nullable=True)
    description = Column(String(255), nullable=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="settings")

    # Prevent duplicate setting keys for the same tenant
    __table_args__ = (
        UniqueConstraint("tenant_id", "key", name="uq_setting_tenant_key"),
    )
