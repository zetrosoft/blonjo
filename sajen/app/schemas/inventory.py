from pydantic import BaseModel, ConfigDict, Field
from typing import Optional
from datetime import datetime
from decimal import Decimal

# --- Contact Schemas ---
class ContactBase(BaseModel):
    name: str
    contact_type: str  # "customer" or "supplier"
    phone: Optional[str] = None
    current_balance: Decimal = Field(default=Decimal('0.00'))

class ContactCreate(ContactBase):
    pass

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    contact_type: Optional[str] = None
    phone: Optional[str] = None
    current_balance: Optional[Decimal] = None

class ContactResponse(ContactBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Product Schemas ---
class ProductBase(BaseModel):
    sku: str
    name: str
    unit: str = "pcs"
    current_stock: Decimal = Field(default=Decimal('0.00'))
    min_stock_level: Decimal = Field(default=Decimal('0.00'))

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    unit: Optional[str] = None
    current_stock: Optional[Decimal] = None
    min_stock_level: Optional[Decimal] = None

class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Inventory Log Schemas ---
class InventoryLogBase(BaseModel):
    product_id: int
    transaction_id: Optional[int] = None
    quantity: Decimal
    price_per_unit: Decimal
    log_type: str  # "in" or "out"

class InventoryLogCreate(InventoryLogBase):
    pass

class InventoryLogResponse(InventoryLogBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# --- Semantic Search Schemas ---
class ProductSearchQuery(BaseModel):
    query: str
    limit: Optional[int] = 5
