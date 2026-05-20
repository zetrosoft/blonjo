from app.core.database import SessionLocal
from app.models.accounting import Account, AccountType

def seed_standard_coa():
    db = SessionLocal()
    
    # Standard PSAK UMKM Chart of Accounts
    accounts = [
        # ASSETS (HARTA)
        {"code": "1-1000", "name": "Kas Utama", "account_type": AccountType.ASSET},
        {"code": "1-1100", "name": "Kas Bank", "account_type": AccountType.ASSET},
        {"code": "1-1200", "name": "Piutang Usaha", "account_type": AccountType.ASSET},
        {"code": "1-1300", "name": "Persediaan Barang Dagang", "account_type": AccountType.ASSET},
        
        # LIABILITIES (KEWAJIBAN)
        {"code": "2-1000", "name": "Hutang Dagang", "account_type": AccountType.LIABILITY},
        {"code": "2-1100", "name": "Hutang Pajak (PPN)", "account_type": AccountType.LIABILITY},
        
        # EQUITY (MODAL)
        {"code": "3-1000", "name": "Modal Pemilik", "account_type": AccountType.EQUITY},
        {"code": "3-2000", "name": "Prive (Penarikan Pribadi)", "account_type": AccountType.EQUITY},
        {"code": "3-3000", "name": "Laba Ditahan", "account_type": AccountType.EQUITY},
        
        # REVENUE (PENDAPATAN)
        {"code": "4-1000", "name": "Pendapatan Penjualan", "account_type": AccountType.REVENUE},
        {"code": "4-2000", "name": "Pendapatan Lain-lain", "account_type": AccountType.REVENUE},
        
        # EXPENSES (BEBAN)
        {"code": "5-1000", "name": "Harga Pokok Penjualan (HPP)", "account_type": AccountType.EXPENSE},
        {"code": "6-1000", "name": "Beban Gaji Karyawan", "account_type": AccountType.EXPENSE},
        {"code": "6-2000", "name": "Beban Listrik & Air", "account_type": AccountType.EXPENSE},
        {"code": "6-3000", "name": "Beban Sewa Tempat", "account_type": AccountType.EXPENSE},
        {"code": "6-4000", "name": "Beban Pemasaran/Iklan", "account_type": AccountType.EXPENSE},
    ]
    
    added_count = 0
    for acc_data in accounts:
        exists = db.query(Account).filter(Account.code == acc_data["code"]).first()
        if not exists:
            new_acc = Account(**acc_data)
            db.add(new_acc)
            added_count += 1
            
    db.commit()
    db.close()
    print(f"Successfully seeded {added_count} new standard accounts.")

if __name__ == "__main__":
    seed_standard_coa()
