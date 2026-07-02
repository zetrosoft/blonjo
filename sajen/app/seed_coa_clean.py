from app.core.database import SessionLocal
from app.models.accounting import Account

def clean_account_names():
    db = SessionLocal()
    accounts = db.query(Account).all()
    
    mapping = {
        "acc_header_assets": "Aset",
        "acc_header_current_assets": "Aset Lancar",
        "acc_header_fixed_assets": "Aset Tidak Lancar",
        "acc_header_liabilities": "Liabilitas",
        "acc_header_current_liabilities": "Kewajiban Jangka Pendek",
        "acc_header_long_term_liabilities": "Kewajiban Jangka Panjang",
        "acc_header_equity": "Ekuitas",
        "acc_header_revenue": "Pendapatan",
        "acc_header_operating_revenue": "Pendapatan Usaha",
        "acc_header_cogs": "Beban Pokok Penjualan",
        "acc_header_operating_expenses": "Beban Operasional",
        "acc_petty_cash": "Kas",
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
        "acc_bank_loan_long": "Utang Bank Jangka Panjang",
        "acc_owners_capital": "Modal Pemilik",
        "acc_retained_earnings": "Laba Ditahan",
        "acc_drawings_dividends": "Prive / Dividen",
        "acc_sales_revenue": "Pendapatan Penjualan",
        "acc_other_revenue": "Pendapatan Lain-lain",
        "acc_cogs": "Beban Pokok Penjualan (HPP)",
        "acc_purchase_freight": "Beban Angkut Pembelian",
        "acc_salaries_expense": "Beban Gaji & Upah",
        "acc_rent_expense": "Beban Sewa",
        "acc_utilities_expense": "Beban Listrik, Air & Internet",
        "acc_marketing_expense": "Beban Pemasaran",
        "acc_bank_admin_expense": "Beban Administrasi Bank",
    }
    
    count = 0
    for acc in accounts:
        if acc.name in mapping:
            acc.name = mapping[acc.name]
            count += 1
            
    db.commit()
    print(f"Berhasil membersihkan {count} nama akun.")
    db.close()

if __name__ == "__main__":
    clean_account_names()
