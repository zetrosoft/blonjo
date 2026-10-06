import logging
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc, func
from datetime import date, timedelta
from decimal import Decimal
from typing import List, Optional

from app.models.tenant import Tenant
from app.models.inventory import TenantInventory, Product, Contact, PurchasePlan, PurchasePlanItem, StockDiscard, InventoryLog
from app.models.accounting import Account, Transaction, JournalEntry, TransactionType, TransactionStatus
from app.models.cashflow import CashflowProjectionSnapshot
from app.schemas.material_control import (
    PurchasePlanCreate, PurchasePlanResponse, 
    StockDiscardCreate, StockDiscardResponse,
    CashflowProjectionItem, PurchasePlanUpdate
)
from app.schemas.accounting import TransactionCreate, JournalEntryCreate
from app.services.accounting import create_transaction_with_journal

logger = logging.getLogger("sajen.material_control_service")

# ─── AUTO REPLENISHMENT / RECOMMENDATION ENGINE ───────────────────

def get_replenishment_recommendations(db: Session, tenant_id: int) -> List[dict]:
    """
    Generate purchase plan recommendations grouped by supplier.
    - If maintenance_stock is True: based on safety_stock and ROP levels.
    - If maintenance_stock is False: based on purchase history frequency and average qty.
    """
    from app.models.accounting import Transaction, TransactionType
    from app.models.inventory import InventoryLog
    from datetime import date, timedelta
    from sqlalchemy import func, or_

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return []

    # 1. Kumpulkan usulan produk yang butuh di-restock
    proposed_items = []

    if tenant.maintenance_stock:
        # Get all tenant inventories where current stock is below reorder point
        inventories = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id,
            TenantInventory.static_stock < TenantInventory.reorder_point
        ).all()

        for inv in inventories:
            product = inv.product
            proposed_qty = max(Decimal("0.00"), inv.max_stock - inv.static_stock)
            if proposed_qty <= 0:
                proposed_qty = max(Decimal("0.00"), inv.reorder_point - inv.static_stock)
            if proposed_qty <= 0:
                proposed_qty = Decimal("10.00")

            unit_price = inv.last_purchase_price if inv.last_purchase_price > 0 else inv.moving_average_cost

            proposed_items.append({
                "product_id": product.id,
                "product_name": product.name,
                "sku": product.sku,
                "qty": float(proposed_qty),
                "unit": product.base_unit,
                "unit_price": float(unit_price),
                "preferred_supplier_id": inv.preferred_supplier_id
            })
    else:
        # Jika maintenance_stock is False: hitung berdasarkan riwayat pembelian
        inventories = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id
        ).all()

        for inv in inventories:
            product = inv.product
            cutoff_date = date.today() - timedelta(days=180)
            logs = db.query(InventoryLog).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.transaction_type == TransactionType.PURCHASE,
                InventoryLog.product_id == product.id,
                InventoryLog.log_type == "in",
                Transaction.transaction_date >= cutoff_date
            ).all()

            if not logs:
                logs = db.query(InventoryLog).join(Transaction).filter(
                    Transaction.tenant_id == tenant_id,
                    Transaction.transaction_type == TransactionType.PURCHASE,
                    InventoryLog.product_id == product.id,
                    InventoryLog.log_type == "in"
                ).all()

            if logs:
                tx_ids = {log.transaction_id for log in logs if log.transaction_id is not None}
                frequency = len(tx_ids)
                total_qty = sum(log.quantity for log in logs)
                
                if frequency > 0:
                    avg_qty = total_qty / Decimal(str(frequency))
                    unit_price = inv.last_purchase_price if inv.last_purchase_price > 0 else inv.moving_average_cost
                    
                    proposed_items.append({
                        "product_id": product.id,
                        "product_name": product.name,
                        "sku": product.sku,
                        "qty": float(avg_qty),
                        "unit": product.base_unit,
                        "unit_price": float(unit_price),
                        "preferred_supplier_id": inv.preferred_supplier_id
                    })

    # 2. Kelompokkan item-item yang diusulkan berdasarkan preferred_supplier_id
    grouped_recommendations = {}

    for item in proposed_items:
        supp_id = item["preferred_supplier_id"]
        if not supp_id:
            # Fallback: Cari transaksi pembelian terakhir untuk produk ini
            last_in_log = db.query(InventoryLog).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.transaction_type == TransactionType.PURCHASE,
                InventoryLog.product_id == item["product_id"],
                InventoryLog.log_type == "in"
            ).order_by(Transaction.transaction_date.desc()).first()
            
            if last_in_log:
                if getattr(last_in_log, 'contact_id', None):
                    supp_id = last_in_log.contact_id
                elif last_in_log.transaction and getattr(last_in_log.transaction, 'contact', None):
                    supp_id = last_in_log.transaction.contact.id
            
            if not supp_id:
                supp_id = 0

        if supp_id not in grouped_recommendations:
            grouped_recommendations[supp_id] = []
        grouped_recommendations[supp_id].append(item)

    # 3. Bangun data kelompok beserta perhitungan tanggal belanja berikutnya (next_purchase)
    results = []

    def get_next_visit_date(start_date: date, visit_day: str) -> date:
        days_of_week = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]
        if not visit_day or visit_day.lower() not in days_of_week:
            return start_date + timedelta(days=6)
        
        target_idx = days_of_week.index(visit_day.lower())
        current_idx = start_date.weekday() # 0 = Senin, 6 = Minggu
        
        days_ahead = target_idx - current_idx
        if days_ahead <= 0:
            days_ahead += 7
        return start_date + timedelta(days=days_ahead)

    for supp_id, items in grouped_recommendations.items():
        supplier_name = "Tanpa Pemasok"
        last_purchase_date_str = "-"
        next_purchase_date_str = "-"
        sales_visit_day = None
        sales_visit_interval = 7

        if supp_id > 0:
            supplier = db.query(Contact).filter(Contact.id == supp_id).first()
            if supplier:
                supplier_name = supplier.name
                sales_visit_day = supplier.sales_visit_day
                sales_visit_interval = supplier.sales_visit_interval or 7

                # Cari transaksi pembelian terakhir ke supplier ini
                last_tx_log = db.query(InventoryLog).join(Transaction).filter(
                    Transaction.tenant_id == tenant_id,
                    Transaction.transaction_type == TransactionType.PURCHASE,
                    InventoryLog.contact_id == supp_id
                ).order_by(Transaction.transaction_date.desc()).first()

                last_purchase_date = None
                if last_tx_log and last_tx_log.transaction:
                    last_purchase_date = last_tx_log.transaction.transaction_date
                    last_purchase_date_str = last_purchase_date.strftime("%Y-%m-%d")

                # Kalkulasi next_purchase_date
                all_tx_logs = db.query(InventoryLog).join(Transaction).filter(
                    Transaction.tenant_id == tenant_id,
                    Transaction.transaction_type == TransactionType.PURCHASE,
                    InventoryLog.contact_id == supp_id
                ).order_by(Transaction.transaction_date.asc()).all()

                tx_dates = sorted(list({log.transaction.transaction_date for log in all_tx_logs if log.transaction}))
                
                avg_interval = None
                if len(tx_dates) >= 2:
                    gaps = []
                    for i in range(len(tx_dates) - 1):
                        gaps.append((tx_dates[i+1] - tx_dates[i]).days)
                    if gaps:
                        avg_interval = sum(gaps) / len(gaps)

                # Tentukan tanggal belanja berikutnya
                base_ref_date = last_purchase_date or date.today()
                
                if avg_interval is not None and avg_interval > 0:
                    next_purchase_date = base_ref_date + timedelta(days=round(avg_interval))
                elif sales_visit_day:
                    next_purchase_date = get_next_visit_date(base_ref_date, sales_visit_day)
                else:
                    next_purchase_date = base_ref_date + timedelta(days=6)

                if next_purchase_date < date.today():
                    next_purchase_date = date.today()

                next_purchase_date_str = next_purchase_date.strftime("%Y-%m-%d")

        results.append({
            "supplier_id": supp_id,
            "supplier_name": supplier_name,
            "last_purchase_date": last_purchase_date_str,
            "next_purchase_date": next_purchase_date_str,
            "sales_visit_day": sales_visit_day,
            "sales_visit_interval": sales_visit_interval,
            "items": items
        })

    results.sort(key=lambda x: x["next_purchase_date"])
    return results

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
        pid = item.product_id if (item.product_id and item.product_id > 0) else None
        db_item = PurchasePlanItem(
            purchase_plan_id=db_plan.id,
            product_id=pid,
            custom_product_name=item.custom_product_name if pid is None else None,
            supplier_contact_id=item.supplier_contact_id,
            qty=item.qty,
            unit_price=item.unit_price,
            subtotal=subtotal
        )
        db.add(db_item)

    db.commit()
    db.refresh(db_plan)
    return db_plan


