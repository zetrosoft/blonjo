from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class AppSettingBase(BaseModel):
    key: str
    value: Optional[str] = None
    description: Optional[str] = None

class AppSettingCreate(AppSettingBase):
    pass

class AppSettingResponse(AppSettingBase):
    id: int
    tenant_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
