from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal

# --- Category Schemas ---
class CategoryBase(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# --- Unit Conversion Schemas ---
class UnitConversionBase(BaseModel):
    unit_name: str
    multiplier: Decimal

class UnitConversionCreate(UnitConversionBase):
    product_id: int

class UnitConversionResponse(UnitConversionBase):
    id: int
    model_config = ConfigDict(from_attributes=True)

# --- Global Product Schemas ---
class ProductBase(BaseModel):
    sku: str
    name: str
    base_unit: str = "pcs"
    category_id: Optional[int] = None

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    sku: Optional[str] = None
    name: Optional[str] = None
    base_unit: Optional[str] = None
    category_id: Optional[int] = None

class ProductResponse(ProductBase):
    id: int
    created_at: datetime
    updated_at: datetime
    unit_conversions: List[UnitConversionResponse] = []
    purchase_price: Decimal = Field(default=Decimal('0.00'))
    sell_price: Decimal = Field(default=Decimal('0.00'))
    current_stock: Decimal = Field(default=Decimal('0.00'))
    has_transactions: bool = False

    model_config = ConfigDict(from_attributes=True)

# --- Tenant Specific Schemas ---
class TenantInventoryBase(BaseModel):
    product_id: int
    last_purchase_price: Decimal = Field(default=Decimal('0.00'))
    moving_average_cost: Decimal = Field(default=Decimal('0.00'))
    static_stock: Decimal = Field(default=Decimal('0.00'))

class TenantProductPriceBase(BaseModel):
    product_id: int
    pricing_method: str = "value" # 'value' or 'margin'
    amount: Decimal = Field(default=Decimal('0.00'))
    auto_adjusted: Optional[bool] = False




class TenantPricingRuleBase(BaseModel):
    product_id: Optional[int] = None
    name: Optional[str] = None
    rule_type: str # 'discount', 'volume', 'bundle', 'formula', 'tiered', 'bundle_multiple', 'general'
    valid_from: date = Field(default_factory=date.today)
    valid_to: Optional[date] = None
    is_active: bool = True
    rule_payload: dict

class TenantPricingRuleCreate(TenantPricingRuleBase):
    pass

class TenantPricingRuleResponse(TenantPricingRuleBase):
    id: int
    tenant_id: int
    model_config = ConfigDict(from_attributes=True)

# --- Contact Schemas ---
class ContactBase(BaseModel):
    name: str
    contact_type: str  # "customer" or "supplier"
    phone: Optional[str] = None
    address: Optional[str] = None
    current_balance: Decimal = Field(default=Decimal('0.00'))

class ContactCreate(ContactBase):
    pass

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    contact_type: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    current_balance: Optional[Decimal] = None

class ContactResponse(ContactBase):
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

class ProductSearchQuery(BaseModel):
    query: str
    limit: Optional[int] = 5

# --- UoM Schemas ---
class UomBase(BaseModel):
    code: str
    name: str
    category: str = "count" # 'weight', 'volume', 'count', 'length'
    description: Optional[str] = None
    status: str = "active" # 'active', 'inactive'

class UomCreate(UomBase):
    pass

class UomUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class UomResponse(UomBase):
    id: int
    
    model_config = ConfigDict(from_attributes=True)
