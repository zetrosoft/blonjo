from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from fastapi import HTTPException, status
from app.models.accounting import Account, Transaction, JournalEntry, TransactionType, TransactionStatus
from app.schemas.accounting import TransactionCreate
from datetime import datetime, date
from decimal import Decimal
from app.models.accounting import JournalMapping, JournalMappingLine
from app.core import context

def check_tax_exempt_via_vector(items: list) -> bool:
    """
    Check if the transaction items are tax-exempt (bebas pajak PPN).
    Uses a hybrid approach: keyword matching first for high accuracy on common Indonesian terms,
    then falls back to vector similarity (Ollama nomic-embed-text) if ambiguous.
    """
    if not items:
        # Jika tanpa detail items anggap bebas pajak PPN
        return True
        
    item_text = " ".join([i.get("name", "") for i in items]).lower()
    if not item_text.strip():
        return True

    # 1. Keyword Matching (Highly accurate for known local items)
    exempt_keywords = ["beras", "gula", "minyak", "sembako", "sayur", "telur", "daging", "garam", "buah", "susu"]
    taxable_keywords = ["elektronik", "hp", "handphone", "komputer", "laptop", "jasa", "service", "pakaian", "baju", "sepatu", "mewah", "tv", "kulkas", "motor", "mobil"]
    
    if any(kw in item_text for kw in exempt_keywords):
        return True
    if any(kw in item_text for kw in taxable_keywords):
        return False

    # 2. Vector Similarity Fallback (for unknown items)
    try:
        from app.services.ai_engine import get_embedding
        import numpy as np
        
        item_vec = get_embedding(item_text)
        if not item_vec:
            return True # Fallback ke bebas pajak jika AI offline
            
        sembako_vec = get_embedding("basic food necessities rice sugar cooking oil meat vegetables tax exempt")
        pajak_vec = get_embedding("electronic devices luxury goods clothing services taxable items")
        
        if not sembako_vec or not pajak_vec:
            return True
            
        def cosine_sim(a, b):
            a_norm = np.linalg.norm(a)
            b_norm = np.linalg.norm(b)
            if a_norm == 0 or b_norm == 0: return 0.0
            return np.dot(a, b) / (a_norm * b_norm)
            
        sim_sembako = cosine_sim(item_vec, sembako_vec)
        sim_pajak = cosine_sim(item_vec, pajak_vec)
        
        return sim_sembako >= sim_pajak
    except Exception as e:
        print(f"Error checking tax exemption: {e}")
        return True # Safe fallback

