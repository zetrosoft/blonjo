from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import SessionDep, CurrentUser
from app.schemas.accounting import AccountResponse, TransactionResponse, TransactionCreate
from app.models.accounting import Account, Transaction
from app.services.accounting import create_transaction_with_journal

router = APIRouter()

@router.get("/accounts", response_model=List[AccountResponse])
def get_chart_of_accounts(
    session: SessionDep,
    current_user: CurrentUser,
    active_only: bool = True
):
    """
    Retrieve the Chart of Accounts (COA).
    """
    query = session.query(Account)
    if active_only:
        query = query.filter(Account.is_active == True)
    return query.order_by(Account.code).all()


@router.post("/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_new_transaction(
    trans_in: TransactionCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Record a new transaction with double-entry journal lines.
    Ensure debits and credits balance.
    """
    return create_transaction_with_journal(db=session, trans_in=trans_in, user_id=current_user.id)


@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50
):
    """
    Retrieve recent transactions.
    """
    return session.query(Transaction).order_by(Transaction.transaction_date.desc(), Transaction.id.desc()).offset(skip).limit(limit).all()
