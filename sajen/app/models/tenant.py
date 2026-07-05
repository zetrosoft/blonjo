from sqlalchemy import Column, Integer, String, Boolean
from sqlalchemy.orm import relationship
from app.models.base import Base

class Tenant(Base):
    """
    Tenant configuration representing a shop/company in the multi-tenant architecture.
    Supports subdomain dynamic routing preparation for v2.
    """
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    subdomain = Column(String(50), unique=True, index=True, nullable=True)
    status = Column(String(20), default="active", nullable=False) # 'active', 'suspended', 'trial'
    ocr_quota_monthly = Column(Integer, default=1000, nullable=False)
    
    # Material Control Configurations
    maintenance_stock = Column(Boolean, default=False, nullable=False)
    default_po_channel_wa = Column(Boolean, default=False, nullable=False)
    default_po_channel_email = Column(Boolean, default=False, nullable=False)

    # Relationships
    users = relationship("User", back_populates="tenant", cascade="all, delete-orphan")
    roles = relationship("Role", back_populates="tenant", cascade="all, delete-orphan")
    settings = relationship("AppSetting", back_populates="tenant", cascade="all, delete-orphan")
