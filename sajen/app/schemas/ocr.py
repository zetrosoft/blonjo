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
    raw_ocr_text: Optional[str] = None
    extracted_data: Optional[Any] = None
    error_message: Optional[str] = None
    corrected_data: Optional[Any] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AILearningTemplateCreate(BaseModel):
    file_name: Optional[str] = None
    raw_ocr_text: str
    expected_output: str

class AILearningTemplateResponse(AILearningTemplateCreate):
    id: int
    usage_count: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

class AITrainingProcessRequest(BaseModel):
    instructions: str
    raw_text: str

class AITrainingProcessResponse(BaseModel):
    processed_markdown: str
    processor: str

