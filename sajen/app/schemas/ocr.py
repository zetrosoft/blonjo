from pydantic import BaseModel, ConfigDict
from typing import Optional, Any
from datetime import datetime
from app.models.ocr import OCRStatus

class OCRTaskResponse(BaseModel):
    id: int
    file_name: str
    status: OCRStatus
    extracted_data: Optional[Any] = None
    error_message: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
