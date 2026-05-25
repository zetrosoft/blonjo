from pydantic import BaseModel, ConfigDict
from typing import List, Optional
from datetime import datetime

class PermissionBase(BaseModel):
    name: str
    description: Optional[str] = None

class PermissionResponse(PermissionBase):
    id: int
    is_system_only: bool

    model_config = ConfigDict(from_attributes=True)

class RoleBase(BaseModel):
    name: str

class RoleCreate(BaseModel):
    name: str
    permissions: List[str]  # List of permission names to assign

class RoleResponse(RoleBase):
    id: int
    tenant_id: int
    permissions: List[PermissionResponse]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