def update_purchase_plan(db: Session, tenant_id: int, plan_id: int, plan_in: PurchasePlanUpdate) -> Optional[PurchasePlan]:
    db_plan = db.query(PurchasePlan).filter(
        PurchasePlan.tenant_id == tenant_id,
        PurchasePlan.id == plan_id
    ).first()

    if not db_plan or db_plan.status not in ["DRAFT", "PENDING_APPROVAL", "APPROVED"]:
        return None

    if plan_in.planned_date is not None:
        db_plan.planned_date = plan_in.planned_date
    if plan_in.send_via_wa is not None:
        db_plan.send_via_wa = plan_in.send_via_wa
    if plan_in.send_via_email is not None:
        db_plan.send_via_email = plan_in.send_via_email

    if plan_in.items is not None:
        # Delete old items
        db.query(PurchasePlanItem).filter(PurchasePlanItem.purchase_plan_id == plan_id).delete()
        
        # Add new items
        total_amount = Decimal("0.00")
        for item in plan_in.items:
            subtotal = item.qty * item.unit_price
            total_amount += subtotal
            pid = item.product_id if (item.product_id and item.product_id > 0) else None
            db_item = PurchasePlanItem(
                purchase_plan_id=db_plan.id,
                product_id=pid,
                custom_product_name=item.custom_product_name if pid is None else None,
                supplier_contact_id=item.supplier_contact_id,
                qty=item.qty,
                unit_price=item.unit_price,
                subtotal=subtotal
            )
            db.add(db_item)
            
        db_plan.total_amount = total_amount

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

    # 2. Simulate WA webhook triggers if WA toggle is set
    if db_plan.send_via_wa:
        logger.info(f"Triggering automated WhatsApp PO payload for Plan {db_plan.id} to preferred suppliers.")

    db.commit()
    db.refresh(db_plan)
    return db_plan

def execute_purchase_plan_items(
    db: Session, 
    tenant_id: int, 
    plan_id: int, 
    purchased_item_ids: List[int], 
    complete_plan: bool = False
) -> Optional[PurchasePlan]:
    db_plan = db.query(PurchasePlan).filter(
        PurchasePlan.tenant_id == tenant_id,
        PurchasePlan.id == plan_id
    ).first()
    
    if not db_plan:
        return None

    for item in db_plan.items:
        if item.id in purchased_item_ids:
            item.is_purchased = True
        elif complete_plan:
            item.is_purchased = False

    all_purchased = all(item.is_purchased for item in db_plan.items)
    if complete_plan or all_purchased:
        db_plan.status = "COMPLETED"

    db.commit()
    db.refresh(db_plan)
    return db_plan