def get_auto_journal_entries(db: Session, tenant_id: int | None, trans_type: TransactionType, amount: Decimal, is_tax_exempt: bool = True, payment_method: str | None = None) -> list[dict]:
    """
    Generate dynamic journal entries based on JournalMapping master data.
    Supports multi-pair (compound) entries and specialized logic for CASH_COUNT.
    """
    from app.models.accounting import JournalEntry, Account

    # 1. Standard Handling: Try to get from Master Data first (Multi-pair)
    t_id = tenant_id or context.get_tenant_context()

    mapping = db.query(JournalMapping).filter(
        JournalMapping.tenant_id == t_id,
        JournalMapping.transaction_type == trans_type,
        JournalMapping.is_active == True
    ).first()
    
    # Fallback to Global Mapping if Tenant hasn't customized it
    if not mapping:
        mapping = db.query(JournalMapping).filter(
            JournalMapping.tenant_id == None,
            JournalMapping.transaction_type == trans_type,
            JournalMapping.is_active == True
        ).first()
        
    if mapping and mapping.lines:
        entries = []
        for line in mapping.lines:
            # Fetch full account details for UI enrichment (Bab 10.1 ARCHITECTURE.md)
            account = db.query(Account).filter(Account.id == line.account_id).first()
            
            # Handle different value types from mapping
            if line.value_type == "total_amount":
                val = amount
            elif line.value_type == "cogs_amount":
                # Get HPP Rate from settings (default 70% if no real cost known)
                from app.models.setting import AppSetting
                rate_setting = db.query(AppSetting).filter(AppSetting.tenant_id == t_id, AppSetting.key == "default_cogs_rate").first()
                cogs_rate = Decimal(rate_setting.value) / 100 if rate_setting else Decimal('0.70')
                val = (amount * cogs_rate).quantize(Decimal('0.00'))
            elif line.value_type == "tax_amount":
                if is_tax_exempt:
                    val = Decimal('0.00')
                else:
                    # Asumsi PPN 11% sudah termasuk dalam harga (include tax)
                    # Pajak = Total * (11/111)
                    val = (amount * Decimal('11') / Decimal('111')).quantize(Decimal('0.00'))
            else:
                val = Decimal('0.00')
                
            # Intercept Cash/Bank if payment_method is hutang/tempo
            target_account_id = line.account_id
            target_account = account
            
            if payment_method and payment_method.lower() in ["hutang", "tempo", "kredit"]:
                if account and (account.code.startswith("1-11") or account.code.startswith("1-10")):
                    if trans_type == TransactionType.PURCHASE and line.side == "credit":
                        # Redirect to Hutang Dagang (2-1101)
                        hutang_acc = db.query(Account).filter(
                            Account.code == "2-1101", 
                            or_(Account.tenant_id == t_id, Account.tenant_id == None)
                        ).first()
                        if hutang_acc:
                            target_account_id = hutang_acc.id
                            target_account = hutang_acc
                    elif trans_type == TransactionType.SALES and line.side == "debit":
                        # Redirect to Piutang Usaha (1-1201)
                        piutang_acc = db.query(Account).filter(
                            Account.code == "1-1201", 
                            or_(Account.tenant_id == t_id, Account.tenant_id == None)
                        ).first()
                        if piutang_acc:
                            target_account_id = piutang_acc.id
                            target_account = piutang_acc
            
            entries.append({
                "account_id": target_account_id,
                "account": {
                    "id": target_account.id,
                    "code": target_account.code,
                    "name": target_account.name
                } if target_account else None,
                "debit": val if line.side == "debit" else 0,
                "credit": val if line.side == "credit" else 0
            })
        return entries

    # 2. SPECIAL HANDLING: CASH_COUNT (Reconciliation) 
    # Only runs if NO mapping is found in database
    if trans_type == TransactionType.CASH_COUNT:
        # Get current system balance for Cash (Accounts starting with 1-10 or 1-11)
        system_cash = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(
            Account, Account.id == JournalEntry.account_id
        ).join(
            Transaction, Transaction.id == JournalEntry.transaction_id
        ).filter(
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            or_(Account.code.startswith("1-10"), Account.code.startswith("1-11"))
        ).scalar() or Decimal('0.00')
        
        diff = amount - system_cash
        if diff == 0: return []
        
        is_surplus = diff > 0
        abs_diff = abs(diff)
        
        # Support various cash accounts (Kas Utama/Kecil/Kas)
        cash_acc_codes = ["1-1000", "1-1100", "1-1101"]
        cash_acc = db.query(Account).filter(
            Account.code.in_(cash_acc_codes),
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).order_by(Account.tenant_id.desc(), Account.code).first()
        
        # Support various adjustment accounts (Pendapatan Lain-lain/Beban Operasional Lainnya)
        if is_surplus:
            adj_acc_codes = ["4-9000", "4-2101", "4-2000"]
        else:
            adj_acc_codes = ["5-9000", "6-9000", "5-2000"]
            
        adj_accounts = db.query(Account).filter(
            Account.code.in_(adj_acc_codes),
            or_(Account.tenant_id == tenant_id, Account.tenant_id == None)
        ).all()
        
        adj_acc = None
        for code in adj_acc_codes:
            tenant_match = next((a for a in adj_accounts if a.code == code and a.tenant_id == tenant_id), None)
            if tenant_match:
                adj_acc = tenant_match
                break
            global_match = next((a for a in adj_accounts if a.code == code and a.tenant_id is None), None)
            if global_match:
                adj_acc = global_match
                break
        
        if cash_acc and adj_acc:
            return [
                {
                    "account_id": cash_acc.id,
                    "account": {
                        "id": cash_acc.id,
                        "code": cash_acc.code,
                        "name": cash_acc.name
                    },
                    "debit": abs_diff if is_surplus else 0,
                    "credit": 0 if is_surplus else abs_diff
                },
                {
                    "account_id": adj_acc.id,
                    "account": {
                        "id": adj_acc.id,
                        "code": adj_acc.code,
                        "name": adj_acc.name
                    },
                    "debit": 0 if is_surplus else abs_diff,
                    "credit": abs_diff if is_surplus else 0
                }
            ]

    return []

