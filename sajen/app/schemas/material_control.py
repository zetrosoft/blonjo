from pydantic import BaseModel, Field
from datetime import date
from typing import List, Optional
from decimal import Decimal

# ─── PURCHASE PLAN SCHEMAS ─────────────────────────────────────────

class PurchasePlanItemCreate(BaseModel):
    product_id: Optional[int] = None
    custom_product_name: Optional[str] = None
    supplier_contact_id: Optional[int] = None
    qty: Decimal = Field(..., max_digits=15, decimal_places=2)
    unit_price: Decimal = Field(..., max_digits=15, decimal_places=2)
    is_purchased: Optional[bool] = False

class PurchasePlanItemResponse(BaseModel):
    id: int
    purchase_plan_id: int
    product_id: Optional[int] = None
    custom_product_name: Optional[str] = None
    product_name: Optional[str] = None
    sku: Optional[str] = None
    supplier_contact_id: Optional[int]
    supplier_name: Optional[str]
    qty: Decimal
    unit_price: Decimal
    subtotal: Decimal
    is_purchased: bool

    class Config:
        from_attributes = True

class PurchasePlanExecuteRequest(BaseModel):
    purchased_item_ids: List[int]
    complete_plan: bool = False


class PurchasePlanCreate(BaseModel):
    planned_date: date = Field(default_factory=date.today)
    send_via_wa: bool = False
    send_via_email: bool = False
    items: List[PurchasePlanItemCreate]

class PurchasePlanUpdate(BaseModel):
    planned_date: Optional[date] = None
    send_via_wa: Optional[bool] = None
    send_via_email: Optional[bool] = None
    items: Optional[List[PurchasePlanItemCreate]] = None

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
    accuracy_inflow_pct: Optional[float] = None
    accuracy_outflow_pct: Optional[float] = None
    is_capital_inflow: bool = False
    capital_inflow_amount: Decimal = Decimal("0.00")
