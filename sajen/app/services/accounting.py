from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.accounting import Account, Transaction, JournalEntry, TransactionType
from app.schemas.accounting import TransactionCreate
from datetime import datetime

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
        TransactionType.CAPITAL: "CAP"
    }
    prefix = prefixes.get(trans_type, trans_type.name[:3].upper())
    year = datetime.now().year
    
    # Sequence generation filtered by tenant_id
    count = db.query(Transaction).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_type == trans_type
    ).count()
    return f"{prefix}-{year}-{(count + 1):04d}"

def create_transaction_with_journal(db: Session, trans_in: TransactionCreate, user_id: int, tenant_id: int) -> Transaction:
    """
    Core business logic: Creates a transaction header and its double-entry journal lines.
    Validates that the journal entries balance before committing.
    """
    
    # 1. Calculate and validate Debits vs Credits from input
    total_debit = sum(entry.debit for entry in trans_in.entries)
    total_credit = sum(entry.credit for entry in trans_in.entries)
    
    if total_debit != total_credit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Journal imbalance: Debits ({total_debit}) != Credits ({total_credit})"
        )
    
    # Also ensure the transaction header total matches the journal total (either debit or credit side)
    if trans_in.total_amount != total_debit:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transaction total amount ({trans_in.total_amount}) does not match journal total ({total_debit})"
        )

    # 2. Create Transaction Header
    ref_no = trans_in.reference_no or _generate_reference_no(db, trans_in.transaction_type, tenant_id)
    
    db_transaction = Transaction(
        tenant_id=tenant_id,
        transaction_date=trans_in.transaction_date,
        reference_no=ref_no,
        description=trans_in.description,
        transaction_type=trans_in.transaction_type,
        status=trans_in.status,
        total_amount=trans_in.total_amount,
        created_by_id=user_id
    )
    db.add(db_transaction)
    db.flush() # Flush to get the transaction ID

    # 3. Create Journal Entries
    for entry_in in trans_in.entries:
        # Validate account exists and belongs to the same tenant
        account = db.query(Account).filter(
            Account.id == entry_in.account_id,
            Account.tenant_id == tenant_id
        ).first()
        if not account:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"Account ID {entry_in.account_id} not found or belongs to another tenant.")
            
        db_entry = JournalEntry(
            transaction_id=db_transaction.id,
            account_id=entry_in.account_id,
            debit=entry_in.debit,
            credit=entry_in.credit
        )
        db.add(db_entry)

    # 3b. Smart Master Data Extraction (Items)
    from app.models.inventory import Product, InventoryLog, Contact
    import uuid

    if trans_in.items:
        for item in trans_in.items:
            # 1. Resolve Contact
            contact_id = None
            if item.contact_name:
                contact_type = "supplier" if trans_in.transaction_type.value in ["purchase", "operational"] else "customer"
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
                else:
                    # Update address if it's new/different
                    if item.contact_address and not contact.address:
                        contact.address = item.contact_address
                contact_id = contact.id

            # 2. Resolve Product
            product = db.query(Product).filter(
                Product.tenant_id == tenant_id,
                Product.name.ilike(item.name)
            ).first()
            if not product:
                product = Product(
                    tenant_id=tenant_id,
                    sku=str(uuid.uuid4())[:8].upper(),
                    name=item.name,
                    unit=item.unit,
                    current_stock=0
                )
                db.add(product)
                db.flush()

            # 3. Update Stock and Create Inventory Log
            log_type = "in" if trans_in.transaction_type.value in ["purchase", "operational"] else ("out" if trans_in.transaction_type.value == "income" else None)
            if log_type:
                if log_type == "in":
                    product.current_stock += item.qty
                else:
                    product.current_stock -= item.qty

                log = InventoryLog(
                    product_id=product.id,
                    transaction_id=db_transaction.id,
                    contact_id=contact_id,
                    quantity=item.qty,
                    price_per_unit=item.unit_price,
                    log_type=log_type
                )
                db.add(log)

    # 4. Commit everything as an atomic transaction
    try:
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
        # First, revert existing stock changes from old logs
        for old_log in db_transaction.inventory_logs:
            product = old_log.product
            if old_log.log_type == "in":
                product.current_stock -= old_log.quantity
            else:
                product.current_stock += old_log.quantity
        
        # Delete old logs
        db.query(InventoryLog).filter(InventoryLog.transaction_id == transaction_id).delete()

        # Create new logs
        for item in trans_update.items:
            # Resolve Product (simplified logic from create)
            product = db.query(Product).filter(
                Product.tenant_id == tenant_id,
                Product.name.ilike(item.name)
            ).first()
            if not product:
                product = Product(
                    tenant_id=tenant_id,
                    sku=str(uuid.uuid4())[:8].upper(),
                    name=item.name,
                    unit=item.unit,
                    current_stock=0
                )
                db.add(product)
                db.flush()

            # Resolve Contact
            contact_id = None
            if item.contact_name:
                contact_type = "supplier" if db_transaction.transaction_type.value in ["purchase", "operational"] else "customer"
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
            log_type = "in" if db_transaction.transaction_type.value in ["purchase", "operational"] else ("out" if db_transaction.transaction_type.value == "income" else None)
            if log_type:
                if log_type == "in":
                    product.current_stock += item.qty
                else:
                    product.current_stock -= item.qty

                new_log = InventoryLog(
                    product_id=product.id,
                    transaction_id=db_transaction.id,
                    contact_id=contact_id,
                    quantity=item.qty,
                    price_per_unit=item.unit_price,
                    log_type=log_type
                )
                db.add(new_log)

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