def _validate_double_entry(entries: list[JournalEntry]) -> bool:
    """Ensure debits and credits match exactly."""
    total_debit = sum(entry.debit for entry in entries)
    total_credit = sum(entry.credit for entry in entries)
    return total_debit == total_credit

def _generate_reference_no(db: Session, trans_type: TransactionType, tenant_id: int) -> str:
    """Generate a simple sequential reference number like PUR-2026-0001 isolated per tenant"""
    prefixes = {
        TransactionType.PURCHASE: "PUR",
        TransactionType.SALES: "SAL",
        TransactionType.EXPENSE: "EXP",
        TransactionType.MANUAL: "MAN",
        TransactionType.INCOME: "INC",
        TransactionType.OPERATIONAL: "OPE",
        TransactionType.NON_CASH_OUT: "NCO",
        TransactionType.NON_CASH_IN: "NCI",
        TransactionType.CAPITAL: "CAP",
        TransactionType.SALES_RETURN: "SRT",
        TransactionType.PURCHASE_RETURN: "PRT"
    }
    prefix = prefixes.get(trans_type, trans_type.name[:3].upper())
    year = datetime.now().year
    
    # Sequence generation filtered by tenant_id
    count = db.query(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_type == trans_type
    ).count()
    return f"{prefix}-{year}-{(count + 1):04d}"

