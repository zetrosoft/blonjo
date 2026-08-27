from sqlalchemy.orm import Session
from sqlalchemy import func, case, or_
from datetime import date, datetime
from decimal import Decimal
import io
from fpdf import FPDF
from app.models.accounting import Account, AccountType, Transaction, JournalEntry, TransactionStatus, TransactionType

# Translation Map for Backend PDF Generation (Single Language)
PDF_TRANSLATIONS = {
    "id": {
        "profit_loss": "LAPORAN LABA RUGI",
        "balance_sheet": "LAPORAN POSISI KEUANGAN",
        "equity_changes": "LAPORAN PERUBAHAN EKUITAS",
        "cash_flow": "LAPORAN ARUS KAS",
        "trial_balance": "LAPORAN NERACA PERCOBAAN",
        "transaction_proof": "BUKTI JURNAL",
        "period": "Periode",
        "per_date": "Per Tanggal",
        "account_code": "Kode Akun",
        "account_name": "Nama Akun",
        "balance": "Saldo",
        "total": "TOTAL",
        "debit": "Debit",
        "credit": "Kredit",
        "revenue": "PENDAPATAN",
        "cogs": "HARGA POKOK PENJUALAN (HPP)",
        "gross_profit": "LABA (RUGI) KOTOR",
        "expenses": "BEBAN OPERASIONAL",
        "net_profit": "LABA (RUGI) BERSIH",
        "assets": "ASET",
        "current_assets": "ASET LANCAR",
        "fixed_assets": "ASET TIDAK LANCAR",
        "liabilities": "LIABILITAS",
        "equity": "EKUITAS",
        "total_liabilities_equity": "TOTAL LIABILITAS & EKUITAS",
        "opening_equity": "Modal Awal",
        "additions": "Tambahan Modal",
        "withdrawals": "Prive / Pengambilan",
        "closing_equity": "MODAL AKHIR",
        "operating": "AKTIVITAS OPERASI",
        "investing": "AKTIVITAS INVESTASI",
        "financing": "AKTIVITAS PENDANAAN",
        "cash_increase": "KENAIKAN (PENURUNAN) KAS BERSIH",
        "opening_cash": "SALDO KAS AWAL",
        "closing_cash": "SALDO KAS AKHIR",
        "label_description": "Keterangan",
        "general_ledger": "LAPORAN BUKU BESAR",
        "running_balance": "Saldo Berjalan",
        "opening_balance": "Saldo Awal",
        "closing_balance": "Saldo Akhir",
        # Account Keys

        "acc_header_assets": "ASET",
        "acc_header_current_assets": "ASET LANCAR",
        "acc_header_fixed_assets": "ASET TIDAK LANCAR",
        "acc_header_liabilities": "LIABILITAS",
        "acc_header_current_liabilities": "KEWAJIBAN JANGKA PENDEK",
        "acc_header_long_term_liabilities": "KEWAJIBAN JANGKA PANJANG",
        "acc_header_equity": "EKUITAS",
        "acc_header_revenue": "PENDAPATAN",
        "acc_header_operating_revenue": "PENDAPATAN USAHA",
        "acc_header_cogs": "HARGA POKOK PENJUALAN",
        "acc_header_operating_expenses": "BEBAN OPERASIONAL",
        "acc_petty_cash": "Kas (Petty Cash)",
        "acc_bank": "Bank",
        "acc_accounts_receivable": "Piutang Usaha",
        "acc_inventory_merchandise": "Persediaan Barang Dagang",
        "acc_inventory_raw_material": "Persediaan Bahan Baku",
        "acc_buildings": "Bangunan",
        "acc_accum_depr_buildings": "Akum. Penyusutan Bangunan",
        "acc_equipment_machinery": "Peralatan & Mesin",
        "acc_accum_depr_equipment": "Akum. Penyusutan Peralatan",
        "acc_accounts_payable": "Utang Usaha",
        "acc_salaries_payable": "Utang Gaji",
        "acc_taxes_payable": "Utang Pajak",
        "acc_customer_deposit": "Uang Muka Penjualan",
        "acc_bank_loan_long": "Utang Bank (Jangka Panjang)",
        "acc_owners_capital": "Modal Pemilik",
        "acc_retained_earnings": "Laba Ditahan",
        "acc_drawings_dividends": "Prive / Dividen",
        "acc_sales_revenue": "Pendapatan Penjualan",
        "acc_other_revenue": "Pendapatan Lain-lain",
        "acc_cogs": "Harga Pokok Penjualan (HPP)",
        "acc_purchase_freight": "Beban Angkut Pembelian",
        "acc_salaries_expense": "Beban Gaji & Upah",
        "acc_rent_expense": "Beban Sewa",
        "acc_utilities_expense": "Beban Listrik, Air, & Internet",
        "acc_marketing_expense": "Beban Pemasaran",
        "acc_bank_admin_expense": "Beban Administrasi & Bank"
    },
    "en": {
        "profit_loss": "PROFIT & LOSS STATEMENT",
        "balance_sheet": "BALANCE SHEET",
        "equity_changes": "EQUITY CHANGES",
        "cash_flow": "CASH FLOW STATEMENT",
        "trial_balance": "TRIAL BALANCE REPORT",
        "transaction_proof": "JOURNAL VOUCHER",
        "period": "Period",
        "per_date": "As of",
        "account_code": "Code",
        "account_name": "Account Name",
        "balance": "Balance",
        "total": "TOTAL",
        "debit": "Debit",
        "credit": "Credit",
        "revenue": "REVENUE",
        "cogs": "COST OF GOODS SOLD (COGS)",
        "gross_profit": "GROSS PROFIT",
        "expenses": "OPERATIONAL EXPENSES",
        "net_profit": "NET PROFIT",
        "assets": "ASSETS",
        "current_assets": "CURRENT ASSETS",
        "fixed_assets": "FIXED ASSETS",
        "liabilities": "LIABILITIES",
        "equity": "EQUITY",
        "total_liabilities_equity": "TOTAL LIABILITIES & EQUITY",
        "opening_equity": "Opening Balance",
        "additions": "Additions",
        "withdrawals": "Withdrawals",
        "closing_equity": "CLOSING BALANCE",
        "operating": "OPERATING ACTIVITIES",
        "investing": "INVESTING ACTIVITIES",
        "financing": "FINANCING ACTIVITIES",
        "cash_increase": "NET CASH INCREASE (DECREASE)",
        "opening_cash": "OPENING CASH BALANCE",
        "closing_cash": "CLOSING CASH BALANCE",
        "label_description": "Description",
        "general_ledger": "GENERAL LEDGER REPORT",
        "running_balance": "Running Balance",
        "opening_balance": "Opening Balance",
        "closing_balance": "Closing Balance",
        # Account Keys
        "acc_header_assets": "Assets",
        "acc_header_current_assets": "Current Assets",
        "acc_header_fixed_assets": "Fixed Assets",
        "acc_header_liabilities": "Liabilities",
        "acc_header_current_liabilities": "Current Liabilities",
        "acc_header_long_term_liabilities": "Long Term Liabilities",
        "acc_header_equity": "Equity",
        "acc_header_revenue": "Revenue",
        "acc_header_operating_revenue": "Operating Revenue",
        "acc_header_cogs": "Cost of Goods Sold",
        "acc_header_operating_expenses": "Operating Expenses",
        "acc_petty_cash": "Petty Cash",
        "acc_bank": "Bank",
        "acc_accounts_receivable": "Accounts Receivable",
        "acc_inventory_merchandise": "Inventory - Merchandise",
        "acc_inventory_raw_material": "Inventory - Raw Material",
        "acc_buildings": "Buildings",
        "acc_accum_depr_buildings": "Accum. Depr. - Buildings",
        "acc_equipment_machinery": "Equipment & Machinery",
        "acc_accum_depr_equipment": "Accum. Depr. - Equipment",
        "acc_accounts_payable": "Accounts Payable",
        "acc_salaries_payable": "Salaries Payable",
        "acc_taxes_payable": "Taxes Payable",
        "acc_customer_deposit": "Customer Deposit",
        "acc_bank_loan_long": "Bank Loan (Long Term)",
        "acc_owners_capital": "Owner's Capital",
        "acc_retained_earnings": "Retained Earnings",
        "acc_drawings_dividends": "Drawings / Dividends",
        "acc_sales_revenue": "Sales Revenue",
        "acc_other_revenue": "Other Revenue",
        "acc_cogs": "Cost of Goods Sold (COGS)",
        "acc_purchase_freight": "Freight In",
        "acc_salaries_expense": "Salaries Expense",
        "acc_rent_expense": "Rent Expense",
        "acc_utilities_expense": "Utilities Expense",
        "acc_marketing_expense": "Marketing Expense",
        "acc_bank_admin_expense": "Bank Admin Expense",
        # Database Seed Names Fallbacks for dynamic translations (EN)
        "Kas": "Cash",
        "Bank": "Bank",
        "Piutang Usaha": "Accounts Receivable",
        "Uang Muka Operasional": "Operational Prepayments",
        "Persediaan Barang Dagang": "Inventory - Merchandise",
        "Persediaan Bahan Baku": "Inventory - Raw Material",
        "Persediaan Barang Dalam Proses (WIP)": "Inventory - Work in Progress (WIP)",
        "PPN Masukan": "Value Added Tax (VAT) In",
        "Aset Tetap - Bangunan": "Fixed Assets - Buildings",
        "Akum. Penyusutan Bangunan": "Accumulated Depreciation - Buildings",
        "Utang Usaha": "Accounts Payable",
        "Hutang Belum Ditagih": "Unbilled Liabilities",
        "Utang Gaji": "Salaries Payable",
        "Hutang PPh 21": "Taxes Payable (PPh 21)",
        "Hutang BPJS": "Social Security Payable (BPJS)",
        "PPN Keluaran": "Value Added Tax (VAT) Out",
        "Modal Pemilik": "Owner's Capital",
        "Laba Ditahan": "Retained Earnings",
        "Laba Tahun Berjalan": "Current Year Earnings",
        "Prive / Dividen": "Drawings / Dividends",
        "Pendapatan Penjualan": "Sales Revenue",
        "Pendapatan Lain-lain": "Other Revenue",
        "Beban Pokok Penjualan (HPP)": "Cost of Goods Sold (COGS)",
        "Beban Gaji & Upah": "Salaries & Wages Expense",
        "Beban Sewa": "Rent Expense",
        "Beban Listrik, Air & Internet": "Utilities Expense",
        "Beban Pemasaran": "Marketing Expense",
        "Beban Administrasi Bank": "Bank Administration Expense",
        "Beban Penyusutan": "Depreciation Expense",
        "Beban Operasional Lainnya": "Other Operating Expenses"
    }
}

