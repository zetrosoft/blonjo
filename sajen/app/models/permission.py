from sqlalchemy import Column, Integer, String, Boolean
from app.models.base import Base

class Permission(Base):
    """
    Master Permission definitions created globally by the SaaS Owner.
    Examples: 'create:product', 'manage:users', 'edit:store_settings'.
    """
    __tablename__ = "permissions"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, index=True, nullable=False)
    description = Column(String(255), nullable=False)
    is_system_only = Column(Boolean, default=False, nullable=False) # True if only SaaS Owner should have it
