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
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

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
    payment_method: Optional[str] = None
    due_date: Optional[date] = None

class ParsedItem(BaseModel):
    name: str
    ocr_name: Optional[str] = None
    qty: Decimal = Field(default=Decimal('1.00'))
    unit: str = "pcs"
    unit_price: Decimal = Field(default=Decimal('0.00'))
    discount: Decimal = Field(default=Decimal('0.00'))
    discount_value: Optional[Decimal] = None
    is_percent: Optional[bool] = None
    is_manual_correction: Optional[bool] = None
    total: Decimal = Field(default=Decimal('0.00'))
    contact_name: Optional[str] = None
    contact_address: Optional[str] = None

class TransactionCreate(TransactionBase):
    entries: List[JournalEntryCreate]
    items: Optional[List[ParsedItem]] = None
    status: TransactionStatus = TransactionStatus.DRAFT # Default to draft
    allow_duplicate: Optional[bool] = False

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
    contact: Optional[ContactResponseMin] = None

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
    total_revenue_ytd: Optional[Decimal] = Decimal("0.00")
    total_expense_ytd: Optional[Decimal] = Decimal("0.00")
    total_revenue_last_month: Optional[Decimal] = Decimal("0.00")
    total_expense_last_month: Optional[Decimal] = Decimal("0.00")
    net_profit: Decimal
    cash_balance: Decimal
    total_cash: Optional[Decimal] = Decimal("0.00")
    total_bank: Optional[Decimal] = Decimal("0.00")
    recent_transactions: List[TransactionResponse]
    chart_data: List[dict]
    upcoming_debts: List[TransactionResponse]
    total_inventory_value: Decimal
    total_inventory_value_ytd: Optional[Decimal] = Decimal("0.00")
    low_stock_count: int
    top_products: List[dict]
    supplier_purchases: List[dict]
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

class TransactionPayoffRequest(BaseModel):
    payment_account_id: int
    payment_date: date

class TransactionRescheduleRequest(BaseModel):
    due_date: date

class CompassSummaryResponse(BaseModel):
    cash_balance: float
    net_profit: float
    profit_margin: float
    total_inventory_value: float
    low_stock_count: int
    revenue_trend: float # persentase pertumbuhan dibanding tren sebelumnya
    market_info_placeholder: str
    maintenance_stock: bool

class CopywritingTemplates(BaseModel):
    social_media: str
    whatsapp_broadcast: str
    visual_idea: str

class MarketIntelligenceItem(BaseModel):
    product_id: int
    product_name: str
    current_price: float
    recommended_price: float
    confidence_score: float
    reason: str
    copywriting: CopywritingTemplates


# --- General Ledger (Buku Besar) Schemas ---
class GeneralLedgerMutation(BaseModel):
    transaction_id: int
    transaction_date: date
    reference_no: Optional[str] = None
    description: str
    debit: Decimal
    credit: Decimal
    running_balance: Decimal

class GeneralLedgerResponse(BaseModel):
    account_id: int
    account_code: str
    account_name: str
    opening_balance: Decimal
    closing_balance: Decimal
    mutations: List[GeneralLedgerMutation]