def _format_rp(value: Decimal) -> str:
    if value == 0: return "0,00"
    if value < 0: return "(" + "{:,.2f}".format(abs(value)).replace(",", "X").replace(".", ",").replace("X", ".") + ")"
    return "{:,.2f}".format(value).replace(",", "X").replace(".", ",").replace("X", ".")

def _get_merged_accounts(db: Session, tenant_id: int, types: list) -> list:
    tenant_accounts = db.query(Account).filter(
        Account.tenant_id == tenant_id,
        Account.account_type.in_(types),
        ~Account.sub_accounts.any()
    ).all()
    tenant_codes = {a.code for a in tenant_accounts}
    global_accounts = db.query(Account).filter(
        Account.tenant_id == None,
        Account.account_type.in_(types),
        ~Account.sub_accounts.any(),
        ~Account.code.in_(tenant_codes)
    ).all()
    return tenant_accounts + global_accounts

def get_profit_loss(db: Session, tenant_id: int, start_date: date, end_date: date) -> dict:
    all_accounts = _get_merged_accounts(db, tenant_id, [AccountType.REVENUE, AccountType.EXPENSE])
    balances_query = db.query(
        JournalEntry.account_id,
        func.sum(JournalEntry.debit).label("total_debit"),
        func.sum(JournalEntry.credit).label("total_credit")
    ).join(Transaction, Transaction.id == JournalEntry.transaction_id)\
     .filter(
         Transaction.tenant_id == tenant_id,
         Transaction.status == TransactionStatus.POSTED,
         Transaction.transaction_date >= start_date,
         Transaction.transaction_date <= end_date
     ).group_by(JournalEntry.account_id).all()
    balances_map = {row.account_id: (row.total_debit or 0, row.total_credit or 0) for row in balances_query}

    revenues, cogs, expenses = [], [], []
    total_revenue, total_cogs, total_expense = Decimal('0'), Decimal('0'), Decimal('0')

    for acc in all_accounts:
        debit, credit = balances_map.get(acc.id, (0, 0))
        if acc.account_type == AccountType.REVENUE:
            balance = Decimal(str(credit)) - Decimal(str(debit))
            revenues.append({"account_code": acc.code, "account_name": acc.name, "balance": balance, "is_child": acc.parent_id is not None})
            total_revenue += balance
        elif acc.account_type == AccountType.EXPENSE:
            balance = Decimal(str(debit)) - Decimal(str(credit))
            item = {"account_code": acc.code, "account_name": acc.name, "balance": balance, "is_child": acc.parent_id is not None}
            if acc.code.startswith("5-"):
                cogs.append(item)
                total_cogs += balance
            else:
                expenses.append(item)
                total_expense += balance

    revenues.sort(key=lambda x: x['account_code'])
    cogs.sort(key=lambda x: x['account_code'])
    expenses.sort(key=lambda x: x['account_code'])
    return {
        "start_date": start_date, "end_date": end_date,
        "revenues": revenues, "total_revenue": total_revenue,
        "cogs": cogs, "total_cogs": total_cogs, "gross_profit": total_revenue - total_cogs,
        "expenses": expenses, "total_expense": total_expense, "net_profit": (total_revenue - total_cogs) - total_expense
    }

