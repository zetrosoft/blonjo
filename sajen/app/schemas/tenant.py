from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class TenantBase(BaseModel):
    name: str
    subdomain: Optional[str] = None
    status: str = "active"
    ocr_quota_monthly: int = 1000

class TenantCreate(BaseModel):
    name: str
    subdomain: Optional[str] = None
    status: str = "active"
    ocr_quota_monthly: Optional[int] = 1000

class TenantResponse(TenantBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
