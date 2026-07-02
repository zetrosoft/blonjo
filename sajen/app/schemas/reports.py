from pydantic import BaseModel
from typing import List, Optional
from datetime import date
from decimal import Decimal

class AccountBalance(BaseModel):
    account_code: str
    account_name: str
    balance: Decimal
    has_parent: bool = False

class ProfitLossReport(BaseModel):
    start_date: date
    end_date: date
    revenues: List[AccountBalance]
    total_revenue: Decimal
    cogs: List[AccountBalance]
    total_cogs: Decimal
    gross_profit: Decimal
    expenses: List[AccountBalance]
    total_expense: Decimal
    net_profit: Decimal

class BalanceSheetReport(BaseModel):
    as_of_date: date
    assets: List[AccountBalance]
    total_assets: Decimal
    liabilities: List[AccountBalance]
    total_liabilities: Decimal
    equities: List[AccountBalance]
    total_equity: Decimal
    total_liabilities_and_equity: Decimal

class EquityChangesReport(BaseModel):
    start_date: date
    end_date: date
    opening_equity: Decimal
    net_profit: Decimal
    withdrawals: Decimal
    closing_equity: Decimal

class CashFlowItem(BaseModel):
    name: str
    amount: Decimal

class CashFlowReport(BaseModel):
    start_date: date
    end_date: date
    operating_activities: List[CashFlowItem]
    total_operating: Decimal
    investing_activities: List[CashFlowItem]
    total_investing: Decimal
    financing_activities: List[CashFlowItem]
    total_financing: Decimal
    net_cash_increase: Decimal
    opening_cash: Decimal
    closing_cash: Decimal