def get_balance_sheet(db: Session, tenant_id: int, start_date: date, end_date: date) -> dict:
    as_of_date = end_date
    all_accounts = _get_merged_accounts(db, tenant_id, [AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY])
    balances_query = db.query(
        JournalEntry.account_id,
        func.sum(JournalEntry.debit).label("total_debit"),
        func.sum(JournalEntry.credit).label("total_credit")
    ).join(Transaction, Transaction.id == JournalEntry.transaction_id)\
     .filter(Transaction.tenant_id == tenant_id, Transaction.status == TransactionStatus.POSTED, Transaction.transaction_date <= as_of_date).group_by(JournalEntry.account_id).all()
    balances_map = {row.account_id: (row.total_debit or 0, row.total_credit or 0) for row in balances_query}

    re_query = db.query(Account.account_type, func.sum(JournalEntry.debit).label("total_debit"), func.sum(JournalEntry.credit).label("total_credit")).join(JournalEntry, JournalEntry.account_id == Account.id).join(Transaction, Transaction.id == JournalEntry.transaction_id).filter(Account.tenant_id == tenant_id, Transaction.status == TransactionStatus.POSTED, Transaction.transaction_date <= as_of_date, Account.account_type.in_([AccountType.REVENUE, AccountType.EXPENSE])).group_by(Account.account_type).all()
    retained_earnings = Decimal('0.00')
    for row in re_query:
        if row.account_type == AccountType.REVENUE: retained_earnings += (Decimal(str(row.total_credit or 0)) - Decimal(str(row.total_debit or 0)))
        elif row.account_type == AccountType.EXPENSE: retained_earnings -= (Decimal(str(row.total_debit or 0)) - Decimal(str(row.total_credit or 0)))

    assets_lancar, assets_tetap, liabilities, equities = [], [], [], []
    total_lancar, total_tetap, total_liabilities, total_equity_direct = Decimal('0'), Decimal('0'), Decimal('0'), Decimal('0')

    for acc in all_accounts:
        debit, credit = balances_map.get(acc.id, (0, 0))
        if acc.account_type == AccountType.ASSET:
            balance = Decimal(str(debit)) - Decimal(str(credit))
            item = {"account_code": acc.code, "account_name": acc.name, "balance": balance, "is_child": acc.parent_id is not None}
            if acc.code.startswith("1-1"):
                assets_lancar.append(item); total_lancar += balance
            else:
                assets_tetap.append(item); total_tetap += balance
        elif acc.account_type == AccountType.LIABILITY:
            balance = Decimal(str(credit)) - Decimal(str(debit))
            liabilities.append({"account_code": acc.code, "account_name": acc.name, "balance": balance, "is_child": acc.parent_id is not None})
            total_liabilities += balance
        elif acc.account_type == AccountType.EQUITY:
            balance = Decimal(str(credit)) - Decimal(str(debit))
            equities.append({"account_code": acc.code, "account_name": acc.name, "balance": balance, "is_child": acc.parent_id is not None})
            total_equity_direct += balance

    equities.append({"account_code": "3-9999", "account_name": "acc_retained_earnings", "balance": retained_earnings, "is_child": True})
    assets_lancar.sort(key=lambda x: x['account_code'])
    assets_tetap.sort(key=lambda x: x['account_code'])
    liabilities.sort(key=lambda x: x['account_code'])
    equities.sort(key=lambda x: x['account_code'])

    return {
        "start_date": start_date, "end_date": end_date, "as_of_date": as_of_date,
        "assets_lancar": assets_lancar, "total_lancar": total_lancar,
        "assets_tetap": assets_tetap, "total_tetap": total_tetap,
        "total_assets": total_lancar + total_tetap,
        "liabilities": liabilities, "total_liabilities": total_liabilities,
        "equities": equities, "total_equity": total_equity_direct + retained_earnings,
        "total_liabilities_and_equity": total_liabilities + total_equity_direct + retained_earnings
    }

def get_equity_changes(db: Session, tenant_id: int, start_date: date, end_date: date) -> dict:
    opening_balance_query = db.query(Account.account_type, func.sum(JournalEntry.debit).label("total_debit"), func.sum(JournalEntry.credit).label("total_credit")).join(JournalEntry, JournalEntry.account_id == Account.id).join(Transaction, Transaction.id == JournalEntry.transaction_id).filter(Transaction.tenant_id == tenant_id, Transaction.status == TransactionStatus.POSTED, Transaction.transaction_date < start_date).group_by(Account.account_type).all()
    opening_equity = Decimal('0.00')
    for row in opening_balance_query:
        if row.account_type in [AccountType.EQUITY, AccountType.REVENUE]: opening_equity += (Decimal(str(row.total_credit or 0)) - Decimal(str(row.total_debit or 0)))
        elif row.account_type == AccountType.EXPENSE: opening_equity -= (Decimal(str(row.total_debit or 0)) - Decimal(str(row.total_credit or 0)))
    pl_report = get_profit_loss(db, tenant_id, start_date, end_date)
    net_profit = pl_report["net_profit"]
    equity_period_query = db.query(func.sum(JournalEntry.debit).label("withdrawals"), func.sum(JournalEntry.credit).label("additions")).join(Account, Account.id == JournalEntry.account_id).join(Transaction, Transaction.id == JournalEntry.transaction_id).filter(Account.tenant_id == tenant_id, Account.account_type == AccountType.EQUITY, Transaction.status == TransactionStatus.POSTED, Transaction.transaction_date >= start_date, Transaction.transaction_date <= end_date).first()
    withdrawals, additions = Decimal(str(equity_period_query.withdrawals or 0)), Decimal(str(equity_period_query.additions or 0))
    return {"start_date": start_date, "end_date": end_date, "opening_equity": opening_equity, "net_profit": net_profit, "withdrawals": withdrawals, "additions": additions, "closing_equity": opening_equity + net_profit + additions - withdrawals}

