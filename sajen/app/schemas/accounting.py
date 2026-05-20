from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from app.models.accounting import AccountType, TransactionType

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

    model_config = ConfigDict(from_attributes=True)


# --- Transaction Schemas ---
class TransactionBase(BaseModel):
    transaction_date: date
    reference_no: Optional[str] = None
    description: str
    transaction_type: TransactionType
    total_amount: Decimal = Field(ge=0)

class TransactionCreate(TransactionBase):
    entries: List[JournalEntryCreate]

class TransactionResponse(TransactionBase):
    id: int
    created_by_id: Optional[int]
    created_at: datetime
    entries: List[JournalEntryResponse]

    model_config = ConfigDict(from_attributes=True)