def delete_purchase_plan(db: Session, tenant_id: int, plan_id: int) -> bool:
    db_plan = db.query(PurchasePlan).filter(
        PurchasePlan.tenant_id == tenant_id,
        PurchasePlan.id == plan_id
    ).first()
    if not db_plan:
        return False
    db.delete(db_plan)
    db.commit()
    return True


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
    """
    Dual-mode cashflow projection 30 hari ke depan.
    - Mode A (maintenance_stock=True) : Simulasi ROP depletion stok per produk
    - Mode B (maintenance_stock=False): Analisis frekuensi & co-purchase cluster per supplier
    - Mode C (kedua mode)             : Jatuh tempo pembayaran (hard commitment)
    """
    today = date.today()
    ninety_days_ago = today - timedelta(days=90)
    thirty_days_ago = today - timedelta(days=30)

    # ── 0. Tenant mode ─────────────────────────────────────────────
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    use_stock_mode = tenant.maintenance_stock if tenant else False

    # ── 1. Saldo kas awal dari akun kas & bank ───────────────────────
    cash_accounts = db.query(Account).filter(
        Account.code.in_(["1-1101", "1-1102", "1-1000", "1-1100"]),
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
    ).all()

    current_cash = Decimal("0.00")
    for acc in cash_accounts:
        balance_query = db.query(
            func.sum(JournalEntry.debit) - func.sum(JournalEntry.credit)
        ).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            JournalEntry.account_id == acc.id,
            Transaction.status == TransactionStatus.POSTED
        ).scalar()
        if balance_query:
            current_cash += Decimal(str(balance_query))
    # Jika kas negatif, biarkan tetap negatif agar proyeksi mencerminkan kondisi riil buku besar
    current_cash = Decimal(str(round(float(current_cash) / 100) * 100))


    # ── 2. Prediksi inflow: AI temporal weighting + day-of-week multiplier ──
    daily_sales = db.query(
        Transaction.transaction_date,
        func.sum(Transaction.total_amount)
    ).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_type == TransactionType.SALES,
        Transaction.transaction_date >= ninety_days_ago,
        Transaction.status == TransactionStatus.POSTED
    ).group_by(Transaction.transaction_date).all()

    recent_sales, older_sales = [], []
    weekday_sums   = {i: Decimal("0") for i in range(7)}
    weekday_counts = {i: 0 for i in range(7)}

    for t_date, amount in daily_sales:
        if not t_date:
            continue
        amt = Decimal(str(amount))
        wd  = t_date.weekday()
        weekday_sums[wd]   += amt
        weekday_counts[wd] += 1
        (recent_sales if t_date >= thirty_days_ago else older_sales).append(amt)

    r_avg = sum(recent_sales) / Decimal(len(recent_sales)) if recent_sales else Decimal("0")
    o_avg = sum(older_sales)  / Decimal(len(older_sales))  if older_sales  else Decimal("0")

    if r_avg > 0 and o_avg > 0:
        baseline = r_avg * Decimal("0.60") + o_avg * Decimal("0.40")
    elif r_avg > 0:
        baseline = r_avg
    elif o_avg > 0:
        baseline = o_avg
    else:
        baseline = Decimal("500000")

    total_wd = sum(
        weekday_sums[i] / Decimal(weekday_counts[i]) if weekday_counts[i] else baseline
        for i in range(7)
    )
    mean_wd = total_wd / Decimal("7")
    wd_mult = {}
    for i in range(7):
        avg_i = weekday_sums[i] / Decimal(weekday_counts[i]) if weekday_counts[i] else baseline
        wd_mult[i] = (avg_i / mean_wd) if mean_wd > 0 else Decimal("1")

    # ── 3A. Mode A — Simulasi ROP depletion (maintenance_stock=True) ──
    simulated_stocks = {}
    product_meta     = {}
    if use_stock_mode:
        inventories = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id
        ).all()

        # Kecepatan penjualan per produk dari InventoryLog 90 hari terakhir
        product_vel_rows = db.query(
            InventoryLog.product_id,
            func.sum(InventoryLog.quantity)
        ).filter(
            InventoryLog.log_type == "out",
            InventoryLog.transaction_id != None
        ).group_by(InventoryLog.product_id).all()
        velocity_map = {pid: abs(float(qty or 0)) / 90.0 for pid, qty in product_vel_rows}

        for inv in inventories:
            pid = inv.product_id
            rop = float(inv.reorder_point)

            # HANYA masukkan ke simulasi jika ada histori penjualan riil
            if pid not in velocity_map:
                continue

            vel   = velocity_map[pid]
            price = float(
                inv.last_purchase_price if inv.last_purchase_price > 0
                else inv.moving_average_cost
            ) or 5000.0
            max_stk = float(inv.max_stock) if float(inv.max_stock) > rop else rop * 2.0

            simulated_stocks[pid] = max(0.0, float(inv.static_stock))
            product_meta[pid] = {
                "name":          inv.product.name,
                "base_unit":     inv.product.base_unit,
                "reorder_point": rop,
                "max_stock":     max_stk,
                "velocity":      vel,
                "price":         price,
            }


    # ── 3B. Mode B — Frekuensi supplier + multi-supplier co-purchase cluster ──
    # Struktur: {supplier_id: [tanggal_transaksi, ...]}
    supplier_clusters = {}  # {frozenset(supplier_ids): {"dates": [...], "avg_amount": Decimal}}
    supplier_last_date = {}
    supplier_avg_amount = {}
    supplier_name_map = {}
    supplier_avg_amounts = {}

    if not use_stock_mode:
        # Ambil semua transaksi purchase per hari per supplier (contact_id di InventoryLog)
        # Gunakan transaksi purchase dengan total_amount, grouped by date + contact
        purchase_txns = db.query(
            Transaction.transaction_date,
            Transaction.total_amount,
            Transaction.description
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.transaction_type == TransactionType.PURCHASE,
            Transaction.transaction_date >= ninety_days_ago,
            Transaction.status == TransactionStatus.POSTED,
        ).order_by(Transaction.transaction_date).all()

        # Kelompokkan per tanggal: ambil set "supplier" dari deskripsi / contact di inventory log
        # Karena Transaction tidak punya contact_id langsung, gunakan InventoryLog.contact_id
        # sebagai proxy supplier per tanggal
        date_supplier_map: dict[date, set] = {}  # {tanggal: {contact_id, ...}}
        date_amount_map:   dict[date, Decimal] = {}

        inv_log_rows = db.query(
            InventoryLog.transaction_id,
            InventoryLog.contact_id
        ).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.transaction_type == TransactionType.PURCHASE,
            Transaction.transaction_date >= ninety_days_ago,
            Transaction.status == TransactionStatus.POSTED,
            InventoryLog.contact_id != None,
        ).all()

        txn_supplier_map: dict[int, set] = {}
        for txn_id, contact_id in inv_log_rows:
            txn_supplier_map.setdefault(txn_id, set()).add(contact_id)

        txn_date_amount = db.query(
            Transaction.id,
            Transaction.transaction_date,
            Transaction.total_amount,
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.transaction_type == TransactionType.PURCHASE,
            Transaction.transaction_date >= ninety_days_ago,
            Transaction.status == TransactionStatus.POSTED,
        ).all()

        for txn_id, txn_date, txn_amount in txn_date_amount:
            suppliers = txn_supplier_map.get(txn_id, set())
            if not suppliers:
                continue
            if txn_date not in date_supplier_map:
                date_supplier_map[txn_date] = set()
                date_amount_map[txn_date]   = Decimal("0")
            date_supplier_map[txn_date].update(suppliers)
            date_amount_map[txn_date] += Decimal(str(txn_amount))

        # Nama supplier
        all_supplier_ids = set(sid for s in date_supplier_map.values() for sid in s)
        if all_supplier_ids:
            contacts = db.query(Contact).filter(Contact.id.in_(list(all_supplier_ids))).all()
            supplier_name_map = {c.id: c.name for c in contacts}

        # Deteksi klaster multi-supplier (hari yang sama / selang ≤ 1 hari)
        # Kelompokkan tanggal-tanggal yang set supplier-nya overlap ≥ 50%
        sorted_dates = sorted(date_supplier_map.keys())
        cluster_registry: dict[frozenset, list] = {}
        for d in sorted_dates:
            s_set = frozenset(date_supplier_map[d])
            # Cari klaster yang cocok (overlap ≥ 50%)
            matched = None
            for key in cluster_registry:
                overlap = len(key & s_set)
                union   = len(key | s_set)
                if union > 0 and overlap / union >= 0.5:
                    matched = key
                    break
            if matched:
                cluster_registry[matched].append((d, date_amount_map[d]))
            else:
                cluster_registry[s_set] = [(d, date_amount_map[d])]

        # Hitung interval & rata-rata nominal per klaster
        for s_set, entries in cluster_registry.items():
            if len(entries) < 1:
                continue
            dates_only = [e[0] for e in entries]
            amounts    = [e[1] for e in entries]
            avg_amount = sum(amounts) / Decimal(len(amounts))

            intervals = [
                (dates_only[i+1] - dates_only[i]).days
                for i in range(len(dates_only) - 1)
                if (dates_only[i+1] - dates_only[i]).days > 0
            ]
            avg_interval = round(sum(intervals) / len(intervals)) if intervals else 7
            last_date    = max(dates_only)

            supplier_clusters[s_set] = {
                "last_date":    last_date,
                "interval":     avg_interval,
                "avg_amount":   avg_amount,
                "supplier_ids": list(s_set),
            }

        # Hitung rata-rata nominal belanja historis per supplier
        supplier_total_amount = {}
        supplier_tx_count = {}
        for txn_id, txn_date, txn_amount in txn_date_amount:
            suppliers = txn_supplier_map.get(txn_id, set())
            for sid in suppliers:
                supplier_total_amount[sid] = supplier_total_amount.get(sid, Decimal("0")) + Decimal(str(txn_amount))
                supplier_tx_count[sid] = supplier_tx_count.get(sid, 0) + 1

        for sid in all_supplier_ids:
            t_amt = supplier_total_amount.get(sid, Decimal("0"))
            count = supplier_tx_count.get(sid, 1)
            avg_val = t_amt / Decimal(str(count)) if count > 0 else Decimal("0")
            supplier_avg_amounts[sid] = Decimal(str(round(float(avg_val) / 100) * 100))


    # ── 3C. Jatuh tempo pembayaran (Mode A & B) ─────────────────────
    thirty_days_ahead = today + timedelta(days=30)
    due_txns = db.query(
        Transaction.due_date,
        Transaction.total_amount,
        Transaction.description,
        Transaction.reference_no,
    ).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_type == TransactionType.PURCHASE,
        Transaction.due_date != None,
        Transaction.due_date >= today,
        Transaction.due_date <= thirty_days_ahead,
        Transaction.status == TransactionStatus.POSTED,
        or_(Transaction.payment_method != "lunas", Transaction.payment_method.is_(None)),
    ).all()

    due_map: dict[date, list] = {}  # {due_date: [(amount, label), ...]}
    for due_dt, amount, desc_txt, ref_no in due_txns:
        label = f"Jatuh Tempo: {desc_txt or ref_no or 'Pembelian'}"
        due_map.setdefault(due_dt, []).append((Decimal(str(amount)), label))

    # ── 4. Manual draft purchase plans ──────────────────────────────
    plans = db.query(PurchasePlan).filter(
        PurchasePlan.tenant_id == tenant_id,
        PurchasePlan.status.in_(["DRAFT", "APPROVED"])
    ).all()

    # ── 4b. Hitung transaksi cash in (debit) & cash out (kredit) aktual hari ini ──
    cash_account_ids = [acc.id for acc in cash_accounts]
    actual_inflow_today = Decimal("0.00")
    actual_outflow_today = Decimal("0.00")

    if cash_account_ids:
        actual_inflow_today_query = db.query(
            func.sum(JournalEntry.debit)
        ).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            JournalEntry.account_id.in_(cash_account_ids),
            Transaction.status == TransactionStatus.POSTED,
            Transaction.transaction_date == today
        ).scalar()
        if actual_inflow_today_query:
            actual_inflow_today = Decimal(str(actual_inflow_today_query))

        actual_outflow_today_query = db.query(
            func.sum(JournalEntry.credit)
        ).join(Transaction).filter(
            Transaction.tenant_id == tenant_id,
            JournalEntry.account_id.in_(cash_account_ids),
            Transaction.status == TransactionStatus.POSTED,
            Transaction.transaction_date == today
        ).scalar()
        if actual_outflow_today_query:
            actual_outflow_today = Decimal(str(actual_outflow_today_query))

    # Bulatkan aktual ke ratusan
    actual_inflow_today = Decimal(str(round(float(actual_inflow_today) / 100) * 100))
    actual_outflow_today = Decimal(str(round(float(actual_outflow_today) / 100) * 100))

    # Saldo awal hari ini = kas saat ini (detik ini) - inflow hari ini + outflow hari ini
    starting_cash_today = current_cash - actual_inflow_today + actual_outflow_today


    # ── 5. Jalankan Simulasi Murni Teoritis (untuk disimpan ke Snapshot Accuracy DB) ──
    theoretical_projection = []
    running_cash_theory = current_cash
    sim_stocks_theory = simulated_stocks.copy()

    for d in range(30):
        target_date = today + timedelta(days=d)
        day_outflow = Decimal("0")
        day_details = []

        # Draft manual plans
        for p in plans:
            if p.planned_date == target_date:
                day_outflow += Decimal(str(p.total_amount))
                day_details.append(f"Rencana Belanja PP-{p.id:05d}")

        # Mode A (ROP) atau Mode B (Supplier)
        # if use_stock_mode:
        #     for pid, stock in list(sim_stocks_theory.items()):
        #         meta     = product_meta[pid]
        #         new_stk  = stock - meta["velocity"]
        #         if new_stk <= meta["reorder_point"]:
        #             order_qty  = max(1.0, meta["max_stock"] - new_stk)
        #             order_cost = order_qty * meta["price"]
        #             day_outflow += Decimal(str(order_cost))
        #             day_details.append(
        #                 f"Proyeksi Restok {meta['name']} ({order_qty:.0f} {meta['base_unit']})"
        #             )
        #             new_stk = meta["max_stock"]
        #         sim_stocks_theory[pid] = new_stk
        # else:
        #     for s_set, cluster in supplier_clusters.items():
        #         days_since = (target_date - cluster["last_date"]).days
        #         interval   = cluster["interval"]
        #         if days_since > 0 and days_since % interval == 0:
        #             for sid in cluster["supplier_ids"]:
        #                 s_name = supplier_name_map.get(sid, f"Supplier #{sid}")
        #                 s_avg = supplier_avg_amounts.get(sid, Decimal("0"))
        #                 day_outflow += s_avg
        #                 formatted_amt = f"Rp {int(s_avg):,}".replace(",", ".")
        #                 day_details.append(f"Proyeksi Belanja: {s_name} ({formatted_amt})")

        # Jatuh tempo
        for amt, label in due_map.get(target_date, []):
            day_outflow += amt
            day_details.append(label)

        day_outflow_r = Decimal(str(round(float(day_outflow) / 100) * 100))

        # Inflow prediktif AI
        inflow = baseline * wd_mult[target_date.weekday()]
        inflow_r = Decimal(str(round(float(inflow) / 100) * 100))

        ending_cash_theory = Decimal(str(round(float(running_cash_theory + inflow_r - day_outflow_r) / 100) * 100))

        theoretical_projection.append({
            "date":            target_date,
            "inflow_amount":   inflow_r,
            "outflow_amount":  day_outflow_r,
            "outflow_details": ", ".join(day_details) if day_details else "-"
        })
        running_cash_theory = ending_cash_theory

    # ── 6. Simpan snapshot proyeksi murni ke DB (upsert per target_date) ──
    try:
        for item in theoretical_projection:
            existing = db.query(CashflowProjectionSnapshot).filter(
                CashflowProjectionSnapshot.tenant_id       == tenant_id,
                CashflowProjectionSnapshot.projection_date == today,
                CashflowProjectionSnapshot.target_date     == item["date"],
            ).first()

            if existing:
                existing.projected_inflow  = item["inflow_amount"]
                existing.projected_outflow = item["outflow_amount"]
                existing.projected_net     = item["inflow_amount"] - item["outflow_amount"]
                existing.note              = item["outflow_details"][:255] if item["outflow_details"] else None
            else:
                snap = CashflowProjectionSnapshot(
                    tenant_id        = tenant_id,
                    projection_date  = today,
                    target_date      = item["date"],
                    projected_inflow = item["inflow_amount"],
                    projected_outflow= item["outflow_amount"],
                    projected_net    = item["inflow_amount"] - item["outflow_amount"],
                    note             = item["outflow_details"][:255] if item["outflow_details"] else None,
                )
                db.add(snap)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.warning(f"Gagal menyimpan snapshot proyeksi: {e}")

    # ── 7. Jalankan Simulasi Visual (Untuk Frontend: Mulai H-4 s/d H+30) ──
    safety_limit = Decimal("2000000")
    projection = []
    
    # Hitung detail outflow hari ini
    draft_plans_today_amt = Decimal("0")
    day_details_today = []
    for p in plans:
        if p.planned_date == today:
            draft_plans_today_amt += Decimal(str(p.total_amount))
            formatted_amt = f"Rp {int(p.total_amount):,}".replace(",", ".")
            day_details_today.append(f"Rencana Belanja DRAFT PP-{p.id:05d} ({formatted_amt})")

    due_today_amt = Decimal("0")
    for amt, label in due_map.get(today, []):
        due_today_amt += amt
        formatted_amt = f"Rp {int(amt):,}".replace(",", ".")
        day_details_today.append(f"{label} ({formatted_amt})")

    day_outflow_r_today = actual_outflow_today + draft_plans_today_amt + due_today_amt
    if actual_outflow_today > 0:
        formatted_amt = f"Rp {int(actual_outflow_today):,}".replace(",", ".")
        day_details_today.insert(0, f"Aktual Belanja Hari Ini ({formatted_amt})")

    # Ambil jam lokal saat ini di Asia/Jakarta (WIB) untuk penentuan hibrida Hari H
    from datetime import datetime
    import zoneinfo
    try:
        wib_zone = zoneinfo.ZoneInfo("Asia/Jakarta")
        now_wib = datetime.now(wib_zone)
        current_hour = now_wib.hour
    except Exception:
        # Fallback jika zona waktu tidak ditemukan di system
        current_hour = datetime.utcnow().hour + 7

    # Karena tabel harus runut dari H-4, kita cari starting cash di hari H-4.
    # Caranya: Kita mundur dan cari kas aktual untuk setiap hari dari H-4 sampai H-1.
    past_inflows = {}
    past_outflows = {}
    past_projected_inflows = {}
    past_projected_outflows = {}
    past_accuracy_in = {}
    past_accuracy_out = {}
    
    for d in range(-4, 0):
        target_date = today + timedelta(days=d)
        inflow_val = Decimal("0.00")
        outflow_val = Decimal("0.00")
        if cash_account_ids:
            inflow_q = db.query(func.sum(JournalEntry.debit)).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                JournalEntry.account_id.in_(cash_account_ids),
                Transaction.status == TransactionStatus.POSTED,
                Transaction.transaction_date == target_date
            ).scalar()
            if inflow_q:
                inflow_val = Decimal(str(inflow_q))
                
            outflow_q = db.query(func.sum(JournalEntry.credit)).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                JournalEntry.account_id.in_(cash_account_ids),
                Transaction.status == TransactionStatus.POSTED,
                Transaction.transaction_date == target_date
            ).scalar()
            if outflow_q:
                outflow_val = Decimal(str(outflow_q))
                
        past_inflows[target_date] = Decimal(str(round(float(inflow_val) / 100) * 100))
        past_outflows[target_date] = Decimal(str(round(float(outflow_val) / 100) * 100))

        # Coba ambil snapshot proyeksi yang tersimpan untuk target_date ini
        # Ambil versi snapshot tertua atau terbaru sebelum target_date sebagai pembanding proyeksi murni
        snap = db.query(CashflowProjectionSnapshot).filter(
            CashflowProjectionSnapshot.tenant_id == tenant_id,
            CashflowProjectionSnapshot.target_date == target_date
        ).order_by(CashflowProjectionSnapshot.projection_date.asc()).first()

        if snap:
            proj_in = snap.projected_inflow or Decimal("0.00")
            proj_out = snap.projected_outflow or Decimal("0.00")
        else:
            proj_in = Decimal("0.00")
            proj_out = Decimal("0.00")

        past_projected_inflows[target_date] = proj_in
        past_projected_outflows[target_date] = proj_out

        # Hitung Akurasi (%) : 100 - abs(aktual - proyeksi)/proyeksi * 100
        def calc_acc(proj, act):
            if proj == 0:
                return 0.0 if act > 0 else 100.0
            return round(max(0.0, 100.0 - abs(float(act - proj) / float(proj)) * 100), 1)

        # Hanya set akurasi jika proyeksi ada (tidak nol) atau aktual ada
        past_accuracy_in[target_date] = calc_acc(proj_in, inflow_val) if (proj_in > 0 or inflow_val > 0) else None
        past_accuracy_out[target_date] = calc_acc(proj_out, outflow_val) if (proj_out > 0 or outflow_val > 0) else None

    # Dimulai dari starting_cash_today, hitung backward starting cash untuk H-4
    # starting_cash_today = starting_cash_yesterday + inflow_yesterday - outflow_yesterday
    # => starting_cash_yesterday = starting_cash_today - inflow_yesterday + outflow_yesterday
    starting_cash_map = {}
    temp_cash = starting_cash_today
    for d in range(-1, -5, -1):
        target_date = today + timedelta(days=d)
        temp_cash = temp_cash - past_inflows[target_date] + past_outflows[target_date]
        starting_cash_map[target_date] = Decimal(str(round(float(temp_cash) / 100) * 100))

    # Jalankan loop simulasi dari H-4 ke H+30
    running_cash_vis = temp_cash  # Nilai H-4
    
    for d in range(-4, 31):
        target_date = today + timedelta(days=d)
        starting_cash_val = running_cash_vis
        
        if d < 0:
            # Masa Lalu: Tampilkan aktual murni
            inflow_val = past_inflows[target_date]
            outflow_val = past_outflows[target_date]
            outflow_desc = "Aktual Kas Keluar" if outflow_val > 0 else "-"
        elif d == 0:
            # Hari Ini (Hari H): Logika hybrid
            # Proyeksi Inflow Hari ini
            inflow_proj = baseline * wd_mult[target_date.weekday()]
            inflow_proj_r = Decimal(str(round(float(inflow_proj) / 100) * 100))

            # Jika jam sudah >= 18:00 WIB
            if current_hour >= 18:
                # Jika belum ada inputan income hari ini (actual_inflow_today == 0) maka di-0-kan, jika sudah ada tampilkan actual
                inflow_val = actual_inflow_today
                
                # Setelah jam 18:00 WIB, outflow hanya menampilkan pengeluaran aktual yang terjurnal
                outflow_val = actual_outflow_today
                if actual_outflow_today > 0:
                    formatted_amt = f"Rp {int(actual_outflow_today):,}".replace(",", ".")
                    outflow_desc = f"Aktual Belanja Hari Ini ({formatted_amt})"
                else:
                    outflow_desc = "-"
            else:
                # Sebelum jam 18:00 WIB, jika sudah ada inputan tampilkan, jika belum gunakan proyeksi
                inflow_val = actual_inflow_today if actual_inflow_today > 0 else inflow_proj_r
                
                # Sebelum jam 18:00 WIB, gunakan gabungan rencana belanja & tagihan jatuh tempo & aktual belanja hari ini
                outflow_val = day_outflow_r_today
                outflow_desc = ", ".join(day_details_today) if day_details_today else "-"
        else:
            # Masa Depan: Proyeksi murni
            day_outflow = Decimal("0")
            day_details = []

            # Draft manual plans
            for p in plans:
                if p.planned_date == target_date:
                    day_outflow += Decimal(str(p.total_amount))
                    formatted_amt = f"Rp {int(p.total_amount):,}".replace(",", ".")
                    day_details.append(f"Rencana Belanja PP-{p.id:05d} ({formatted_amt})")

            # Jatuh tempo
            for amt, label in due_map.get(target_date, []):
                day_outflow += amt
                formatted_amt = f"Rp {int(amt):,}".replace(",", ".")
                day_details.append(f"{label} ({formatted_amt})")

            outflow_val = Decimal(str(round(float(day_outflow) / 100) * 100))
            outflow_desc = ", ".join(day_details) if day_details else "-"

            # Inflow prediktif AI
            inflow = baseline * wd_mult[target_date.weekday()]
            inflow_val = Decimal(str(round(float(inflow) / 100) * 100))

        # Hitung ending cash dan rollover
        ending_cash_val = Decimal(str(round(float(starting_cash_val + inflow_val - outflow_val) / 100) * 100))
        running_cash_vis = ending_cash_val

        status = "AMAN" if ending_cash_val >= safety_limit else "WARNING"

        acc_in = past_accuracy_in.get(target_date) if d < 0 else None
        acc_out = past_accuracy_out.get(target_date) if d < 0 else None

        # Deteksi Capital Inflow
        is_cap = False
        cap_amount = Decimal("0.00")
        if d <= 0 and cash_account_ids:
            cap_q = db.query(func.sum(JournalEntry.debit)).join(Transaction).join(
                Account, Account.id == JournalEntry.account_id
            ).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.status == TransactionStatus.POSTED,
                Transaction.transaction_date == target_date,
                JournalEntry.account_id.in_(cash_account_ids),
                JournalEntry.debit > 0
            ).filter(
                db.query(JournalEntry).join(Account).filter(
                    JournalEntry.transaction_id == Transaction.id,
                    JournalEntry.credit > 0,
                    Account.code.like("3-%")
                ).exists()
            ).scalar()
            if cap_q:
                is_cap = True
                cap_amount = Decimal(str(cap_q))

        projection.append(CashflowProjectionItem(
            date           = target_date,
            starting_cash  = starting_cash_val,
            outflow_amount = outflow_val,
            outflow_details= outflow_desc,
            inflow_amount  = inflow_val,
            ending_cash    = ending_cash_val,
            status         = status,
            accuracy_inflow_pct = acc_in,
            accuracy_outflow_pct = acc_out,
            is_capital_inflow = is_cap,
            capital_inflow_amount = cap_amount
        ))

    return projection



