from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.api import deps
from app.models.accounting import Account, Transaction, JournalEntry, TransactionStatus, AccountType
from app.models.setting import AppSetting
from datetime import date, timedelta, datetime
from decimal import Decimal
import logging
import calendar

logger = logging.getLogger(__name__)
router = APIRouter()

def get_account_ids_by_type(db: Session, tenant_id: int, account_type: AccountType, codes: list = None):
    query = db.query(Account.id).filter(
        or_(Account.tenant_id == tenant_id, Account.tenant_id.is_(None)),
        Account.account_type == account_type
    )
    if codes:
        query = query.filter(Account.code.in_(codes))
    return [r[0] for r in query.all()]

def get_balance_change(db: Session, tenant_id: int, account_ids: list, start_date: date, end_date: date, is_credit_normal: bool = False):
    if not account_ids:
        return Decimal("0.00")
        
    debit_sum = db.query(func.sum(JournalEntry.debit)).join(
        Transaction, Transaction.id == JournalEntry.transaction_id
    ).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.status == TransactionStatus.POSTED,
        Transaction.transaction_date >= start_date,
        Transaction.transaction_date <= end_date,
        JournalEntry.account_id.in_(account_ids)
    ).scalar() or Decimal("0.00")
    
    credit_sum = db.query(func.sum(JournalEntry.credit)).join(
        Transaction, Transaction.id == JournalEntry.transaction_id
    ).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.status == TransactionStatus.POSTED,
        Transaction.transaction_date >= start_date,
        Transaction.transaction_date <= end_date,
        JournalEntry.account_id.in_(account_ids)
    ).scalar() or Decimal("0.00")
    
    if is_credit_normal:
        return credit_sum - debit_sum
    return debit_sum - credit_sum

