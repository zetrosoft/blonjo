from pydantic import BaseModel, ConfigDict
from typing import Optional, Any, List
from datetime import datetime
from app.models.ocr import OCRStatus

class OCRCorrectionRequest(BaseModel):
    transaction_date: str
    reference_no: Optional[str] = None
    description: str
    total_amount: float
    transaction_type: str
    items: Optional[List[Any]] = None

class OCRTaskResponse(BaseModel):
    id: int
    file_name: str
    status: OCRStatus
    extracted_data: Optional[Any] = None
    error_message: Optional[str] = None
    corrected_data: Optional[Any] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

