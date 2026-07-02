from fastapi import APIRouter, Depends, Response, HTTPException
from datetime import date
from app.api.deps import SessionDep, CurrentUser
from app.schemas.reports import ProfitLossReport, BalanceSheetReport, EquityChangesReport, CashFlowReport
from app.services.reports import (
    get_profit_loss, get_balance_sheet, get_equity_changes, get_cash_flow,
    generate_report_pdf
)

router = APIRouter()

@router.get("/profit-loss", response_model=ProfitLossReport)
def get_profit_loss_report(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: date,
    end_date: date
):
    return get_profit_loss(session, current_user.tenant_id, start_date, end_date)

@router.get("/profit-loss/pdf")
def get_profit_loss_pdf(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: date,
    end_date: date,
    lang: str = "id"
):
    from app.models.setting import AppSetting
    settings = session.query(AppSetting).filter(AppSetting.tenant_id == current_user.tenant_id).all()
    store_info = {s.key: s.value for s in settings}
    
    data = get_profit_loss(session, current_user.tenant_id, start_date, end_date)
    pdf_content = generate_report_pdf(
        "Laporan Laba Rugi", data, "profit_loss", 
        store_name=store_info.get("store_name", "Blonjo Store"),
        store_address=store_info.get("store_address", ""),
        store_phone=store_info.get("store_phone", ""),
        lang=lang
    )
    return Response(content=pdf_content, media_type="application/pdf")

@router.get("/balance-sheet", response_model=BalanceSheetReport)
def get_balance_sheet_report(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: date,
    end_date: date
):
    return get_balance_sheet(session, current_user.tenant_id, start_date, end_date)

@router.get("/balance-sheet/pdf")
def get_balance_sheet_pdf(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: date,
    end_date: date,
    lang: str = "id"
):
    from app.models.setting import AppSetting
    settings = session.query(AppSetting).filter(AppSetting.tenant_id == current_user.tenant_id).all()
    store_info = {s.key: s.value for s in settings}
    
    data = get_balance_sheet(session, current_user.tenant_id, start_date, end_date)
    pdf_content = generate_report_pdf(
        "Laporan Posisi Keuangan", data, "balance_sheet", 
        store_name=store_info.get("store_name", "Blonjo Store"),
        store_address=store_info.get("store_address", ""),
        store_phone=store_info.get("store_phone", ""),
        lang=lang
    )
    return Response(content=pdf_content, media_type="application/pdf")

@router.get("/equity-changes/pdf")
def get_equity_changes_pdf(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: date,
    end_date: date,
    lang: str = "id"
):
    from app.models.setting import AppSetting
    settings = session.query(AppSetting).filter(AppSetting.tenant_id == current_user.tenant_id).all()
    store_info = {s.key: s.value for s in settings}
    
    data = get_equity_changes(session, current_user.tenant_id, start_date, end_date)
    pdf_content = generate_report_pdf(
        "Laporan Perubahan Modal", data, "equity_changes", 
        store_name=store_info.get("store_name", "Blonjo Store"),
        store_address=store_info.get("store_address", ""),
        store_phone=store_info.get("store_phone", ""),
        lang=lang
    )
    return Response(content=pdf_content, media_type="application/pdf")

@router.get("/cash-flow/pdf")
def get_cash_flow_pdf(
    session: SessionDep,
    current_user: CurrentUser,
    start_date: date,
    end_date: date,
    lang: str = "id"
):
    from app.models.setting import AppSetting
    settings = session.query(AppSetting).filter(AppSetting.tenant_id == current_user.tenant_id).all()
    store_info = {s.key: s.value for s in settings}
    
    data = get_cash_flow(session, current_user.tenant_id, start_date, end_date)
    pdf_content = generate_report_pdf(
        "Laporan Arus Kas", data, "cash_flow", 
        store_name=store_info.get("store_name", "Blonjo Store"),
        store_address=store_info.get("store_address", ""),
        store_phone=store_info.get("store_phone", ""),
        lang=lang
    )
    return Response(content=pdf_content, media_type="application/pdf")

@router.get("/transaction/{tx_id}/pdf")
def get_transaction_pdf(
    tx_id: int,
    session: SessionDep,
    current_user: CurrentUser,
    lang: str = "id"
):
    from app.models.accounting import Transaction
    from app.models.setting import AppSetting
    
    settings = session.query(AppSetting).filter(AppSetting.tenant_id == current_user.tenant_id).all()
    store_info = {s.key: s.value for s in settings}
    
    tx = session.query(Transaction).filter(
        Transaction.id == tx_id,
        Transaction.tenant_id == current_user.tenant_id
    ).first()
    
    if not tx:
         raise HTTPException(status_code=404, detail="Transaction not found")
    
    data = {
        "reference_no": tx.reference_no,
        "end_date": str(tx.transaction_date),
        "description": tx.description,
        "entries": [
            {
                "account_code": e.account.code if e.account else "-",
                "account_name": e.account.name if e.account else "-",
                "debit": e.debit,
                "credit": e.credit
            } for e in tx.entries
        ]
    }
    
    pdf_content = generate_report_pdf(
        "Bukti Jurnal", data, "transaction_proof", 
        store_name=store_info.get("store_name", "Blonjo Store"),
        store_address=store_info.get("store_address", ""),
        store_phone=store_info.get("store_phone", ""),
        lang=lang
    )
    return Response(content=pdf_content, media_type="application/pdf")
