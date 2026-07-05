from pydantic import BaseModel, Field
from datetime import date
from typing import List, Optional
from decimal import Decimal

# ─── PURCHASE PLAN SCHEMAS ─────────────────────────────────────────

class PurchasePlanItemCreate(BaseModel):
    product_id: int
    supplier_contact_id: Optional[int] = None
    qty: Decimal = Field(..., max_digits=15, decimal_places=2)
    unit_price: Decimal = Field(..., max_digits=15, decimal_places=2)

class PurchasePlanItemResponse(BaseModel):
    id: int
    purchase_plan_id: int
    product_id: int
    product_name: str
    sku: str
    supplier_contact_id: Optional[int]
    supplier_name: Optional[str]
    qty: Decimal
    unit_price: Decimal
    subtotal: Decimal

    class Config:
        from_attributes = True

class PurchasePlanCreate(BaseModel):
    planned_date: date = Field(default_factory=date.today)
    send_via_wa: bool = False
    send_via_email: bool = False
    items: List[PurchasePlanItemCreate]

class PurchasePlanResponse(BaseModel):
    id: int
    tenant_id: int
    status: str
    send_via_wa: bool
    send_via_email: bool
    total_amount: Decimal
    planned_date: date
    created_at: date
    items: List[PurchasePlanItemResponse]

    class Config:
        from_attributes = True

# ─── STOCK DISCARD SCHEMAS ──────────────────────────────────────────

class StockDiscardCreate(BaseModel):
    product_id: int
    qty: Decimal = Field(..., max_digits=15, decimal_places=2)
    reason: str = Field(..., description="EXPIRED, DAMAGED, or SPOILED")

class StockDiscardResponse(BaseModel):
    id: int
    tenant_id: int
    product_id: int
    product_name: str
    sku: str
    qty: Decimal
    reason: str
    created_at: date

    class Config:
        from_attributes = True

# ─── CASHFLOW PROJECTION SCHEMAS ────────────────────────────────────

class CashflowProjectionItem(BaseModel):
    date: date
    starting_cash: Decimal
    outflow_amount: Decimal
    outflow_details: str  # Deskripsi gabungan rencana belanja / hutang jatuh tempo
    inflow_amount: Decimal
    ending_cash: Decimal
    status: str  # 'AMAN' atau 'WARNING'
