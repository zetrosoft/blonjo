from sqlalchemy import Column, Integer, String, Enum, ForeignKey, JSON, Text, Numeric
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
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
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(Enum(OCRStatus), default=OCRStatus.PENDING, nullable=False)
    raw_ocr_text = Column(Text, nullable=True) # Hasil mentah dari Tesseract
    extracted_data = Column(JSON, nullable=True)
    error_message = Column(String, nullable=True)
    corrected_data = Column(JSON, nullable=True)
    image_hash = Column(String, nullable=True, index=True)

    tenant = relationship("Tenant")
    user = relationship("User")
    feedback_items = relationship("OCRFeedback", back_populates="ocr_task", cascade="all, delete-orphan")


class OCRFeedback(Base):
    """
    Training data for few-shot prompting based on manual user corrections.
    Setiap koreksi pengguna = satu record pembelajaran untuk Ollama.
    """
    __tablename__ = "ocr_feedback"

    id = Column(Integer, primary_key=True, index=True)
    ocr_task_id = Column(Integer, ForeignKey("ocr_tasks.id"), nullable=False, index=True)
    field_name = Column(String(100), nullable=False)   # e.g. "total_amount", "transaction_date"
    original_value = Column(Text, nullable=True)        # What Ollama extracted
    corrected_value = Column(Text, nullable=True)       # What user corrected it to

    ocr_task = relationship("OCRTask", back_populates="feedback_items")


class CommodityTrend(Base):

    """
    Cached price data from web search & historical internal analysis.
    Digunakan untuk prediksi tren harga komoditas.
    """
    __tablename__ = "commodity_trends"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True, index=True)
    commodity_name = Column(String(100), nullable=False)
    source = Column(String(20), nullable=False, default="internal")  # "internal" or "web"
    price = Column(Numeric(15, 2), nullable=False)
    unit = Column(String(20), nullable=True)


class OCRAliasMapping(Base):
    """
    Entity-Level Semantic Correction Memory.
    Menyimpan pasangan kata mentah OCR vs kata hasil validasi pengguna (merchant, product_name, uom).
    Digunakan untuk auto-normalisasi instan (<5ms) pada pemrosesan OCR masa depan.
    """
    __tablename__ = "ocr_alias_mappings"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    entity_type = Column(String(50), nullable=False, index=True)  # 'merchant', 'product_name', 'uom'
    raw_pattern = Column(String(255), nullable=False, index=True)
    corrected_value = Column(String(255), nullable=False)
    confidence_count = Column(Integer, default=1, nullable=False)

