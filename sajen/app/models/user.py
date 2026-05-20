from sqlalchemy import Column, Integer, String, Boolean, Enum
from app.models.base import Base
import enum

class UserRole(str, enum.Enum):
    ADMIN = "admin"
    MANAGER = "manager"
    CASHIER = "cashier"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, index=True)
    role = Column(Enum(UserRole), default=UserRole.CASHIER, nullable=False)
    is_active = Column(Boolean, default=True)
    
    # Store user preference for language (ID/EN)
    preferred_language = Column(String(2), default="ID")