# ─── ACCURACY TRACKER ─────────────────────────────────────────────────────────

def get_projection_accuracy(db: Session, tenant_id: int, days: int = 30) -> List[dict]:
    """
    Ambil perbandingan proyeksi vs aktual per hari.
    Aktual diisi lazy dari Transaction POSTED di target_date.
    Hanya kembalikan hari yang sudah berlalu (target_date <= today).
    """
    today = date.today()
    since = today - timedelta(days=days)

    snapshots = db.query(CashflowProjectionSnapshot).filter(
        CashflowProjectionSnapshot.tenant_id   == tenant_id,
        CashflowProjectionSnapshot.target_date >= since,
        CashflowProjectionSnapshot.target_date <= today,
    ).order_by(
        CashflowProjectionSnapshot.target_date.asc(),
        CashflowProjectionSnapshot.projection_date.desc()
    ).all()

    # Selalu update data aktual untuk semua snapshot tanggal (termasuk hari ini) agar real-time
    dates_need_actual = [s.target_date for s in snapshots]

    cash_accs = db.query(Account).filter(
        Account.code.in_(["1-1101", "1-1102", "1-1000", "1-1100"]),
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
    ).all()
    cash_acc_ids = [a.id for a in cash_accs]

    if dates_need_actual and cash_acc_ids:
        # Inflow aktual = total DEBIT pada akun kas & bank (semua cash masuk)
        inflow_rows = db.query(
            Transaction.transaction_date,
            func.sum(JournalEntry.debit)
        ).join(JournalEntry).filter(
            Transaction.tenant_id        == tenant_id,
            JournalEntry.account_id.in_(cash_acc_ids),
            Transaction.status           == TransactionStatus.POSTED,
            Transaction.transaction_date.in_(dates_need_actual)
        ).group_by(Transaction.transaction_date).all()
        inflow_map = {r[0]: Decimal(str(r[1] or 0)) for r in inflow_rows}

        # Outflow aktual = total CREDIT pada akun kas & bank (semua cash keluar)
        outflow_rows = db.query(
            Transaction.transaction_date,
            func.sum(JournalEntry.credit)
        ).join(JournalEntry).filter(
            Transaction.tenant_id        == tenant_id,
            JournalEntry.account_id.in_(cash_acc_ids),
            Transaction.status           == TransactionStatus.POSTED,
            Transaction.transaction_date.in_(dates_need_actual)
        ).group_by(Transaction.transaction_date).all()
        outflow_map = {r[0]: Decimal(str(r[1] or 0)) for r in outflow_rows}

        # Update snapshot dengan aktual
        updated = False
        for snap in snapshots:
            if snap.target_date in dates_need_actual:
                ai = inflow_map.get(snap.target_date, Decimal("0"))
                ao = outflow_map.get(snap.target_date, Decimal("0"))
                snap.actual_inflow  = ai
                snap.actual_outflow = ao
                snap.actual_net     = ai - ao
                updated = True
        if updated:
            try:
                db.commit()
            except Exception as e:
                db.rollback()
                logger.warning(f"Gagal update aktual snapshot: {e}")


    # Deduplicate snapshots per target_date
    grouped_snapshots = {}
    for snap in snapshots:
        t_date = snap.target_date
        if t_date not in grouped_snapshots:
            grouped_snapshots[t_date] = snap
        else:
            current_best = grouped_snapshots[t_date]
            if current_best.projection_date == t_date and snap.projection_date < t_date:
                grouped_snapshots[t_date] = snap

    unique_snapshots = sorted(grouped_snapshots.values(), key=lambda s: s.target_date)

    # Bangun response
    result = []
    for snap in unique_snapshots:
        pi = float(snap.projected_inflow  or 0)
        po = float(snap.projected_outflow or 0)
        ai = float(snap.actual_inflow     or 0) if snap.actual_inflow is not None else None
        ao = float(snap.actual_outflow    or 0) if snap.actual_outflow is not None else None

        def accuracy(projected, actual) -> Optional[float]:
            if actual is None or projected == 0:
                return None
            return round(max(0.0, 100.0 - abs((actual - projected) / projected) * 100), 1)

        result.append({
            "target_date":           snap.target_date.isoformat(),
            "projection_date":       snap.projection_date.isoformat(),
            "projected_inflow":      round(pi),
            "projected_outflow":     round(po),
            "projected_net":         round(pi - po),
            "actual_inflow":         round(ai) if ai is not None else None,
            "actual_outflow":        round(ao) if ao is not None else None,
            "actual_net":            round(ai - ao) if ai is not None and ao is not None else None,
            "accuracy_inflow_pct":   accuracy(pi, ai),
            "accuracy_outflow_pct":  accuracy(po, ao),
            "note":                  snap.note,
        })

    return result


