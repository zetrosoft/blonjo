from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from app.models.accounting import AccountType, TransactionType, TransactionStatus

# --- Account Schemas ---
class AccountBase(BaseModel):
    code: str
    name: str
    account_type: AccountType
    is_active: bool = True
    parent_id: Optional[int] = None

class AccountCreate(AccountBase):
    pass

class AccountResponse(AccountBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Journal Entry Schemas ---
class JournalEntryBase(BaseModel):
    account_id: int
    debit: Decimal = Field(default=Decimal('0.00'), ge=0)
    credit: Decimal = Field(default=Decimal('0.00'), ge=0)

class JournalEntryCreate(JournalEntryBase):
    pass

class JournalEntryResponse(JournalEntryBase):
    id: int
    transaction_id: int
    account: Optional[AccountResponse] = None

    model_config = ConfigDict(from_attributes=True)


# --- Transaction Schemas ---
class TransactionBase(BaseModel):
    transaction_date: date
    reference_no: Optional[str] = None
    description: str
    transaction_type: TransactionType
    total_amount: Decimal = Field(ge=0)

class ParsedItem(BaseModel):
    name: str
    qty: Decimal = Field(default=Decimal('1.00'))
    unit: str = "pcs"
    unit_price: Decimal = Field(default=Decimal('0.00'))
    total: Decimal = Field(default=Decimal('0.00'))
    contact_name: Optional[str] = None
    contact_address: Optional[str] = None

class TransactionCreate(TransactionBase):
    entries: List[JournalEntryCreate]
    items: Optional[List[ParsedItem]] = None
    status: TransactionStatus = TransactionStatus.DRAFT # Default to draft

class ProductResponseMin(BaseModel):
    id: int
    name: str
    unit: str = Field(validation_alias="base_unit")

    model_config = ConfigDict(from_attributes=True)

class ContactResponseMin(BaseModel):
    id: int
    name: str
    contact_type: str

    model_config = ConfigDict(from_attributes=True)

class InventoryLogResponse(BaseModel):
    id: int
    product_id: int
    quantity: Decimal
    price_per_unit: Decimal
    log_type: str
    product: Optional[ProductResponseMin] = None
    contact: Optional[ContactResponseMin] = None

    model_config = ConfigDict(from_attributes=True)

class TransactionResponse(TransactionBase):
    id: int
    status: TransactionStatus
    created_by_id: Optional[int]
    created_at: datetime
    entries: List[JournalEntryResponse]
    inventory_logs: List[InventoryLogResponse] = []

    model_config = ConfigDict(from_attributes=True)

class TransactionUpdate(BaseModel):
    description: Optional[str] = None
    status: Optional[TransactionStatus] = None
    items: Optional[List[ParsedItem]] = None
    transaction_date: Optional[date] = None
    total_amount: Optional[Decimal] = None
    # For now, let's allow editing items which will trigger stock adjustment

class DashboardSummaryResponse(BaseModel):
    total_revenue: Decimal
    total_expense: Decimal
    net_profit: Decimal
    cash_balance: Decimal
    recent_transactions: List[TransactionResponse]
    chart_data: List[dict]
    model_config = ConfigDict(from_attributes=True)

class ParseNoteRequest(BaseModel):
    text: str

class ParseNoteResponse(BaseModel):
    parsed_data: dict
    suggested_entries: Optional[List[dict]] = []
    processor: str
    token_in: int
    token_out: int
    prompt: Optional[str] = None

class AIParsingLogResponse(BaseModel):
    id: int
    original_text: str
    prompt: Optional[str]
    parsed_result: str
    token_in: int
    token_out: int
    processor: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

# --- Journal Mapping Schemas ---
class JournalMappingLineBase(BaseModel):
    account_id: int
    side: str # 'debit' or 'credit'
    value_type: str = "total_amount"

class JournalMappingLineCreate(JournalMappingLineBase):
    pass

class JournalMappingLineResponse(JournalMappingLineBase):
    id: int
    mapping_id: int
    account: Optional[AccountResponse] = None

    model_config = ConfigDict(from_attributes=True)

class JournalMappingBase(BaseModel):
    transaction_type: TransactionType
    description: str
    is_active: bool = True

class JournalMappingCreate(JournalMappingBase):
    lines: List[JournalMappingLineCreate]

class JournalMappingResponse(JournalMappingBase):
    id: int
    tenant_id: Optional[int]
    lines: List[JournalMappingLineResponse]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class AIModelQuotaResponse(BaseModel):
    model_name: str
    request_count: int
    limit: int
    token_count: int
    usage_date: date
    model_config = ConfigDict(from_attributes=True)