def get_cash_flow(db: Session, tenant_id: int, start_date: date, end_date: date) -> dict:
    # Use code-based identification for cash accounts (PSAK)
    opening_cash = db.query(func.sum(JournalEntry.debit - JournalEntry.credit)).join(Account, Account.id == JournalEntry.account_id).join(Transaction, Transaction.id == JournalEntry.transaction_id).filter(Account.tenant_id == tenant_id, Account.code.startswith("1-11"), Transaction.status == TransactionStatus.POSTED, Transaction.transaction_date < start_date).scalar() or Decimal('0.00')
    cash_flow_query = db.query(Transaction.transaction_type, func.sum(JournalEntry.debit - JournalEntry.credit).label("net_cash")).join(JournalEntry, JournalEntry.transaction_id == Transaction.id).join(Account, Account.id == JournalEntry.account_id).filter(Transaction.tenant_id == tenant_id, Transaction.status == TransactionStatus.POSTED, Transaction.transaction_date >= start_date, Transaction.transaction_date <= end_date, Account.code.startswith("1-11")).group_by(Transaction.transaction_type).all()
    operating_items, investing_items, financing_items = [], [], []
    total_operating, total_investing, total_financing = Decimal('0'), Decimal('0'), Decimal('0')
    for row in cash_flow_query:
        val, name = Decimal(str(row.net_cash)), f"Aktivitas {row.transaction_type.value.replace('_', ' ').capitalize()}"
        if row.transaction_type in [TransactionType.SALES, TransactionType.PURCHASE, TransactionType.INCOME, TransactionType.EXPENSE, TransactionType.OPERATIONAL]: operating_items.append({"name": name, "amount": val}); total_operating += val
        elif row.transaction_type in [TransactionType.CAPITAL]: financing_items.append({"name": name, "amount": val}); total_financing += val
        else: operating_items.append({"name": name, "amount": val}); total_operating += val
    net_cash_increase = total_operating + total_investing + total_financing
    return {"start_date": start_date, "end_date": end_date, "operating_activities": {"items": operating_items, "subtotal": total_operating}, "investing_activities": {"items": investing_items, "subtotal": total_investing}, "financing_activities": {"items": financing_items, "subtotal": total_financing}, "net_cash_increase": net_cash_increase, "opening_cash": opening_cash, "closing_cash": opening_cash + net_cash_increase}

def get_trial_balance(db: Session, tenant_id: int, start_date: date, end_date: date) -> dict:
    all_accounts = _get_merged_accounts(db, tenant_id, [
        AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY,
        AccountType.REVENUE, AccountType.EXPENSE
    ])
    
    # 1. Query akumulasi saldo sampai end_date khusus Akun Riil (Asset, Liability, Equity)
    real_balances_query = db.query(
        JournalEntry.account_id,
        func.sum(JournalEntry.debit).label("total_debit"),
        func.sum(JournalEntry.credit).label("total_credit")
    ).join(Transaction, Transaction.id == JournalEntry.transaction_id)\
     .join(Account, Account.id == JournalEntry.account_id)\
     .filter(
         Transaction.tenant_id == tenant_id,
         Transaction.status == TransactionStatus.POSTED,
         Transaction.transaction_date <= end_date,
         Account.account_type.in_([AccountType.ASSET, AccountType.LIABILITY, AccountType.EQUITY])
     ).group_by(JournalEntry.account_id).all()

    # 2. Query mutasi per periode (start_date s/d end_date) khusus Akun Nominal (Revenue, Expense)
    nominal_balances_query = db.query(
        JournalEntry.account_id,
        func.sum(JournalEntry.debit).label("total_debit"),
        func.sum(JournalEntry.credit).label("total_credit")
    ).join(Transaction, Transaction.id == JournalEntry.transaction_id)\
     .join(Account, Account.id == JournalEntry.account_id)\
     .filter(
         Transaction.tenant_id == tenant_id,
         Transaction.status == TransactionStatus.POSTED,
         Transaction.transaction_date >= start_date,
         Transaction.transaction_date <= end_date,
         Account.account_type.in_([AccountType.REVENUE, AccountType.EXPENSE])
     ).group_by(JournalEntry.account_id).all()
     
    balances_map = {row.account_id: (row.total_debit or 0, row.total_credit or 0) for row in real_balances_query}
    for row in nominal_balances_query:
        balances_map[row.account_id] = (row.total_debit or 0, row.total_credit or 0)
    
    accounts_data = []
    total_debit = Decimal('0.00')
    total_credit = Decimal('0.00')
    
    for acc in all_accounts:
        debit, credit = balances_map.get(acc.id, (0, 0))
        debit_dec = Decimal(str(debit))
        credit_dec = Decimal(str(credit))
        
        if acc.account_type in [AccountType.ASSET, AccountType.EXPENSE]:
            net = debit_dec - credit_dec
            if net >= 0:
                acc_debit = net
                acc_credit = Decimal('0.00')
            else:
                acc_debit = Decimal('0.00')
                acc_credit = abs(net)
        else:
            net = credit_dec - debit_dec
            if net >= 0:
                acc_debit = Decimal('0.00')
                acc_credit = net
            else:
                acc_debit = abs(net)
                acc_credit = Decimal('0.00')
                
        if acc_debit > 0 or acc_credit > 0 or debit_dec > 0 or credit_dec > 0:
            accounts_data.append({
                "account_code": acc.code,
                "account_name": acc.name,
                "debit": acc_debit,
                "credit": acc_credit,
                "is_child": acc.parent_id is not None
            })
            total_debit += acc_debit
            total_credit += acc_credit
            
    accounts_data.sort(key=lambda x: x['account_code'])
    return {
        "start_date": start_date,
        "end_date": end_date,
        "accounts": accounts_data,
        "total_debit": total_debit,
        "total_credit": total_credit
    }

