from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.accounting import Account, Transaction, JournalEntry, AccountType, TransactionType
from app.schemas.accounting import TransactionCreate
from datetime import datetime
from decimal import Decimal

def _validate_double_entry(entries: list[JournalEntry]) -> bool:
    """Ensure debits and credits match exactly."""
    total_debit = sum(entry.debit for entry in entries)
    total_credit = sum(entry.credit for entry in entries)
    return total_debit == total_credit

def _generate_reference_no(db: Session, trans_type: TransactionType) -> str:
    """Generate a simple sequential reference number like PUR-2026-0001"""
    prefix = trans_type.name[:3].upper()
    year = datetime.now().year
    
    # Very basic sequence generation (in production, use a dedicated sequence table)
    count = db.query(Transaction).filter(Transaction.transaction_type == trans_type).count()
    return f"{prefix}-{year}-{(count + 1):04d}"

def create_transaction_with_journal(db: Session, trans_in: TransactionCreate, user_id: int) -> Transaction:
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
    ref_no = trans_in.reference_no or _generate_reference_no(db, trans_in.transaction_type)
    
    db_transaction = Transaction(
        transaction_date=trans_in.transaction_date,
        reference_no=ref_no,
        description=trans_in.description,
        transaction_type=trans_in.transaction_type,
        total_amount=trans_in.total_amount,
        created_by_id=user_id
    )
    db.add(db_transaction)
    db.flush() # Flush to get the transaction ID

    # 3. Create Journal Entries
    for entry_in in trans_in.entries:
        # Validate account exists
        account = db.query(Account).filter(Account.id == entry_in.account_id).first()
        if not account:
            db.rollback()
            raise HTTPException(status_code=404, detail=f"Account ID {entry_in.account_id} not found")
            
        db_entry = JournalEntry(
            transaction_id=db_transaction.id,
            account_id=entry_in.account_id,
            debit=entry_in.debit,
            credit=entry_in.credit
        )
        db.add(db_entry)

    # 4. Commit everything as an atomic transaction
    try:
        db.commit()
        db.refresh(db_transaction)
        return db_transaction
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
