from pydantic import BaseModel, EmailStr
from typing import Optional
from app.models.user import UserRole
from datetime import datetime

class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole = UserRole.CASHIER
    preferred_language: str = "ID"

class UserCreate(UserBase):
    password: str

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    preferred_language: Optional[str] = "ID"
    password: Optional[str] = None

class UserResponse(UserBase):
    id: int
    is_active: bool
    is_superuser: bool = False
    created_at: datetime

    class Config:
        from_attributes = True
