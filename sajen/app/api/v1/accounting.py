from fastapi import APIRouter, Depends, status
from typing import List
from app.api.deps import SessionDep, CurrentUser, check_role
from app.models.user import UserRole, User
from app.schemas.accounting import (
    AccountResponse, 
    TransactionResponse, 
    TransactionCreate, 
    TransactionUpdate,
    DashboardSummaryResponse # Tambahkan ini
)
from app.models.accounting import Account, Transaction
from app.services.accounting import (
    create_transaction_with_journal, 
    update_transaction_draft, 
    post_transaction,
    delete_transaction_draft,
    get_dashboard_summary # Tambahkan ini
)

router = APIRouter()

@router.get("/dashboard/summary", response_model=DashboardSummaryResponse)
def get_summary(
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get dashboard summary statistics.
    """
    return get_dashboard_summary(db=session, tenant_id=current_user.tenant_id)

@router.get("/accounts", response_model=List[AccountResponse])
def get_chart_of_accounts(
    session: SessionDep,
    current_user: CurrentUser,
    active_only: bool = True
):
    """
    Retrieve the Chart of Accounts (COA) for the active tenant.
    """
    query = session.query(Account).filter(Account.tenant_id == current_user.tenant_id)
    if active_only:
        query = query.filter(Account.is_active)
    return query.order_by(Account.code).all()


@router.post("/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_new_transaction(
    trans_in: TransactionCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Record a new transaction with double-entry journal lines.
    Ensure debits and credits balance.
    Only accessible by Admin and Manager roles.
    """
    return create_transaction_with_journal(
        db=session,
        trans_in=trans_in,
        user_id=current_user.id,
        tenant_id=current_user.tenant_id
    )



@router.get("/transactions", response_model=List[TransactionResponse])
def get_transactions(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50
):
    """
    Retrieve recent transactions for the active tenant.
    """
    return session.query(Transaction).filter(
        Transaction.tenant_id == current_user.tenant_id
    ).order_by(
        Transaction.transaction_date.desc(),
        Transaction.id.desc()
    ).offset(skip).limit(limit).all()


@router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
def get_transaction_by_id(
    transaction_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Retrieve a specific transaction with journal entries and inventory logs for the active tenant.
    """
    transaction = session.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.tenant_id == current_user.tenant_id
    ).first()
    if not transaction:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Transaction not found.")
    return transaction


@router.put("/transactions/{transaction_id}", response_model=TransactionResponse)
def update_transaction(
    transaction_id: int,
    trans_update: TransactionUpdate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Update a transaction (only if DRAFT).
    Only accessible by Admin and Manager roles.
    """
    return update_transaction_draft(
        db=session,
        transaction_id=transaction_id,
        trans_update=trans_update,
        tenant_id=current_user.tenant_id
    )


@router.post("/transactions/{transaction_id}/post", response_model=TransactionResponse)
def post_transaction_api(
    transaction_id: int,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Post a transaction (change status from DRAFT to POSTED).
    Only accessible by Admin and Manager roles.
    """
    return post_transaction(
        db=session,
        transaction_id=transaction_id,
        tenant_id=current_user.tenant_id
    )


@router.delete("/transactions/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction_api(
    transaction_id: int,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Delete a transaction (only if DRAFT).
    Only accessible by Admin and Manager roles.
    """
    delete_transaction_draft(
        db=session,
        transaction_id=transaction_id,
        tenant_id=current_user.tenant_id
    )
    return None
