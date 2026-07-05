import logging
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional

from app.models.tenant import Tenant
from app.models.inventory import TenantInventory, Product, Contact, PurchasePlan, PurchasePlanItem, StockDiscard, InventoryLog
from app.models.accounting import Account, Transaction, JournalEntry, TransactionType, TransactionStatus
from app.schemas.material_control import (
    PurchasePlanCreate, PurchasePlanResponse, 
    StockDiscardCreate, StockDiscardResponse,
    CashflowProjectionItem
)
from app.schemas.accounting import TransactionCreate, JournalEntryCreate
from app.services.accounting import create_transaction_with_journal

logger = logging.getLogger("sajen.material_control_service")

# ─── AUTO REPLENISHMENT / RECOMMENDATION ENGINE ───────────────────

def get_replenishment_recommendations(db: Session, tenant_id: int) -> List[dict]:
    """
    Generate purchase plan recommendations based on safety_stock and ROP levels.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return []

    # Get all tenant inventories where current stock is below reorder point
    inventories = db.query(TenantInventory).filter(
        TenantInventory.tenant_id == tenant_id,
        TenantInventory.static_stock < TenantInventory.reorder_point
    ).all()

    recommendations = []
    for inv in inventories:
        product = inv.product
        # Calculate proposed order qty: max_stock - static_stock
        proposed_qty = max(Decimal("0.00"), inv.max_stock - inv.static_stock)
        if proposed_qty <= 0:
            # Fallback if max_stock is not properly configured: order ROP gap
            proposed_qty = max(Decimal("0.00"), inv.reorder_point - inv.static_stock)

        # Skip if nothing is proposed
        if proposed_qty <= 0:
            proposed_qty = Decimal("10.00") # Safe default fallback

        # Determine price (use moving average cost, last purchase price, or default 0.0)
        unit_price = inv.last_purchase_price if inv.last_purchase_price > 0 else inv.moving_average_cost
        
        # Get preferred supplier info
        supplier_name = None
        if inv.preferred_supplier_id:
            supplier = db.query(Contact).filter(Contact.id == inv.preferred_supplier_id).first()
            if supplier:
                supplier_name = supplier.name

        recommendations.append({
            "product_id": product.id,
            "product_name": product.name,
            "sku": product.sku,
            "current_stock": float(inv.static_stock),
            "safety_stock": float(inv.safety_stock),
            "reorder_point": float(inv.reorder_point),
            "max_stock": float(inv.max_stock),
            "proposed_qty": float(proposed_qty),
            "unit_price": float(unit_price),
            "preferred_supplier_id": inv.preferred_supplier_id,
            "preferred_supplier_name": supplier_name,
            "shelf_location": inv.shelf_location
        })

    return recommendations

# ─── PURCHASE PLAN CRUD & WORKFLOWS ───────────────────────────────

def list_purchase_plans(db: Session, tenant_id: int) -> List[PurchasePlan]:
    return db.query(PurchasePlan).filter(PurchasePlan.tenant_id == tenant_id).order_by(desc(PurchasePlan.id)).all()

def create_purchase_plan(db: Session, tenant_id: int, plan_in: PurchasePlanCreate) -> PurchasePlan:
    total_amount = Decimal("0.00")
    
    # Pre-calculate total
    for item in plan_in.items:
        total_amount += item.qty * item.unit_price

    db_plan = PurchasePlan(
        tenant_id=tenant_id,
        status="DRAFT",
        send_via_wa=plan_in.send_via_wa,
        send_via_email=plan_in.send_via_email,
        total_amount=total_amount,
        planned_date=plan_in.planned_date,
        created_at=date.today()
    )
    db.add(db_plan)
    db.flush() # Populate plan ID

    for item in plan_in.items:
        subtotal = item.qty * item.unit_price
        db_item = PurchasePlanItem(
            purchase_plan_id=db_plan.id,
            product_id=item.product_id,
            supplier_contact_id=item.supplier_contact_id,
            qty=item.qty,
            unit_price=item.unit_price,
            subtotal=subtotal
        )
        db.add(db_item)

    db.commit()
    db.refresh(db_plan)
    return db_plan

def approve_purchase_plan(db: Session, tenant_id: int, plan_id: int) -> Optional[PurchasePlan]:
    db_plan = db.query(PurchasePlan).filter(
        PurchasePlan.tenant_id == tenant_id,
        PurchasePlan.id == plan_id
    ).first()
    
    if not db_plan or db_plan.status != "DRAFT":
        return db_plan

    # 1. Update status to APPROVED
    db_plan.status = "APPROVED"

    # 2. Post adjusting General Ledger double-entry Journal for Purchase Plan Accrual (PSAK UMKM)
    # Debit: Persediaan Barang Dagang (1-1301)
    # Kredit: Utang Dagang (2-1101) atau Kas Utama jika tempo nonaktif (1-1101)
    try:
        # Resolve accounts
        inventory_acc = db.query(Account).filter(
            Account.code == "1-1301",
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).first()
        
        ap_acc = db.query(Account).filter(
            Account.code == "2-1101",
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).first()

        if inventory_acc and ap_acc:
            journal_entries = [
                JournalEntryCreate(
                    account_id=inventory_acc.id,
                    debit=db_plan.total_amount,
                    credit=Decimal("0.00")
                ),
                JournalEntryCreate(
                    account_id=ap_acc.id,
                    debit=Decimal("0.00"),
                    credit=db_plan.total_amount
                )
            ]
            
            tx_create = TransactionCreate(
                transaction_date=db_plan.planned_date,
                description=f"Akrual Rencana Belanja / PO PP-{(db_plan.id):05d}",
                transaction_type=TransactionType.PURCHASE,
                total_amount=db_plan.total_amount,
                status=TransactionStatus.POSTED,
                entries=journal_entries
            )
            create_transaction_with_journal(db=db, trans_in=tx_create, user_id=None, tenant_id=tenant_id)
    except Exception as e:
        logger.error(f"Failed to post auto journal for purchase plan approval: {e}")

    # 3. Simulate WA webhook triggers if WA toggle is set
    if db_plan.send_via_wa:
        logger.info(f"Triggering automated WhatsApp PO payload for Plan {db_plan.id} to preferred suppliers.")

    db.commit()
    db.refresh(db_plan)
    return db_plan

# ─── STOCK DISCARD (WASTE / SPOILAGE) WORKFLOW ────────────────────

def record_stock_discard(db: Session, tenant_id: int, discard_in: StockDiscardCreate) -> StockDiscard:
    # 1. Create Stock Discard
    db_discard = StockDiscard(
        tenant_id=tenant_id,
        product_id=discard_in.product_id,
        qty=discard_in.qty,
        reason=discard_in.reason.upper(),
        created_at=date.today()
    )
    db.add(db_discard)
    db.flush()

    # 2. Deduct physical stock logs (InventoryLog) and TenantInventory static_stock
    inv = db.query(TenantInventory).filter(
        TenantInventory.tenant_id == tenant_id,
        TenantInventory.product_id == discard_in.product_id
    ).first()
    
    unit_price = Decimal("0.00")
    if inv:
        inv.static_stock = max(Decimal("0.00"), inv.static_stock - discard_in.qty)
        unit_price = inv.moving_average_cost if inv.moving_average_cost > 0 else inv.last_purchase_price

    total_value = discard_in.qty * unit_price

    log = InventoryLog(
        product_id=discard_in.product_id,
        quantity=-discard_in.qty,
        price_per_unit=unit_price,
        log_type="waste"
    )
    db.add(log)

    # 3. Post General Journal adjustments
    # Debit: Beban Kerusakan/Penyusutan Persediaan (5-9000/6-9000/Beban Ops Lainnya)
    # Kredit: Persediaan Barang Dagangan (1-1301)
    try:
        waste_expense_acc = db.query(Account).filter(
            Account.code.in_(["5-9000", "6-9000", "5-2000"]),
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).order_by(Account.code).first()

        inventory_acc = db.query(Account).filter(
            Account.code == "1-1301",
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).first()

        if waste_expense_acc and inventory_acc and total_value > 0:
            journal_entries = [
                JournalEntryCreate(
                    account_id=waste_expense_acc.id,
                    debit=total_value,
                    credit=Decimal("0.00")
                ),
                JournalEntryCreate(
                    account_id=inventory_acc.id,
                    debit=Decimal("0.00"),
                    credit=total_value
                )
            ]
            
            tx_create = TransactionCreate(
                transaction_date=date.today(),
                description=f"Penyesuaian Kerusakan/Waste Persediaan SKU {inv.product.sku if inv else ''}",
                transaction_type=TransactionType.OPERATIONAL,
                total_amount=total_value,
                status=TransactionStatus.POSTED,
                entries=journal_entries
            )
            create_transaction_with_journal(db=db, trans_in=tx_create, user_id=None, tenant_id=tenant_id)
    except Exception as e:
        logger.error(f"Failed to post waste adjustment journal: {e}")

    db.commit()
    db.refresh(db_discard)
    return db_discard

# ─── CASHFLOW PROJECTION 30 DAYS ─────────────────────────────────

def generate_cashflow_projection(db: Session, tenant_id: int) -> List[CashflowProjectionItem]:
    # 1. Fetch Liquid Starting Cash (Cash Account 1-1101 and Bank Account 1-1102)
    cash_accounts = db.query(Account).filter(
        Account.code.in_(["1-1101", "1-1102", "1-1000", "1-1100"]),
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
    ).all()
    
    current_cash = Decimal("0.00")
    for acc in cash_accounts:
        # Ambil saldo berjalan dari log jurnal jika ada
        # Sederhanakan: hitung sum debit - sum credit
        balance_query = db.query(
            func.sum(JournalEntry.debit) - func.sum(JournalEntry.credit)
        ).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            JournalEntry.account_id == acc.id,
            Transaction.status == TransactionStatus.POSTED
        ).scalar()
        if balance_query:
            current_cash += Decimal(str(balance_query))

    # Fallback default cash if store is empty
    if current_cash <= 0:
        current_cash = Decimal("15000000.00")

    # 2. Calculate average daily sales (moving average past 90 days)
    ninety_days_ago = date.today() - timedelta(days=90)
    sales_total = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_type == TransactionType.SALES,
        Transaction.transaction_date >= ninety_days_ago,
        Transaction.status == TransactionStatus.POSTED
    ).scalar() or Decimal("0.00")
    
    avg_daily_sales = sales_total / Decimal("90.00")
    if avg_daily_sales <= 0:
        avg_daily_sales = Decimal("500000.00") # Safe default omzet harian 500rb

    # 3. Compile plan outputs & due dates
    plans = db.query(PurchasePlan).filter(
        PurchasePlan.tenant_id == tenant_id,
        PurchasePlan.status == "DRAFT"
    ).all()

    # compile projection day by day
    projection = []
    running_cash = current_cash
    safety_cash_limit = Decimal("2000000.00") # Batas aman kas

    today = date.today()
    for d in range(30):
        target_date = today + timedelta(days=d)
        
        # Calculate Scheduled Outflow (Plans planned on this day)
        day_outflow = Decimal("0.00")
        day_outflow_details = []
        
        day_plans = [p for p in plans if p.planned_date == target_date]
        for p in day_plans:
            day_outflow += p.total_amount
            day_outflow_details.append(f"Rencana Belanja PP-{(p.id):05d}")

        # Add daily projection item
        inflow = avg_daily_sales
        # weekend factor (Sabtu & Minggu ramai)
        if target_date.weekday() in [5, 6]:
            inflow *= Decimal("1.40")

        ending_cash = running_cash + inflow - day_outflow
        status = "AMAN" if ending_cash >= safety_cash_limit else "WARNING"

        projection.append(
            CashflowProjectionItem(
                date=target_date,
                starting_cash=running_cash,
                outflow_amount=day_outflow,
                outflow_details=", ".join(day_outflow_details) if day_outflow_details else "-",
                inflow_amount=inflow.quantize(Decimal("0.00")),
                ending_cash=ending_cash.quantize(Decimal("0.00")),
                status=status
            )
        )
        running_cash = ending_cash

    return projection
