from app.core.database import SessionLocal
from app.models.accounting import Account, AccountType

def seed_standard_coa():
    db = SessionLocal()
    
    # Standard PSAK EMKM Hierarchy Groups (Headers) with i18n keys
    headers = [
        {"code": "1-0000", "name": "acc_header_assets", "account_type": AccountType.ASSET},
        {"code": "1-1000", "name": "acc_header_current_assets", "account_type": AccountType.ASSET, "parent_code": "1-0000"},
        {"code": "1-2000", "name": "acc_header_fixed_assets", "account_type": AccountType.ASSET, "parent_code": "1-0000"},
        
        {"code": "2-0000", "name": "acc_header_liabilities", "account_type": AccountType.LIABILITY},
        {"code": "2-1000", "name": "acc_header_current_liabilities", "account_type": AccountType.LIABILITY, "parent_code": "2-0000"},
        {"code": "2-2000", "name": "acc_header_long_term_liabilities", "account_type": AccountType.LIABILITY, "parent_code": "2-0000"},
        
        {"code": "3-0000", "name": "acc_header_equity", "account_type": AccountType.EQUITY},
        
        {"code": "4-0000", "name": "acc_header_revenue", "account_type": AccountType.REVENUE},
        {"code": "4-1000", "name": "acc_header_operating_revenue", "account_type": AccountType.REVENUE, "parent_code": "4-0000"},
        
        {"code": "5-0000", "name": "acc_header_cogs", "account_type": AccountType.EXPENSE},
        
        {"code": "6-0000", "name": "acc_header_operating_expenses", "account_type": AccountType.EXPENSE},
    ]

    # 2. Operational Accounts (Leafs) with i18n keys
    leafs = [
        # Assets
        {"code": "1-1101", "name": "acc_petty_cash", "account_type": AccountType.ASSET, "parent_code": "1-1000"},
        {"code": "1-1102", "name": "acc_bank", "account_type": AccountType.ASSET, "parent_code": "1-1000"},
        {"code": "1-1201", "name": "acc_accounts_receivable", "account_type": AccountType.ASSET, "parent_code": "1-1000"},
        {"code": "1-1301", "name": "acc_inventory_merchandise", "account_type": AccountType.ASSET, "parent_code": "1-1000"},
        {"code": "1-1302", "name": "acc_inventory_raw_material", "account_type": AccountType.ASSET, "parent_code": "1-1000"},
        {"code": "1-2201", "name": "acc_buildings", "account_type": AccountType.ASSET, "parent_code": "1-2000"},
        {"code": "1-2202", "name": "acc_accum_depr_buildings", "account_type": AccountType.ASSET, "parent_code": "1-2000"},
        {"code": "1-2301", "name": "acc_equipment_machinery", "account_type": AccountType.ASSET, "parent_code": "1-2000"},
        {"code": "1-2302", "name": "acc_accum_depr_equipment", "account_type": AccountType.ASSET, "parent_code": "1-2000"},
        
        # Liabilities
        {"code": "2-1101", "name": "acc_accounts_payable", "account_type": AccountType.LIABILITY, "parent_code": "2-1000"},
        {"code": "2-1201", "name": "acc_salaries_payable", "account_type": AccountType.LIABILITY, "parent_code": "2-1000"},
        {"code": "2-1301", "name": "acc_taxes_payable", "account_type": AccountType.LIABILITY, "parent_code": "2-1000"},
        {"code": "2-2101", "name": "acc_bank_loan_long", "account_type": AccountType.LIABILITY, "parent_code": "2-2000"},
        
        # Equity
        {"code": "3-1101", "name": "acc_owners_capital", "account_type": AccountType.EQUITY, "parent_code": "3-0000"},
        {"code": "3-1201", "name": "acc_retained_earnings", "account_type": AccountType.EQUITY, "parent_code": "3-0000"},
        {"code": "3-1401", "name": "acc_drawings_dividends", "account_type": AccountType.EQUITY, "parent_code": "3-0000"},
        
        # Revenue
        {"code": "4-1101", "name": "acc_sales_revenue", "account_type": AccountType.REVENUE, "parent_code": "4-1000"},
        {"code": "4-2101", "name": "acc_other_revenue", "account_type": AccountType.REVENUE, "parent_code": "4-0000"},
        
        # COGS
        {"code": "5-1101", "name": "acc_cogs", "account_type": AccountType.EXPENSE, "parent_code": "5-0000"},
        {"code": "5-1201", "name": "acc_purchase_freight", "account_type": AccountType.EXPENSE, "parent_code": "5-0000"},
        
        # Operational Expenses
        {"code": "6-1101", "name": "acc_salaries_expense", "account_type": AccountType.EXPENSE, "parent_code": "6-0000"},
        {"code": "6-1201", "name": "acc_rent_expense", "account_type": AccountType.EXPENSE, "parent_code": "6-0000"},
        {"code": "6-1301", "name": "acc_utilities_expense", "account_type": AccountType.EXPENSE, "parent_code": "6-0000"},
        {"code": "6-1401", "name": "acc_marketing_expense", "account_type": AccountType.EXPENSE, "parent_code": "6-0000"},
        {"code": "6-1801", "name": "acc_bank_admin_expense", "account_type": AccountType.EXPENSE, "parent_code": "6-0000"},
    ]

    # Delete existing global accounts to replace with i18n keys
    db.query(Account).filter(Account.tenant_id == None).delete()
    db.commit()

    added_count = 0
    # First Pass: Create all accounts
    all_data = headers + leafs
    for data in all_data:
        new_acc = Account(
            code=data["code"],
            name=data["name"],
            account_type=data["account_type"],
            tenant_id=None
        )
        db.add(new_acc)
        added_count += 1
    db.commit()

    # Second Pass: Link parents
    for data in all_data:
        if "parent_code" in data:
            child = db.query(Account).filter(Account.code == data["code"], Account.tenant_id == None).first()
            parent = db.query(Account).filter(Account.code == data["parent_code"], Account.tenant_id == None).first()
            if child and parent:
                child.parent_id = parent.id
    
    db.commit()
    db.close()
    print(f"Successfully seeded {added_count} i18n-ready standard accounts (PSAK 2026).")

if __name__ == "__main__":
    seed_standard_coa()
