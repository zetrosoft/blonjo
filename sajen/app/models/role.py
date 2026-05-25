from sqlalchemy import Table, Column, Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.models.base import Base

# Association table for Many-to-Many relationship between Roles and Permissions
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
    Column("permission_id", Integer, ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
)

# Association table for Many-to-Many relationship between Users and Roles
user_roles = Table(
    "user_roles",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", Integer, ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
)

class Role(Base):
    """
    Dynamic User Roles defined by the Tenant Admin within their own tenant scope.
    Inherits created_at and updated_at.
    """
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(50), nullable=False, index=True)

    # Relationships
    tenant = relationship("Tenant", back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, lazy="joined")
    users = relationship("User", secondary=user_roles, back_populates="roles")

    # Prevent duplicate role names inside the same tenant
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_role_tenant_name"),
    )