# ─── SMART NOTE PURCHASE PLAN PARSER & DEPLETION ESTIMATOR ─────────

def parse_smart_purchase_plan(db: Session, tenant_id: int, text: str) -> dict:
    """
    Parse free-form / voice SmartNote for shopping plan.
    Grounds entities to the tenant's actual purchase history.
    Applies the 10% depletion rule:
      At each purchase cycle (avg interval), stock remaining is assumed to be 10% of last purchase qty.
      Daily burn rate = (0.90 * Q_last) / avg_interval_days
      Estimated stock on plan date = max(0, Q_last - (daily_burn_rate * elapsed_days))
      Recommended restock qty = max(1, Q_last - estimated_stock) [or Q_last if stock <= 10%]
    """
    import re
    from datetime import date, timedelta
    from sqlalchemy import func
    from app.models.inventory import Product, ProductCategory, InventoryLog, TenantInventory, Contact
    from app.models.accounting import Transaction, TransactionType


    today = date.today()
    clean_text = text.lower().strip()

    # 1. Parse Planned Target Date
    planned_date = today + timedelta(days=1) # default besok
    if "lusa" in clean_text:
        planned_date = today + timedelta(days=2)
    elif "hari ini" in clean_text or "sekarang" in clean_text:
        planned_date = today
    elif "besok" in clean_text:
        planned_date = today + timedelta(days=1)
    else:
        # Check weekday
        days_of_week = ["senin", "selasa", "rabu", "kamis", "jumat", "sabtu", "minggu"]
        for idx, day_name in enumerate(days_of_week):
            if f"hari {day_name}" in clean_text or f" {day_name}" in clean_text:
                current_weekday = today.weekday() # 0 = Senin
                diff = idx - current_weekday
                if diff <= 0:
                    diff += 7
                planned_date = today + timedelta(days=diff)
                break
        
        # Check date numbers like "tanggal 15" or "tgl 15" or "2026-10-05"
        iso_match = re.search(r'\b(20\d{2}-\d{2}-\d{2})\b', clean_text)
        if iso_match:
            try:
                planned_date = date.fromisoformat(iso_match.group(1))
            except Exception:
                pass
        else:
            tgl_match = re.search(r'(?:tanggal|tgl)\s*(\d{1,2})', clean_text)
            if tgl_match:
                day_num = int(tgl_match.group(1))
                if 1 <= day_num <= 31:
                    try:
                        target_m = today.month if day_num >= today.day else (today.month % 12 + 1)
                        target_y = today.year if (day_num >= today.day or today.month < 12) else (today.year + 1)
                        planned_date = date(target_y, target_m, day_num)
                    except Exception:
                        pass

    # 2. Extract Supplier Mention (if any, e.g. "toko sumber rejeki", "supplier pak budi")
    detected_supplier = None
    supp_match = re.search(r'(?:toko|supplier|suplier)\s+([a-zA-Z0-9\s]+?)(?=(?:untuk|buat|pembelian|beli|item|barang|,|\.|$))', text, re.IGNORECASE)
    if supp_match:
        supp_name_candidate = supp_match.group(1).strip()
        if len(supp_name_candidate) >= 3:
            detected_supplier = db.query(Contact).filter(
                Contact.tenant_id == tenant_id,
                Contact.contact_type == 'supplier',
                Contact.name.ilike(f"%{supp_name_candidate}%")
            ).first()

    # 3. Clean and Segment Commodities/Items from Text
    item_section = re.sub(
        r'^(?:buat|tolong\s+buatkan|buatkan)?\s*(?:rencana\s+belanja|purchase\s+plan|list\s+belanja|belanjaan|kulakan)?\s*(?:untuk|buat)?\s*(?:besok|lusa|hari\s+\w+|tanggal\s+\d+|tgl\s+\d+)?\s*(?:untuk|buat)?\s*(?:pembelian|beli|kulakan|order|restock|barang|item)?\s*(?:di\s+toko\s+[\w\s]+|dari\s+supplier\s+[\w\s]+)?\s*(?:yaitu|berupa|:|adalah)?',
        '',
        text,
        flags=re.IGNORECASE
    ).strip()

    raw_tokens = re.split(r'[,;\n]+|\s+dan\s+|\s+serta\s+|\s+&\s+', item_section, flags=re.IGNORECASE)
    
    extracted_items = []
    seen_product_ids = set()

    # Category normalization mappings
    category_alias_map = {
        "beras": "BERAS",
        "gula": "GULA",
        "gandum": "GANDUM",
        "terigu": "GANDUM",
        "tepung": "GANDUM",
        "minyak": "MINYAK",
        "telur": "TELUR",
        "telor": "TELUR",
        "mie": "MIE INSTANT",
        "indomie": "MIE INSTANT",
        "rokok": "ROKOK",
        "sabun": "SABUN CUCI",
        "detergen": "SABUN CUCI",
        "kopi": "TEH & KOPI",
        "teh": "TEH & KOPI",
        "snack": "SNACK",
        "bumbu": "BUMBU",
    }

    for raw_tok in raw_tokens:
        tok = raw_tok.strip()
        if not tok or len(tok) < 2:
            continue
        
        clean_tok = re.sub(r'^(?:pembelian|beli|tambah|ambil|order|restock|item)\s+', '', tok, flags=re.IGNORECASE).strip()
        if not clean_tok:
            continue

        explicit_qty = None
        explicit_unit = None
        qty_match = re.search(r'(\d+(?:[.,]\d+)?)\s*([a-zA-Z]+)?', clean_tok)
        cleaned_search_keyword = clean_tok
        if qty_match:
            try:
                explicit_qty = float(qty_match.group(1).replace(',', '.'))
                explicit_unit = qty_match.group(2) if qty_match.group(2) else None
                cleaned_search_keyword = clean_tok.replace(qty_match.group(0), '').strip()
                if not cleaned_search_keyword:
                    cleaned_search_keyword = clean_tok
            except Exception:
                pass

        matched_products_list = []
        kw_lower = cleaned_search_keyword.lower().strip()

        # Check if keyword corresponds to a Category or Commodity Group
        target_category_name = None
        for alias_k, cat_name in category_alias_map.items():
            if alias_k == kw_lower or (len(kw_lower) <= len(alias_k) + 3 and alias_k in kw_lower):
                target_category_name = cat_name
                break

        # A. If it's a Category (e.g. BERAS, GANDUM, GULA, MINYAK)
        if target_category_name and explicit_qty is None:
            # 1. Find the latest purchase transaction containing items in this category
            latest_cat_tx = db.query(Transaction).join(InventoryLog).join(Product).join(Product.category).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.transaction_type == TransactionType.PURCHASE,
                InventoryLog.log_type == 'in',
                func.upper(ProductCategory.name) == target_category_name.upper()
            ).order_by(Transaction.transaction_date.desc()).first()

            if latest_cat_tx:
                # Find all products in this category that were purchased in this latest transaction
                cat_prods = db.query(Product).join(InventoryLog).filter(
                    InventoryLog.transaction_id == latest_cat_tx.id,
                    InventoryLog.log_type == 'in'
                ).all()

                for cp in cat_prods:
                    if cp.category and cp.category.name.upper() == target_category_name.upper():
                        matched_products_list.append(cp)

            if not matched_products_list or len(matched_products_list) < 2:
                # Fallback: get other recently purchased products in this category (up to 3 items)
                recent_prods = db.query(Product).join(InventoryLog).join(Transaction).join(Product.category).filter(
                    Transaction.tenant_id == tenant_id,
                    Transaction.transaction_type == TransactionType.PURCHASE,
                    InventoryLog.log_type == 'in',
                    func.upper(ProductCategory.name) == target_category_name.upper()
                ).order_by(Transaction.transaction_date.desc()).limit(3).all()
                for rp in recent_prods:
                    if rp not in matched_products_list:
                        matched_products_list.append(rp)

        # B. If it's a sub-commodity group like "bawang"
        elif "bawang" in kw_lower and explicit_qty is None:
            # Look for recent purchases of bawang merah / bawang kating
            bawang_prods = db.query(Product).join(InventoryLog).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.transaction_type == TransactionType.PURCHASE,
                InventoryLog.log_type == 'in',
                Product.name.ilike("%bawang%")
            ).order_by(Transaction.transaction_date.desc()).all()
            
            # Deduplicate by product id and keep top 2-3 variants (e.g. Bawang Kating & Bawang Merah Brebes)
            added_ids = set()
            for bp in bawang_prods:
                if bp.id not in added_ids and "goreng" not in bp.name.lower() and "bubuk" not in bp.name.lower():
                    matched_products_list.append(bp)
                    added_ids.add(bp.id)
                if len(matched_products_list) >= 2:
                    break

        # C. Single item / specific product search (or when explicit qty was given)
        if not matched_products_list:
            past_single = db.query(Product).join(InventoryLog).join(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.transaction_type == TransactionType.PURCHASE,
                InventoryLog.log_type == 'in',
                Product.name.ilike(f"%{cleaned_search_keyword}%")
            ).order_by(Transaction.transaction_date.desc()).first()

            if past_single:
                matched_products_list.append(past_single)
            else:
                generic_single = db.query(Product).filter(
                    Product.name.ilike(f"%{cleaned_search_keyword}%")
                ).first()
                if generic_single:
                    matched_products_list.append(generic_single)

        # D. Process all matched products for this token
        if matched_products_list:
            for matched_product in matched_products_list:
                if matched_product.id in seen_product_ids:
                    continue
                seen_product_ids.add(matched_product.id)

                # Query all past purchase logs for this product to compute interval and last stats
                logs = db.query(InventoryLog).join(Transaction).filter(
                    Transaction.tenant_id == tenant_id,
                    Transaction.transaction_type == TransactionType.PURCHASE,
                    InventoryLog.product_id == matched_product.id,
                    InventoryLog.log_type == 'in'
                ).order_by(Transaction.transaction_date.asc()).all()

                last_log = logs[-1] if logs else None
                last_date = last_log.transaction.transaction_date if last_log and last_log.transaction else (today - timedelta(days=7))
                last_qty = float(last_log.quantity) if last_log and last_log.quantity else 10.0
                last_price = float(last_log.price_per_unit) if last_log and last_log.price_per_unit else 0.0

                supplier_id = None
                supplier_name = detected_supplier.name if detected_supplier else None
                if not supplier_name and last_log:
                    if getattr(last_log, 'contact_id', None) and last_log.contact:
                        supplier_id = last_log.contact_id
                        supplier_name = last_log.contact.name
                    elif last_log.transaction and getattr(last_log.transaction, 'contact', None) and last_log.transaction.contact:
                        supplier_id = last_log.transaction.contact.id
                        supplier_name = last_log.transaction.contact.name

                distinct_dates = sorted(list({log.transaction.transaction_date for log in logs if log.transaction and log.transaction.transaction_date}))
                if len(distinct_dates) >= 2:
                    total_span = (distinct_dates[-1] - distinct_dates[0]).days
                    avg_interval = max(1.0, float(total_span) / float(len(distinct_dates) - 1))
                else:
                    avg_interval = 7.0
                    if supplier_id:
                        supp = db.query(Contact).get(supplier_id)
                        if supp and supp.sales_visit_interval and supp.sales_visit_interval > 0:
                            avg_interval = float(supp.sales_visit_interval)

                elapsed_days = max(0, (planned_date - last_date).days)

                # 10% Depletion Rule calculations
                consumed_in_cycle = 0.90 * last_qty
                daily_burn_rate = consumed_in_cycle / avg_interval
                estimated_stock = max(0.0, last_qty - (daily_burn_rate * elapsed_days))

                if explicit_qty is not None and len(matched_products_list) == 1:
                    recommended_qty = explicit_qty
                else:
                    if estimated_stock <= (0.10 * last_qty):
                        recommended_qty = last_qty
                    else:
                        recommended_qty = max(1.0, last_qty - estimated_stock)

                unit_lower = (explicit_unit or matched_product.base_unit or "pcs").lower()
                if unit_lower in ["sak", "box", "dus", "pcs", "pack", "karton", "lusin"]:
                    recommended_qty = float(round(recommended_qty))
                    if recommended_qty < 1:
                        recommended_qty = 1.0
                else:
                    recommended_qty = round(recommended_qty, 2)

                if estimated_stock <= (0.10 * last_qty):
                    status_depletion = "CRITICAL"
                elif estimated_stock <= (0.30 * last_qty):
                    status_depletion = "LOW"
                else:
                    status_depletion = "NORMAL"

                subtotal = recommended_qty * last_price

                extracted_items.append({
                    "product_id": matched_product.id,
                    "custom_product_name": None,
                    "product_name": matched_product.name,
                    "sku": matched_product.sku or "N/A",
                    "unit": explicit_unit or matched_product.base_unit or "pcs",
                    "qty": recommended_qty,
                    "unit_price": last_price,
                    "subtotal": subtotal,
                    "supplier_contact_id": supplier_id,
                    "supplier_name": supplier_name or "-",
                    "last_purchase_date": last_date.isoformat(),
                    "last_purchase_qty": last_qty,
                    "avg_interval_days": round(avg_interval, 1),
                    "elapsed_days": elapsed_days,
                    "daily_burn_rate": round(daily_burn_rate, 2),
                    "estimated_stock": round(estimated_stock, 2),
                    "depletion_status": status_depletion
                })
        else:
            # Custom item fallback
            extracted_items.append({
                "product_id": None,
                "custom_product_name": clean_tok,
                "product_name": clean_tok,
                "sku": "CUSTOM",
                "unit": explicit_unit or "pcs",
                "qty": explicit_qty if explicit_qty is not None else 1.0,
                "unit_price": 0.0,
                "subtotal": 0.0,
                "supplier_contact_id": detected_supplier.id if detected_supplier else None,
                "supplier_name": detected_supplier.name if detected_supplier else "-",
                "last_purchase_date": None,
                "last_purchase_qty": None,
                "avg_interval_days": 7.0,
                "elapsed_days": 0,
                "daily_burn_rate": 0.0,
                "estimated_stock": 0.0,
                "depletion_status": "NEW"
            })


    total_budget = sum(it["subtotal"] for it in extracted_items)

    return {
        "planned_date": planned_date.isoformat(),
        "contact_name": detected_supplier.name if detected_supplier else None,
        "summary_budget": total_budget,
        "items": extracted_items
    }