@router.get("/overview")
def get_dashboard_overview(
    days: str = Query("30", description="Filter days: 7, 30, 60, 90, YTD"),
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser = None
):
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")
        
    tenant_id = current_user.tenant_id
    today = date.today()
    
    # Parse days filter
    if days.upper() == "YTD":
        start_date = today.replace(month=1, day=1)
        total_days = (today - start_date).days + 1
    else:
        try:
            total_days = int(days)
        except ValueError:
            total_days = 30
        start_date = today - timedelta(days=total_days - 1)
        
    # Previous period for trend calculation
    prev_end_date = start_date - timedelta(days=1)
    prev_start_date = prev_end_date - timedelta(days=total_days - 1)

    # Account Identifications
    revenue_account_ids = get_account_ids_by_type(db, tenant_id, AccountType.REVENUE)
    expense_account_ids = get_account_ids_by_type(db, tenant_id, AccountType.EXPENSE)
    cash_account_ids = get_account_ids_by_type(db, tenant_id, AccountType.ASSET, ["1-1000", "1-1100", "1-1200", "1-1101", "1-1102"])
    payable_account_ids = get_account_ids_by_type(db, tenant_id, AccountType.LIABILITY, ["2-1000", "2-1100"]) # Example standard payable codes

    # --- KPI METRICS ---
    # Current Period
    revenue_current = get_balance_change(db, tenant_id, revenue_account_ids, start_date, today, is_credit_normal=True)
    expenses_current = get_balance_change(db, tenant_id, expense_account_ids, start_date, today, is_credit_normal=False)
    
    # Previous Period
    revenue_prev = get_balance_change(db, tenant_id, revenue_account_ids, prev_start_date, prev_end_date, is_credit_normal=True)
    expenses_prev = get_balance_change(db, tenant_id, expense_account_ids, prev_start_date, prev_end_date, is_credit_normal=False)

    # Cash Balance is usually YTD or lifetime, we get it as of today
    # Assuming start of time is a very early date
    early_date = date(2000, 1, 1)
    cash_balance = get_balance_change(db, tenant_id, cash_account_ids, early_date, today, is_credit_normal=False)
    cash_prev = get_balance_change(db, tenant_id, cash_account_ids, early_date, prev_end_date, is_credit_normal=False)

    payable_balance = get_balance_change(db, tenant_id, payable_account_ids, early_date, today, is_credit_normal=True)
    payable_prev = get_balance_change(db, tenant_id, payable_account_ids, early_date, prev_end_date, is_credit_normal=True)

    def calculate_trend(current, prev):
        if prev == 0:
            return 100.0 if current > 0 else 0.0
        return float(((current - prev) / prev) * 100)

    # Target settings (default to 1,000,000 per day if not set)
    target_setting = db.query(AppSetting).filter(AppSetting.tenant_id == tenant_id, AppSetting.key == "daily_revenue_target").first()
    daily_target = Decimal(target_setting.value) if target_setting else Decimal("1000000.00")

    # --- CHART DATA (Time-Series) ---
    history_chart = []
    
    # Fast grouping by date
    # Fetching all transactions in the date range
    transactions = db.query(
        Transaction.transaction_date,
        JournalEntry.account_id,
        func.sum(JournalEntry.debit).label('total_debit'),
        func.sum(JournalEntry.credit).label('total_credit')
    ).join(JournalEntry, JournalEntry.transaction_id == Transaction.id).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.status == TransactionStatus.POSTED,
        Transaction.transaction_date >= start_date,
        Transaction.transaction_date <= today
    ).group_by(Transaction.transaction_date, JournalEntry.account_id).all()

    # Aggregate by date locally
    daily_data = {}
    for d in range(total_days):
        dt = start_date + timedelta(days=d)
        daily_data[dt] = {"income": Decimal("0"), "expenses": Decimal("0")}

    for tx_date, acc_id, t_deb, t_cred in transactions:
        t_deb = t_deb or Decimal("0")
        t_cred = t_cred or Decimal("0")
        
        if acc_id in revenue_account_ids:
            # Revenue is credit normal
            daily_data[tx_date]["income"] += (t_cred - t_deb)
        elif acc_id in expense_account_ids:
            # Expense is debit normal
            daily_data[tx_date]["expenses"] += (t_deb - t_cred)

    # Calculate moving average for projection or just use flat target
    # We will blend actual and a smooth projection line
    for d in range(total_days):
        dt = start_date + timedelta(days=d)
        inc = daily_data[dt]["income"]
        exp = daily_data[dt]["expenses"]
        
        # Projection logic: 
        # For past days, projection income could just be the target, or a smoothed trend.
        # Here we use the set daily_target.
        
        history_chart.append({
            "date": dt.strftime("%Y-%m-%d"),
            "income": float(inc),
            "expenses": float(exp),
            "projection_income": float(daily_target)
        })

    # --- FINANCIAL ADVISOR INSIGHT ---
    health_score = 100
    if float(expenses_current) > float(revenue_current) and float(revenue_current) > 0:
        health_score -= 30
    if float(cash_balance) < float(payable_balance):
        health_score -= 40
        
    insight_text = ""
    if health_score >= 80:
        insight_text = "Keuangan bisnis Anda sangat sehat. Pertumbuhan pendapatan stabil dan kas cukup untuk menutupi kewajiban."
    elif health_score >= 50:
        insight_text = "Keuangan cukup baik, namun perhatikan arus kas Anda. Pastikan utang usaha terbayar tepat waktu sebelum melakukan ekspansi."
    else:
        insight_text = "Peringatan: Pengeluaran atau utang Anda lebih besar dari pendapatan/kas saat ini. Disarankan untuk segera melakukan efisiensi biaya dan meningkatkan penagihan piutang."
        
    if calculate_trend(revenue_current, revenue_prev) < 0:
        insight_text += f" Terdapat penurunan pendapatan sebesar {abs(calculate_trend(revenue_current, revenue_prev)):.1f}% dibandingkan periode sebelumnya. Pertimbangkan strategi promosi baru."

    return {
        "kpi": {
            "total_revenue": {
                "value": float(revenue_current),
                "trend": calculate_trend(revenue_current, revenue_prev)
            },
            "total_expenses": {
                "value": float(expenses_current),
                "trend": calculate_trend(expenses_current, expenses_prev)
            },
            "cash_balance": {
                "value": float(cash_balance),
                "trend": calculate_trend(cash_balance, cash_prev)
            },
            "accounts_payable": {
                "value": float(payable_balance),
                "trend": calculate_trend(payable_balance, payable_prev)
            }
        },
        "history_chart": history_chart,
        "financial_advisor": {
            "health_score": health_score,
            "insight": insight_text
        }
    }