def create_transaction_with_journal(db: Session, trans_in: TransactionCreate, user_id: int | None = None, tenant_id: int | None = None) -> Transaction:
    """
    Core business logic: Creates a transaction header and its double-entry journal lines.
    Validates that the journal entries balance before committing.
    Now supports Implicit Global Context.
    """
    t_id = tenant_id or context.get_tenant_context()
    u_id = user_id or context.get_user_context()
    
    if not t_id:
        raise HTTPException(status_code=400, detail="Tenant context missing")
    
    # 1. Calculate and validate Debits vs Credits from input
    total_debit = sum(entry.debit for entry in trans_in.entries)
    total_credit = sum(entry.credit for entry in trans_in.entries)

    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Journal imbalance: Debits ({total_debit}) != Credits ({total_credit})"
        )

    # Note: We intentionally DO NOT validate trans_in.total_amount == total_debit anymore.
    # In Multi-Pair journals (like Sales Perpetual), total_debit (Sales + COGS) 
    # will naturally be larger than the transaction's base total_amount.
    # As long as Debit == Credit, the accounting equation holds.

    # 2. Create Transaction Header
    ref_no = trans_in.reference_no or _generate_reference_no(db, trans_in.transaction_type, t_id)
    
    # Check if auto_post_journal setting is enabled (default is True)
    from app.models.setting import AppSetting
    auto_post_setting = db.query(AppSetting).filter(
        AppSetting.tenant_id == t_id,
        AppSetting.key == "auto_post_journal"
    ).first()
    auto_post = auto_post_setting.value == "true" if auto_post_setting else True
    
    final_status = TransactionStatus.POSTED if auto_post else trans_in.status
    
    db_transaction = Transaction(
        tenant_id=t_id,
        transaction_date=trans_in.transaction_date,
        reference_no=ref_no,
        description=trans_in.description,
        transaction_type=trans_in.transaction_type,
        status=final_status,
        total_amount=trans_in.total_amount,
        payment_method=trans_in.payment_method,
        due_date=trans_in.due_date,
        created_by_id=u_id
    )
    db.add(db_transaction)
    db.flush() # Flush to get the transaction ID

    # 3. Create Journal Entries
    for entry_in in trans_in.entries:
        # Validate account exists and belongs to the same tenant
        account = db.query(Account).filter(
            Account.id == entry_in.account_id,
            Account.tenant_id == t_id
        ).first()
        if not account:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"Account ID {entry_in.account_id} not found or belongs to another tenant.")
        
        # New Rule: Cannot journal to parent accounts
        if db.query(Account).filter(Account.parent_id == account.id).first():
            db.rollback()
            raise HTTPException(status_code=400, detail=f"Akun '{account.name}' adalah Akun Induk (Header). Jurnal hanya diperbolehkan ke akun level terendah.")
            
        db_entry = JournalEntry(
            transaction_id=db_transaction.id,
            account_id=entry_in.account_id,
            debit=entry_in.debit,
            credit=entry_in.credit
        )
        db.add(db_entry)

    # 3b. Smart Master Data Extraction & Automatic HPP Calculation
    from app.models.inventory import Product, InventoryLog, Contact
    import uuid

    if trans_in.items:
        from app.models.setting import AppSetting
        total_cost_for_hpp = Decimal('0.00')
        
        # Get HPP Rate for item-based estimation (default 88% if no real cost known for sembako)
        rate_setting = db.query(AppSetting).filter(AppSetting.tenant_id == tenant_id, AppSetting.key == "default_cogs_rate").first()
        cogs_rate = Decimal(rate_setting.value) / 100 if rate_setting else Decimal('0.88')
        
        for item in trans_in.items:
            # 1. Resolve Contact (Same as before)
            contact_id = None
            if item.contact_name:
                is_supplier_related = trans_in.transaction_type.value in ["purchase", "operational", "purchase_return"]
                contact_type = "supplier" if is_supplier_related else "customer"
                contact = db.query(Contact).filter(
                    Contact.tenant_id == tenant_id,
                    Contact.name.ilike(item.contact_name),
                    Contact.contact_type == contact_type
                ).first()
                if not contact:
                    contact = Contact(
                        tenant_id=tenant_id,
                        name=item.contact_name,
                        contact_type=contact_type,
                        address=item.contact_address
                    )
                    db.add(contact)
                    db.flush()
                contact_id = contact.id

            # 2. Resolve Product
            product = db.query(Product).filter(
                Product.name.ilike(item.name)
            ).first()
            if not product:
                product = Product(
                    sku=str(uuid.uuid4())[:8].upper(),
                    name=item.name,
                    base_unit=item.unit or "pcs"
                )
                db.add(product)
                db.flush()

            # 3. Update Stock and Create Inventory Log
            # Purchase/Op OR Sales Return -> Stock IN
            # Sales/Income OR Purchase Return -> Stock OUT
            is_stock_in = trans_in.transaction_type.value in ["purchase", "operational", "sales_return"]
            is_stock_out = trans_in.transaction_type.value in ["income", "sales", "purchase_return"]
            
            log_type = "in" if is_stock_in else ("out" if is_stock_out else None)
            
            if log_type:
                from app.services.inventory import InventoryService
                from app.services.pricing_engine import PricingEngine

                if log_type == "in":
                    # Update Moving Average on Purchase
                    if trans_in.transaction_type.value == "purchase":
                        PricingEngine.update_moving_average(db, t_id, product.id, item.qty, item.unit_price)
                    
                    # Update Static Stock if maintenance is ON
                    InventoryService.update_stock_after_transaction(db, t_id, product.id, item.qty, "in")

                    # Special Logic: SALES_RETURN also reverses HPP
                    if trans_in.transaction_type.value == "sales_return":
                        # Get actual HPP for reversal
                        current_hpp = PricingEngine.get_current_hpp(db, t_id, product.id)
                        total_cost_for_hpp -= (Decimal(str(item.qty)) * current_hpp)
                else:
                    # Stock OUT logic
                    InventoryService.update_stock_after_transaction(db, t_id, product.id, item.qty, "out")
                    
                    # HPP Calculation for Sales/Income
                    if trans_in.transaction_type.value in ["income", "sales"]:
                        current_hpp = PricingEngine.get_current_hpp(db, t_id, product.id)
                        # FALLBACK: If current_hpp is 0, estimate it from item.unit_price * cogs_rate
                        if current_hpp == 0:
                            current_hpp = (Decimal(str(item.unit_price)) * cogs_rate).quantize(Decimal('0.00'))
                        total_cost_for_hpp += (Decimal(str(item.qty)) * current_hpp)

                # Common logic for both IN and OUT
                log = InventoryLog(
                    product_id=product.id,
                    transaction_id=db_transaction.id,
                    contact_id=contact_id,
                    quantity=item.qty,
                    price_per_unit=item.unit_price,
                    log_type=log_type
                )
                db.add(log)
        
        # 4. AUTOMATIC HPP JURNAL (Proportional Logic)
        # Create Jurnal for HPP if any cost calculated (positive for Sales, negative for Returns)
        if total_cost_for_hpp != 0:
            hpp_acc = db.query(Account).filter(Account.code == "5-1101", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            inv_acc = db.query(Account).filter(Account.code == "1-1301", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            if not hpp_acc:
                hpp_acc = db.query(Account).filter(Account.code == "5-1000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            if not inv_acc:
                inv_acc = db.query(Account).filter(Account.code == "1-3000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
            
            if hpp_acc and inv_acc:
                # Find if we already added these entries to db in step 3
                hpp_entry = next((e for e in db_transaction.entries if e.account_id == hpp_acc.id), None)
                inv_entry = next((e for e in db_transaction.entries if e.account_id == inv_acc.id), None)
                
                debit_val = total_cost_for_hpp if total_cost_for_hpp > 0 else 0
                credit_val = 0 if total_cost_for_hpp > 0 else abs(total_cost_for_hpp)
                
                if hpp_entry:
                    hpp_entry.debit = debit_val
                    hpp_entry.credit = credit_val
                else:
                    db.add(JournalEntry(transaction_id=db_transaction.id, account_id=hpp_acc.id, debit=debit_val, credit=credit_val))
                    
                if inv_entry:
                    inv_entry.debit = credit_val
                    inv_entry.credit = debit_val
                else:
                    db.add(JournalEntry(transaction_id=db_transaction.id, account_id=inv_acc.id, debit=credit_val, credit=debit_val))

    # 4. Commit everything as an atomic transaction
    try:
        # Adjust summary sales HPP for the day
        if db_transaction.transaction_type == TransactionType.SALES:
            adjust_summary_sales_hpp(db, t_id, db_transaction.transaction_date)
            
        db.commit()
        db.refresh(db_transaction)
        return db_transaction
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

def update_transaction_draft(db: Session, transaction_id: int, trans_update: any, tenant_id: int) -> Transaction:
    """
    Updates a transaction if it's in DRAFT status.
    Handles stock re-adjustment if items are modified.
    """
    from app.models.accounting import TransactionStatus
    from app.models.inventory import Product, InventoryLog, Contact
    import uuid

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status == TransactionStatus.POSTED and trans_update.status != TransactionStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Cannot edit a posted transaction.")

    # 1. Update basic fields
    if trans_update.description is not None:
        db_transaction.description = trans_update.description
    if trans_update.transaction_date is not None:
        db_transaction.transaction_date = trans_update.transaction_date
    if trans_update.status is not None:
        db_transaction.status = trans_update.status
    if trans_update.total_amount is not None:
        db_transaction.total_amount = trans_update.total_amount

    # 2. Update Items & Inventory Logs (if provided)
    if trans_update.items is not None:
        from app.services.inventory import InventoryService
        # First, revert existing stock changes from old logs
        for old_log in db_transaction.inventory_logs:
            # Reverse logic: if it was IN, we take OUT, etc.
            rev_type = "out" if old_log.log_type == "in" else "in"
            InventoryService.update_stock_after_transaction(db, tenant_id, old_log.product_id, old_log.quantity, rev_type)
        
        # Delete old logs
        db.query(InventoryLog).filter(InventoryLog.transaction_id == transaction_id).delete()

        # Create new logs
        for item in trans_update.items:
            # Resolve Product
            product = db.query(Product).filter(
                Product.name.ilike(item.name)
            ).first()
            if not product:
                # This should ideally use the global catalog search, but for now simple ILIKE
                product = Product(
                    sku=str(uuid.uuid4())[:8].upper(),
                    name=item.name,
                    base_unit=item.unit
                )
                db.add(product)
                db.flush()

            # Resolve Contact
            contact_id = None
            if item.contact_name:
                is_supplier_related = db_transaction.transaction_type.value in ["purchase", "operational", "purchase_return"]
                contact_type = "supplier" if is_supplier_related else "customer"
                contact = db.query(Contact).filter(
                    Contact.tenant_id == tenant_id,
                    Contact.name.ilike(item.contact_name),
                    Contact.contact_type == contact_type
                ).first()
                if not contact:
                    contact = Contact(tenant_id=tenant_id, name=item.contact_name, contact_type=contact_type)
                    db.add(contact)
                    db.flush()
                contact_id = contact.id

            # Update Stock
            is_stock_in = db_transaction.transaction_type.value in ["purchase", "operational", "sales_return"]
            is_stock_out = db_transaction.transaction_type.value in ["income", "sales", "purchase_return"]
            log_type = "in" if is_stock_in else ("out" if is_stock_out else None)
            
            if log_type:
                InventoryService.update_stock_after_transaction(db, tenant_id, product.id, item.qty, log_type)

                new_log = InventoryLog(
                    product_id=product.id,
                    transaction_id=db_transaction.id,
                    contact_id=contact_id,
                    quantity=item.qty,
                    price_per_unit=item.unit_price,
                    log_type=log_type
                )
                db.add(new_log)

    # Adjust summary sales HPP for the day
    if db_transaction.transaction_type == TransactionType.SALES:
        adjust_summary_sales_hpp(db, tenant_id, db_transaction.transaction_date)

    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def post_transaction(db: Session, transaction_id: int, tenant_id: int) -> Transaction:
    """
    Posts a transaction, changing its status from DRAFT to POSTED.
    """
    from app.models.accounting import TransactionStatus

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status == TransactionStatus.POSTED:
        raise HTTPException(status_code=400, detail="Transaction is already posted.")

    db_transaction.status = TransactionStatus.POSTED
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def unpost_transaction(db: Session, transaction_id: int, tenant_id: int) -> Transaction:
    """
    Unposts a transaction, changing its status from POSTED to DRAFT.
    """
    from app.models.accounting import TransactionStatus

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status != TransactionStatus.POSTED:
        raise HTTPException(status_code=400, detail="Transaction is not posted.")

    db_transaction.status = TransactionStatus.DRAFT
    db.commit()
    db.refresh(db_transaction)
    return db_transaction


def delete_transaction_draft(db: Session, transaction_id: int, tenant_id: int) -> bool:
    """
    Deletes a transaction if it's in DRAFT status.
    """
    from app.models.accounting import TransactionStatus
    from app.models.inventory import InventoryLog
    from app.services.inventory import InventoryService

    db_transaction = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == tenant_id
    ).first()

    if not db_transaction:
        raise HTTPException(status_code=404, detail="Transaction not found.")
    
    if db_transaction.status == TransactionStatus.POSTED:
        raise HTTPException(status_code=400, detail="Cannot delete a posted transaction.")

    # Revert stock changes if any
    for log in db_transaction.inventory_logs:
        rev_type = "out" if log.log_type == "in" else "in"
        InventoryService.update_stock_after_transaction(db, tenant_id, log.product_id, log.quantity, rev_type)
    
    tx_date = db_transaction.transaction_date
    tx_type = db_transaction.transaction_type

    db.delete(db_transaction)
    
    if tx_type == TransactionType.SALES:
        db.flush() # Apply delete first to get correct count
        adjust_summary_sales_hpp(db, tenant_id, tx_date)

    db.commit()
    return True

def get_dashboard_summary(db: Session, tenant_id: int | None = None) -> dict:
    """
    Calculates dashboard statistics for the given tenant.
    Includes both DRAFT and POSTED transactions for immediate 'Live' feedback.
    Now supports Implicit Global Context.
    """
    from sqlalchemy import func
    from app.models.accounting import TransactionType, TransactionStatus, JournalEntry, Account
    from decimal import Decimal
    from datetime import datetime, timedelta

    t_id = tenant_id or context.get_tenant_context()

    # Total Revenue (Income + Sales)
    revenue_types = [TransactionType.INCOME, TransactionType.SALES]
    total_revenue = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(revenue_types)
        # Removed status check for real-time "live" feeling
    ).scalar() or Decimal('0.00')

    # Total Expense (Purchase + Operational + Expense)
    expense_types = [TransactionType.PURCHASE, TransactionType.OPERATIONAL, TransactionType.EXPENSE]
    total_expense = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == t_id,
        Transaction.transaction_type.in_(expense_types)
    ).scalar() or Decimal('0.00')

    net_profit = total_revenue - total_expense

    # Actual Cash Balance (Sum of all journal entries for Cash/Bank accounts: 1-11xx)
    cash_balance = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(
        Account, Account.id == JournalEntry.account_id
    ).join(
        Transaction, Transaction.id == JournalEntry.transaction_id
    ).filter(
        Transaction.tenant_id == t_id,
        Transaction.status == TransactionStatus.POSTED,
        Account.code.startswith("1-11")
    ).scalar() or Decimal('0.00')

    recent_transactions = db.query(Transaction).filter(
        Transaction.tenant_id == t_id
    ).order_by(Transaction.id.desc()).limit(5).all()

    # Chart Data: Last 7 Days comparison
    # Use the date of the most recent transaction as the end date, or today if no transactions exist
    latest_tx = db.query(func.max(Transaction.transaction_date)).filter(Transaction.tenant_id == t_id).scalar()
    end_date = latest_tx if latest_tx else datetime.now().date()
    
    chart_data = []
    for i in range(6, -1, -1):
        day = end_date - timedelta(days=i)
        
        # Gunakan func.date untuk memastikan perbandingan hanya tanggal
        day_rev = db.query(func.sum(Transaction.total_amount)).filter(
            Transaction.tenant_id == t_id,
            func.date(Transaction.transaction_date) == day,
            Transaction.transaction_type.in_(revenue_types)
        ).scalar() or Decimal('0.00')
        
        day_exp = db.query(func.sum(Transaction.total_amount)).filter(
            Transaction.tenant_id == t_id,
            func.date(Transaction.transaction_date) == day,
            Transaction.transaction_type.in_(expense_types)
        ).scalar() or Decimal('0.00')
        
        chart_data.append({
            "name": day.strftime("%d %b"),
            "revenue": float(day_rev),
            "expense": float(day_exp)
        })
    # Fetch Upcoming Debts (H-7 to any future date)
    # Get debts that are due, sorted by nearest date
    upcoming_debts = db.query(Transaction).filter(
        Transaction.tenant_id == t_id,
        Transaction.due_date.isnot(None),
        Transaction.status == TransactionStatus.POSTED
    ).order_by(Transaction.due_date.asc()).limit(10).all()

    return {
        "total_revenue": total_revenue,
        "total_expense": total_expense,
        "net_profit": net_profit,
        "cash_balance": cash_balance,
        "recent_transactions": recent_transactions,
        "chart_data": chart_data,
        "upcoming_debts": upcoming_debts
    }

def adjust_summary_sales_hpp(db: Session, tenant_id: int, transaction_date: date):
    """
    Adjusts the HPP of the summary SALES transaction of the day
    by subtracting the total amount of all detailed SALES transactions.
    """
    from app.models.setting import AppSetting
    from app.models.inventory import InventoryLog
    from sqlalchemy import or_
    from datetime import date

    # Force flush so that all pending transaction entries are written to the database transaction state and queryable
    db.flush()

    # Find the summary transaction for the day: SALES type, tenant_id, date, and NO items/inventory logs
    # We join with InventoryLog and find the one with count of logs == 0
    summary_tx = db.query(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date == transaction_date,
        Transaction.transaction_type == TransactionType.SALES
    ).outerjoin(
        InventoryLog, InventoryLog.transaction_id == Transaction.id
    ).group_by(
        Transaction.id
    ).having(
        func.count(InventoryLog.id) == 0
    ).first()

    if not summary_tx:
        return

    # Find all other detailed sales of the day (SALES type with inventory logs / items)
    detailed_sales = db.query(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_date == transaction_date,
        Transaction.transaction_type == TransactionType.SALES,
        Transaction.id != summary_tx.id
    ).join(
        InventoryLog, InventoryLog.transaction_id == Transaction.id
    ).distinct().all()

    sum_detailed_amount = sum(tx.total_amount for tx in detailed_sales)

    # Calculate remaining amount for summary HPP
    remaining_amount = summary_tx.total_amount - sum_detailed_amount
    if remaining_amount < 0:
        remaining_amount = Decimal('0.00')

    # Get cogs rate
    rate_setting = db.query(AppSetting).filter(AppSetting.tenant_id == tenant_id, AppSetting.key == "default_cogs_rate").first()
    cogs_rate = Decimal(rate_setting.value) / 100 if rate_setting else Decimal('0.88') # 88% default for sembako

    cogs_amount = (remaining_amount * cogs_rate).quantize(Decimal('0.00'))

    # Update the summary transaction's HPP and Inventory entries
    hpp_acc = db.query(Account).filter(Account.code == "5-1101", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
    inv_acc = db.query(Account).filter(Account.code == "1-1301", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
    if not hpp_acc:
        hpp_acc = db.query(Account).filter(Account.code == "5-1000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()
    if not inv_acc:
        inv_acc = db.query(Account).filter(Account.code == "1-3000", or_(Account.tenant_id == tenant_id, Account.tenant_id == None)).order_by(Account.tenant_id.desc()).first()

    if hpp_acc and inv_acc:
        hpp_entry = db.query(JournalEntry).filter(JournalEntry.transaction_id == summary_tx.id, JournalEntry.account_id == hpp_acc.id).first()
        inv_entry = db.query(JournalEntry).filter(JournalEntry.transaction_id == summary_tx.id, JournalEntry.account_id == inv_acc.id).first()

        if hpp_entry:
            hpp_entry.debit = cogs_amount
            hpp_entry.credit = Decimal('0.00')
        else:
            db.add(JournalEntry(transaction_id=summary_tx.id, account_id=hpp_acc.id, debit=cogs_amount, credit=Decimal('0.00')))

        if inv_entry:
            inv_entry.debit = Decimal('0.00')
            inv_entry.credit = cogs_amount
        else:
            db.add(JournalEntry(transaction_id=summary_tx.id, account_id=inv_acc.id, debit=Decimal('0.00'), credit=cogs_amount))

        db.flush()
