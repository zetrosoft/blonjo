from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey
from sqlalchemy.orm import relationship
from app.models.base import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    CASHIER = "cashier"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="RESTRICT"), nullable=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, index=True)
    role = Column(Enum(UserRole), default=UserRole.CASHIER, nullable=False)
    is_active = Column(Boolean, default=True)
    is_superuser = Column(Boolean, default=False, nullable=False) # True if System-level SaaS Owner
    
    # Store user preference for language (ID/EN)
    preferred_language = Column(String(2), default="ID")

    # Relationships
    tenant = relationship("Tenant", back_populates="users")
    roles = relationship("Role", secondary="user_roles", back_populates="users")
