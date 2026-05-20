from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.models.base import Base
import enum

class OCRStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CORRECTED = "corrected"

class OCRTask(Base):
    __tablename__ = "ocr_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False) # In Docker, a volume mount path
    status = Column(Enum(OCRStatus), default=OCRStatus.PENDING, nullable=False)
    
    # The JSON result extracted by Ollama
    extracted_data = Column(JSON, nullable=True)
    error_message = Column(String, nullable=True)
    
    # If the user corrects the data, it triggers few-shot learning
    corrected_data = Column(JSON, nullable=True)

    user = relationship("User")