def get_journals(db: Session, tenant_id: int, start_date: date, end_date: date) -> dict:
    entries = db.query(JournalEntry).join(
        Transaction, Transaction.id == JournalEntry.transaction_id
    ).join(
        Account, Account.id == JournalEntry.account_id
    ).filter(
        Transaction.tenant_id == tenant_id,
        Transaction.status == TransactionStatus.POSTED,
        Transaction.transaction_date >= start_date,
        Transaction.transaction_date <= end_date
    ).order_by(Transaction.transaction_date.asc(), Transaction.id.asc(), JournalEntry.id.asc()).all()

    journals_data = []
    total_debit = Decimal('0.00')
    total_credit = Decimal('0.00')
    
    for entry in entries:
        debit = Decimal(str(entry.debit or 0))
        credit = Decimal(str(entry.credit or 0))
        journals_data.append({
            "transaction_date": entry.transaction.transaction_date.isoformat(),
            "reference_no": entry.transaction.reference_no,
            "description": entry.transaction.description or "-",
            "account_code": entry.account.code,
            "account_name": entry.account.name,
            "debit": debit,
            "credit": credit
        })
        total_debit += debit
        total_credit += credit

    return {
        "start_date": start_date,
        "end_date": end_date,
        "entries": journals_data,
        "total_debit": total_debit,
        "total_credit": total_credit
    }

class YIOCPDF(FPDF):
    def __init__(self, store_name="BLONJO STORE", store_address="", store_phone="", lang="id"):
        super().__init__()
        self.store_name, self.store_address, self.store_phone, self.lang = store_name, store_address, store_phone, lang

    def header(self):
        self.set_font('Helvetica', 'B', 14); self.cell(0, 8, self.store_name.upper(), 0, 1, 'C')
        self.set_font('Helvetica', '', 8)
        header_line = self.store_address
        if self.store_phone: header_line += f"  |  WA: {self.store_phone}"
        if header_line: self.cell(0, 4, header_line, 0, 1, 'C')
        self.set_line_width(0.8); self.line(10, self.get_y() + 2, 200, self.get_y() + 2); self.ln(10)
        
    def footer(self):
        self.set_y(-15); self.set_font('Helvetica', 'I', 7); timestamp = datetime.now().strftime('%d/%m/%Y %H:%M')
        if self.lang == "en":
            footer_text = f"Report automatically generated by Blonjo Accounting System on {timestamp}"
            page_text = f"Page {self.page_no()} of {{nb}}"
        else:
            footer_text = f"Laporan digenerate otomatis oleh Sistem Akuntansi Blonjo pada {timestamp}"
            page_text = f"Halaman {self.page_no()} dari {{nb}}"
        self.cell(130, 10, footer_text, 0, 0, 'L')
        self.set_font('Helvetica', '', 7); self.cell(0, 10, page_text, 0, 0, 'R')