def delete_transaction_draft(db: Session, transaction_id: int, tenant_id: int) -> bool:
    """
    Deletes a transaction if it's in DRAFT status.
    """
    from app.models.accounting import TransactionStatus
    from app.models.inventory import InventoryLog, Product

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
        product = log.product
        if log.log_type == "in":
            product.current_stock -= log.quantity
        else:
            product.current_stock += log.quantity
    
    db.delete(db_transaction)
    db.commit()
    return True

def get_dashboard_summary(db: Session, tenant_id: int) -> dict:
    """
    Calculates dashboard statistics for the given tenant.
    Includes both DRAFT and POSTED transactions for immediate 'Live' feedback.
    """
    from sqlalchemy import func
    from app.models.accounting import TransactionType, TransactionStatus
    from decimal import Decimal
    from datetime import datetime, timedelta

    # Total Revenue (Income + Sales)
    revenue_types = [TransactionType.INCOME, TransactionType.SALES]
    total_revenue = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_type.in_(revenue_types)
        # Removed status check for real-time "live" feeling
    ).scalar() or Decimal('0.00')

    # Total Expense (Purchase + Operational + Expense)
    expense_types = [TransactionType.PURCHASE, TransactionType.OPERATIONAL, TransactionType.EXPENSE]
    total_expense = db.query(func.sum(Transaction.total_amount)).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.transaction_type.in_(expense_types)
    ).scalar() or Decimal('0.00')

    net_profit = total_revenue - total_expense

    recent_transactions = db.query(Transaction).filter(
        Transaction.tenant_id == tenant_id
    ).order_by(Transaction.id.desc()).limit(5).all()

    # Chart Data: Last 7 Days comparison
    # Use the date of the most recent transaction as the end date, or today if no transactions exist
    latest_tx = db.query(func.max(Transaction.transaction_date)).filter(Transaction.tenant_id == tenant_id).scalar()
    end_date = latest_tx if latest_tx else datetime.now().date()
    
    chart_data = []
    for i in range(6, -1, -1):
        day = end_date - timedelta(days=i)
        
        # Gunakan func.date untuk memastikan perbandingan hanya tanggal
        day_rev = db.query(func.sum(Transaction.total_amount)).filter(
            Transaction.tenant_id == tenant_id,
            func.date(Transaction.transaction_date) == day,
            Transaction.transaction_type.in_(revenue_types)
        ).scalar() or Decimal('0.00')
        
        day_exp = db.query(func.sum(Transaction.total_amount)).filter(
            Transaction.tenant_id == tenant_id,
            func.date(Transaction.transaction_date) == day,
            Transaction.transaction_type.in_(expense_types)
        ).scalar() or Decimal('0.00')
        
        chart_data.append({
            "name": day.strftime("%d %b"),
            "revenue": float(day_rev),
            "expense": float(day_exp)
        })

    return {
        "total_revenue": total_revenue,
        "total_expense": total_expense,
        "net_profit": net_profit,
        "recent_transactions": recent_transactions,
        "chart_data": chart_data
    }