def generate_report_pdf(title: str, data: dict, report_type: str, store_name: str = "BLONJO STORE", store_address: str = "", store_phone: str = "", lang: str = "id") -> bytes:
    pdf = YIOCPDF(store_name, store_address, store_phone, lang=lang)
    pdf.alias_nb_pages(); pdf.add_page(); t_map = PDF_TRANSLATIONS.get(lang, PDF_TRANSLATIONS["id"])
    pdf.set_font('Helvetica', 'B', 12); pdf.cell(0, 6, t_map.get(report_type, title).upper(), 0, 1, 'C')
    pdf.set_font('Helvetica', '', 9)
    # Balance sheet and Transaction proof only show end_date (per date)
    if report_type in ["balance_sheet", "transaction_proof"]:
        period_str = f"{t_map['per_date']} {datetime.strptime(str(data.get('end_date')), '%Y-%m-%d').strftime('%d/%m/%Y')}"
    else:
        period_str = f"{datetime.strptime(str(data.get('start_date')), '%Y-%m-%d').strftime('%d/%m/%Y')} - {datetime.strptime(str(data.get('end_date')), '%Y-%m-%d').strftime('%d/%m/%Y')}"
    
    pdf.cell(0, 5, period_str, 0, 1, 'C'); pdf.cell(0, 5, "(dalam IDR)", 0, 1, 'C'); pdf.ln(5)

    pdf.set_fill_color(135, 206, 235); pdf.set_text_color(255, 255, 255); pdf.set_font('Helvetica', 'B', 9)
    pdf.cell(130, 8, " " + (t_map['period'] if report_type != "balance_sheet" else ""), 0, 0, 'L', True)
    pdf.cell(60, 8, period_str + " ", 0, 1, 'R', True); pdf.set_text_color(0, 0, 0); pdf.ln(2)

    def draw_row(code, name, value, is_child=False, is_bold=False, underline=False, is_title=False, half=False):
        pdf.set_font('Helvetica', 'B' if is_bold else '', 8 if half else 9)
        indent = "        " if is_child else ""
        d_name = t_map.get(name, name)
        label = f"{code}    {d_name}" if code else d_name
        pdf.cell(65 if half else 130, 7, indent + label, 0, 0)
        
        val_str = _format_rp(value) if not is_title else ""
        
        # Capture current position before printing value for correct underline
        val_x = pdf.get_x()
        val_y = pdf.get_y()
        w = 30 if half else 60
        
        pdf.cell(w, 7, val_str, 0, 1, 'R')
        
        if underline and not is_title:
            pdf.set_line_width(0.2) # Normal line, not bold
            # Use captured coordinates: draw line from current val_x to val_x + w
            pdf.line(val_x, val_y + 6.5, val_x + w, val_y + 6.5)
            pdf.set_line_width(0.2) # Keep it thin for subsequent lines if any

    if report_type == "profit_loss":
        draw_row(None, "revenue", 0, False, True, is_title=True)
        for acc in data['revenues']: draw_row(acc['account_code'], acc['account_name'], acc['balance'], True)
        draw_row(None, t_map['total'] + " " + t_map['revenue'], data['total_revenue'], False, True, True); pdf.ln(2)
        draw_row(None, "cogs", 0, False, True, is_title=True)
        for acc in data['cogs']: draw_row(acc['account_code'], acc['account_name'], acc['balance'], True)
        draw_row(None, t_map['total'] + " " + t_map['cogs'], data['total_cogs'], False, True, True); pdf.ln(2)
        draw_row(None, "gross_profit", data['gross_profit'], False, True); pdf.ln(4)
        draw_row(None, "expenses", 0, False, True, is_title=True)
        for acc in data['expenses']: draw_row(acc['account_code'], acc['account_name'], acc['balance'], True)
        draw_row(None, t_map['total'] + " " + t_map['expenses'], data['total_expense'], False, True, True); pdf.ln(4)
        pdf.set_font('Helvetica', 'B', 11); pdf.cell(130, 10, t_map['net_profit'], 0); pdf.cell(60, 10, _format_rp(data['net_profit']), 0, 1, 'R')

    elif report_type == "balance_sheet":
        pdf.set_font('Helvetica', 'B', 9); pdf.cell(95, 8, t_map['assets'], 0, 0); pdf.cell(95, 8, t_map['liabilities'].upper() + " & " + t_map['equity'].upper(), 0, 1); pdf.set_line_width(0.8); pdf.line(10, pdf.get_y(), 200, pdf.get_y()); base_y = pdf.get_y() + 2
        # LEFT: ASSETS
        pdf.set_y(base_y); draw_row(None, "current_assets", 0, True, True, is_title=True, half=True)
        for acc in data['assets_lancar']:
            pdf.set_font('Helvetica', '', 8); pdf.cell(65, 6, "        " + acc['account_code'] + "  " + t_map.get(acc['account_name'], acc['account_name']), 0, 0); pdf.cell(30, 6, _format_rp(acc['balance']), 0, 1, 'R')
        pdf.set_font('Helvetica', 'B', 8); pdf.cell(65, 6, t_map['total'] + " " + t_map['current_assets'], 0, 0); pdf.cell(30, 6, _format_rp(data['total_lancar']), 'T', 1, 'R')
        pdf.ln(2); draw_row(None, "fixed_assets", 0, True, True, is_title=True, half=True)
        for acc in data['assets_tetap']:
            pdf.set_font('Helvetica', '', 8); pdf.cell(65, 6, "        " + acc['account_code'] + "  " + t_map.get(acc['account_name'], acc['account_name']), 0, 0); pdf.cell(30, 6, _format_rp(acc['balance']), 0, 1, 'R')
        pdf.set_font('Helvetica', 'B', 8); pdf.cell(65, 6, t_map['total'] + " " + t_map['fixed_assets'], 0, 0); pdf.cell(30, 6, _format_rp(data['total_tetap']), 'T', 1, 'R')
        y_left = pdf.get_y()
        # RIGHT: LIABILITIES & EQUITY
        pdf.set_xy(105, base_y); pdf.set_font('Helvetica', 'B', 8); pdf.cell(95, 6, t_map['liabilities'], 0, 1, 'L')
        for acc in data['liabilities']:
            pdf.set_x(105); pdf.set_font('Helvetica', '', 8); pdf.cell(65, 6, "        " + acc['account_code'] + "  " + t_map.get(acc['account_name'], acc['account_name']), 0, 0); pdf.cell(30, 6, _format_rp(acc['balance']), 0, 1, 'R')
        pdf.set_x(105); pdf.ln(2); pdf.set_x(105); pdf.set_font('Helvetica', 'B', 8); pdf.cell(95, 6, t_map['equity'], 0, 1, 'L')
        for acc in data['equities']:
            pdf.set_x(105); pdf.set_font('Helvetica', '', 8); pdf.cell(65, 6, "        " + acc['account_code'] + "  " + t_map.get(acc['account_name'], acc['account_name']), 0, 0); pdf.cell(30, 6, _format_rp(acc['balance']), 0, 1, 'R')
        y_right = pdf.get_y(); final_y = max(y_left, y_right) + 5
        pdf.set_y(final_y); pdf.set_line_width(0.5); pdf.line(10, final_y, 200, final_y); pdf.set_font('Helvetica', 'B', 9); pdf.cell(65, 10, t_map['total'] + " " + t_map['assets'], 0, 0); pdf.cell(30, 10, _format_rp(data['total_assets']), 0, 0, 'R'); pdf.set_x(105); pdf.cell(65, 10, t_map['total_liabilities_equity'], 0, 0); pdf.cell(30, 10, _format_rp(data['total_liabilities_and_equity']), 0, 1, 'R')

    elif report_type == "equity_changes":
        draw_row(None, t_map['opening_equity'], data['opening_equity'], False, True)
        draw_row(None, "net_profit", data['net_profit'], True)
        draw_row(None, "additions", data.get('additions', 0), True)
        draw_row(None, "withdrawals", data['withdrawals'], True); pdf.ln(5); draw_row(None, t_map['closing_equity'], data['closing_equity'], False, True, True)

    elif report_type == "cash_flow":
        sections = [("operating", data['operating_activities']), ("investing", data['investing_activities']), ("financing", data['financing_activities'])]
        for k, s in sections:
            draw_row(None, k, 0, False, True, is_title=True)
            for itm in s['items']: draw_row(None, itm['name'], itm['amount'], True)
            draw_row(None, t_map['total'] + " " + t_map[k], s['subtotal'], False, True, True); pdf.ln(4)
        pdf.ln(5); draw_row(None, "cash_increase", data['net_cash_increase'], False, True); draw_row(None, "opening_cash", data['opening_cash'], False, False); pdf.ln(2); draw_row(None, "closing_cash", data['closing_cash'], False, True, True)

    elif report_type == "trial_balance":
        pdf.set_fill_color(240, 240, 240); pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(30, 8, " " + t_map['account_code'], 1, 0, 'L', True)
        pdf.cell(100, 8, " " + t_map['account_name'], 1, 0, 'L', True)
        pdf.cell(30, 8, t_map['debit'] + " ", 1, 0, 'R', True)
        pdf.cell(30, 8, t_map['credit'] + " ", 1, 1, 'R', True)
        
        pdf.set_font('Helvetica', '', 9)
        for acc in data['accounts']:
            indent = "    " if acc['is_child'] else ""
            acc_name = t_map.get(acc['account_name'], acc['account_name'])
            
            pdf.cell(30, 7, " " + acc['account_code'], 'LBR', 0, 'L')
            pdf.cell(100, 7, indent + acc_name, 'LBR', 0, 'L')
            
            debit_str = _format_rp(acc['debit']) if acc['debit'] > 0 else "-"
            credit_str = _format_rp(acc['credit']) if acc['credit'] > 0 else "-"
            
            pdf.cell(30, 7, debit_str + " ", 'LBR', 0, 'R')
            pdf.cell(30, 7, credit_str + " ", 'LBR', 1, 'R')
            
        pdf.ln(2)
        pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(130, 8, t_map['total'] + " ", 1, 0, 'R', True)
        pdf.cell(30, 8, _format_rp(data['total_debit']) + " ", 1, 0, 'R', True)
        pdf.cell(30, 8, _format_rp(data['total_credit']) + " ", 1, 1, 'R', True)

    elif report_type == "transaction_proof":
        # Specific layout for Journal Voucher
        pdf.set_font('Helvetica', 'B', 10)
        pdf.cell(40, 7, "No. Referensi", 0, 0); pdf.cell(0, 7, ": " + str(data.get('reference_no', '-')), 0, 1)
        pdf.cell(40, 7, t_map['per_date'], 0, 0); pdf.cell(0, 7, ": " + datetime.strptime(str(data.get('end_date')), '%Y-%m-%d').strftime('%d/%m/%Y'), 0, 1)
        # Bersihkan karakter khusus dari deskripsi bukti jurnal
        desc_raw = str(data.get('description', '-')).replace("•", "-").replace("“", "\"").replace("”", "\"").replace("’", "'")
        clean_desc = "".join(c for c in desc_raw if ord(c) < 128)
        pdf.cell(40, 7, t_map['label_description'], 0, 0); pdf.multi_cell(0, 7, ": " + clean_desc, 0, 1); pdf.ln(5)
        
        # Table Header
        pdf.set_fill_color(240, 240, 240); pdf.set_font('Helvetica', 'B', 9)
        pdf.cell(30, 8, t_map['account_code'], 1, 0, 'C', True)
        pdf.cell(80, 8, t_map['account_name'], 1, 0, 'C', True)
        pdf.cell(40, 8, t_map['debit'], 1, 0, 'C', True)
        pdf.cell(40, 8, t_map['credit'], 1, 1, 'C', True)
        
        pdf.set_font('Helvetica', '', 9)
        total_debit = 0
        total_credit = 0
        for entry in data.get('entries', []):
            h = 7
            lines = pdf.multi_cell(80, h, entry['account_name'], split_only=True)
            nb_lines = max(1, len(lines))
            row_height = nb_lines * h
            
            if pdf.get_y() + row_height > 275:
                pdf.add_page()
                pdf.set_fill_color(240, 240, 240); pdf.set_font('Helvetica', 'B', 9)
                pdf.cell(30, 8, t_map['account_code'], 1, 0, 'C', True)
                pdf.cell(80, 8, t_map['account_name'], 1, 0, 'C', True)
                pdf.cell(40, 8, t_map['debit'], 1, 0, 'C', True)
                pdf.cell(40, 8, t_map['credit'], 1, 1, 'C', True)
                pdf.set_font('Helvetica', '', 9)
                
            x, y = pdf.get_x(), pdf.get_y()
            pdf.cell(30, row_height, str(entry['account_code']), 1, 0, 'C')
            
            pdf.set_xy(x + 30, y)
            pdf.multi_cell(80, h, entry['account_name'], 1, 'L')
            
            pdf.set_xy(x + 110, y)
            pdf.cell(40, row_height, _format_rp(entry['debit']), 1, 0, 'R')
            pdf.cell(40, row_height, _format_rp(entry['credit']), 1, 1, 'R')
            pdf.set_y(y + row_height)
            
    elif report_type == "journal_list":
        # Layout Spesifik Laporan Jurnal
        pdf.set_font('Helvetica', 'B', 10)
        pdf.cell(0, 7, t_map['period'] + ": " + 
                 datetime.strptime(str(data.get('start_date')), '%Y-%m-%d').strftime('%d/%m/%Y') + " - " + 
                 datetime.strptime(str(data.get('end_date')), '%Y-%m-%d').strftime('%d/%m/%Y'), 0, 1, 'C')
        pdf.ln(5)

        # Table Header
        pdf.set_fill_color(240, 240, 240); pdf.set_font('Helvetica', 'B', 8)
        pdf.cell(20, 8, "Tanggal", 1, 0, 'C', True)
        pdf.cell(26, 8, "No. Ref", 1, 0, 'C', True)
        pdf.cell(62, 8, "Keterangan", 1, 0, 'C', True)
        pdf.cell(30, 8, "Akun", 1, 0, 'C', True)
        pdf.cell(26, 8, t_map['debit'], 1, 0, 'C', True)
        pdf.cell(26, 8, t_map['credit'], 1, 1, 'C', True)

        pdf.set_font('Helvetica', '', 8)
        h = 7
        for entry in data.get('entries', []):
            clean_desc = "".join(c for c in str(entry['description']) if ord(c) < 128)
            lines = pdf.multi_cell(62, h, clean_desc, split_only=True)
            nb_lines = max(1, len(lines))
            row_height = nb_lines * h
            
            if pdf.get_y() + row_height > 275:
                pdf.add_page()
                pdf.set_fill_color(240, 240, 240); pdf.set_font('Helvetica', 'B', 8)
                pdf.cell(20, 8, "Tanggal", 1, 0, 'C', True)
                pdf.cell(26, 8, "No. Ref", 1, 0, 'C', True)
                pdf.cell(62, 8, "Keterangan", 1, 0, 'C', True)
                pdf.cell(30, 8, "Akun", 1, 0, 'C', True)
                pdf.cell(26, 8, t_map['debit'], 1, 0, 'C', True)
                pdf.cell(26, 8, t_map['credit'], 1, 1, 'C', True)
                pdf.set_font('Helvetica', '', 8)
                
            x, y = pdf.get_x(), pdf.get_y()
            pdf.cell(20, row_height, datetime.strptime(str(entry['transaction_date']), '%Y-%m-%d').strftime('%d/%m/%y'), 1, 0, 'C')
            pdf.cell(26, row_height, str(entry['reference_no']), 1, 0, 'C')
            
            pdf.set_xy(x + 46, y)
            pdf.multi_cell(62, h, clean_desc, 1, 'L')
            
            pdf.set_xy(x + 108, y)
            acc_label = f"{entry['account_code']} {entry['account_name']}"
            if len(acc_label) > 17:
                acc_label = acc_label[:15] + ".."
            pdf.cell(30, row_height, acc_label, 1, 0, 'L')
            
            deb_val = float(entry['debit'] or 0)
            cred_val = float(entry['credit'] or 0)
            
            pdf.cell(26, row_height, _format_rp(deb_val) if deb_val > 0 else "-", 1, 0, 'R')
            pdf.cell(26, row_height, _format_rp(cred_val) if cred_val > 0 else "-", 1, 1, 'R')
            pdf.set_y(y + row_height)
            
        pdf.set_font('Helvetica', 'B', 8)
        pdf.cell(138, 8, t_map['total'], 1, 0, 'R', True)
        pdf.cell(26, 8, _format_rp(data.get('total_debit', 0)), 1, 0, 'R', True)
        pdf.cell(26, 8, _format_rp(data.get('total_credit', 0)), 1, 1, 'R', True)

    elif report_type == "general_ledger":
        # Layout Spesifik Buku Besar (General Ledger)
        pdf.set_font('Helvetica', 'B', 10)
        # Menampilkan detail akun Buku Besar yang dipilih
        acc_label = f"{data.get('account_code', '')} - {t_map.get(data.get('account_name', ''), data.get('account_name', ''))}"
        pdf.cell(40, 7, t_map['account_name'], 0, 0); pdf.cell(0, 7, ": " + acc_label, 0, 1)
        pdf.ln(3)

        # Table Header
        pdf.set_fill_color(240, 240, 240); pdf.set_font('Helvetica', 'B', 8)
        pdf.cell(22, 8, t_map['table_date'] if 'table_date' in t_map else "Tanggal", 1, 0, 'C', True)
        pdf.cell(28, 8, t_map['table_ref_no'] if 'table_ref_no' in t_map else "No. Ref", 1, 0, 'C', True)
        pdf.cell(60, 8, t_map['label_description'] if 'label_description' in t_map else "Keterangan", 1, 0, 'C', True)
        pdf.cell(26, 8, t_map['debit'], 1, 0, 'C', True)
        pdf.cell(26, 8, t_map['credit'], 1, 0, 'C', True)
        pdf.cell(28, 8, t_map['running_balance'], 1, 1, 'C', True)

        pdf.set_font('Helvetica', '', 8)
        h = 7
        
        # 1. Baris Saldo Awal (Opening Balance)
        pdf.cell(22, h, datetime.strptime(str(data.get('start_date')), '%Y-%m-%d').strftime('%d/%m/%Y'), 1, 0, 'C')
        pdf.cell(28, h, "-", 1, 0, 'C')
        pdf.set_font('Helvetica', 'B', 8)
        pdf.cell(60, h, t_map['opening_balance'], 1, 0, 'L')
        pdf.set_font('Helvetica', '', 8)
        pdf.cell(26, h, "-", 1, 0, 'R')
        pdf.cell(26, h, "-", 1, 0, 'R')
        pdf.set_font('Helvetica', 'B', 8)
        pdf.cell(28, h, _format_rp(data.get('opening_balance', 0)), 1, 1, 'R')
        pdf.set_font('Helvetica', '', 8)

        # 2. Baris Mutasi
        total_debit = 0
        total_credit = 0
        for mut in data.get('mutations', []):
            desc_raw = str(mut['description']).replace("•", "-").replace("“", "\"").replace("”", "\"").replace("’", "'")
            clean_desc = "".join(c for c in desc_raw if ord(c) < 128)
            
            # Hitung jumlah baris deskripsi secara dinamis
            lines = pdf.multi_cell(60, h, clean_desc, split_only=True)
            nb_lines = max(1, len(lines))
            row_height = nb_lines * h
            
            # Auto Page Break Check agar baris tidak terpotong setengah halaman
            if pdf.get_y() + row_height > 275:
                pdf.add_page()
                # Gambar ulang header tabel di halaman baru
                pdf.set_fill_color(240, 240, 240); pdf.set_font('Helvetica', 'B', 8)
                pdf.cell(22, 8, t_map.get('table_date', 'Tanggal'), 1, 0, 'C', True)
                pdf.cell(28, 8, t_map.get('table_ref_no', 'No. Ref'), 1, 0, 'C', True)
                pdf.cell(60, 8, t_map.get('label_description', 'Keterangan'), 1, 0, 'C', True)
                pdf.cell(26, 8, t_map['debit'], 1, 0, 'C', True)
                pdf.cell(26, 8, t_map['credit'], 1, 0, 'C', True)
                pdf.cell(28, 8, t_map['running_balance'], 1, 1, 'C', True)
                pdf.set_font('Helvetica', '', 8)

            x = pdf.get_x()
            y = pdf.get_y()

            # Gambar kolom Tanggal & Ref dengan tinggi dinamis row_height
            pdf.cell(22, row_height, datetime.strptime(str(mut['transaction_date']), '%Y-%m-%d').strftime('%d/%m/%Y'), 1, 0, 'C')
            pdf.cell(28, row_height, str(mut['reference_no'] or '-'), 1, 0, 'C')
            
            # Gambar Deskripsi dengan multi_cell (tinggi line-space h)
            pdf.multi_cell(60, h, clean_desc, 1, 'L')
            
            # Kembalikan koordinat x, y ke posisi samping deskripsi untuk menggambar sisa sel
            pdf.set_xy(x + 110, y)
            
            deb_val = float(mut['debit'])
            cred_val = float(mut['credit'])
            total_debit += deb_val
            total_credit += cred_val
            
            pdf.cell(26, row_height, _format_rp(deb_val) if deb_val > 0 else "-", 1, 0, 'R')
            pdf.cell(26, row_height, _format_rp(cred_val) if cred_val > 0 else "-", 1, 0, 'R')
            pdf.cell(28, row_height, _format_rp(float(mut['running_balance'])), 1, 1, 'R')

        # 3. Baris Saldo Akhir (Closing Balance)
        pdf.set_font('Helvetica', 'B', 8)
        if pdf.get_y() + h > 275:
            pdf.add_page()
        pdf.cell(22, h, datetime.strptime(str(data.get('end_date')), '%Y-%m-%d').strftime('%d/%m/%Y'), 1, 0, 'C', True)
        pdf.cell(28, h, "-", 1, 0, 'C', True)
        pdf.cell(60, h, t_map['closing_balance'], 1, 0, 'L', True)
        pdf.cell(26, h, _format_rp(total_debit) if total_debit > 0 else "-", 1, 0, 'R', True)
        pdf.cell(26, h, _format_rp(total_credit) if total_credit > 0 else "-", 1, 0, 'R', True)
        pdf.cell(28, h, _format_rp(data.get('closing_balance', 0)), 1, 1, 'R', True)

    return bytes(pdf.output())
