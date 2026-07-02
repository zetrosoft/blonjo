from app.core.database import SessionLocal
from app.models.accounting import JournalMapping, JournalMappingLine, Account, TransactionType, AccountType
from sqlalchemy import or_

def seed_psak_complete():
    db = SessionLocal()
    tenant_id = 1
    
    # 1. Pastikan Akun-Akun Pendukung Ada
    needed_accounts = [
        {"code": "1-1401", "name": "PPN Masukan", "type": AccountType.ASSET},
        {"code": "2-1401", "name": "PPN Keluaran", "type": AccountType.LIABILITY},
        {"code": "2-1202", "name": "Hutang PPh 21", "type": AccountType.LIABILITY},
        {"code": "2-1203", "name": "Hutang BPJS", "type": AccountType.LIABILITY},
        {"code": "2-1102", "name": "Hutang Belum Ditagih", "type": AccountType.LIABILITY},
        {"code": "1-1303", "name": "Persediaan Barang Dalam Proses (WIP)", "type": AccountType.ASSET},
        {"code": "1-1202", "name": "Uang Muka Operasional", "type": AccountType.ASSET},
    ]
    
    for acc in needed_accounts:
        existing = db.query(Account).filter(Account.code == acc["code"], Account.tenant_id == tenant_id).first()
        if not existing:
            db.add(Account(
                tenant_id=tenant_id,
                code=acc["code"],
                name=acc["name"],
                account_type=acc["type"],
                is_active=True
            ))
    db.commit()

    # Helper get account
    def get_id(code):
        a = db.query(Account).filter(Account.code == code, Account.tenant_id == tenant_id).first()
        return a.id if a else None

    # Hapus mapping lama untuk tenant 1
    mappings = db.query(JournalMapping).filter(JournalMapping.tenant_id == tenant_id).all()
    for m in mappings:
        db.query(JournalMappingLine).filter(JournalMappingLine.mapping_id == m.id).delete()
        db.delete(m)
    db.commit()

    # 2. SEED MAPPINGS (Berdasarkan Dokumen PSAK)
    
    # 2.1 Penjualan Tunai (MULTI PAIR)
    # Debit: Kas, Debit: HPP | Kredit: Pendapatan, Kredit: Persediaan
    m_sales = JournalMapping(tenant_id=tenant_id, transaction_type=TransactionType.SALES, description="Penjualan Tunai (PSAK Perpetual)", is_active=True)
    db.add(m_sales); db.flush()
    db.add(JournalMappingLine(mapping_id=m_sales.id, account_id=get_id("1-1101"), side="debit", value_type="total_amount")) # Kas
    db.add(JournalMappingLine(mapping_id=m_sales.id, account_id=get_id("5-1101"), side="debit", value_type="cogs_amount"))  # HPP
    db.add(JournalMappingLine(mapping_id=m_sales.id, account_id=get_id("4-1101"), side="credit", value_type="total_amount")) # Pendapatan
    db.add(JournalMappingLine(mapping_id=m_sales.id, account_id=get_id("1-1301"), side="credit", value_type="cogs_amount"))  # Persediaan

    # 2.2 Pembelian (MULTI PAIR dengan PPN)
    # Debit: Persediaan, Debit: PPN | Kredit: Kas
    m_purch = JournalMapping(tenant_id=tenant_id, transaction_type=TransactionType.PURCHASE, description="Pembelian Tunai + PPN", is_active=True)
    db.add(m_purch); db.flush()
    db.add(JournalMappingLine(mapping_id=m_purch.id, account_id=get_id("1-1301"), side="debit", value_type="total_amount")) # Persediaan
    db.add(JournalMappingLine(mapping_id=m_purch.id, account_id=get_id("1-1401"), side="debit", value_type="tax_amount"))   # PPN Masukan
    db.add(JournalMappingLine(mapping_id=m_purch.id, account_id=get_id("1-1101"), side="credit", value_type="total_amount")) # Kas

    # 2.3 Payroll Accrual (MULTI PAIR)
    m_pay = JournalMapping(tenant_id=tenant_id, transaction_type=TransactionType.EXPENSE, description="Pengakuan Gaji & Potongan (Payroll)", is_active=True)
    db.add(m_pay); db.flush()
    db.add(JournalMappingLine(mapping_id=m_pay.id, account_id=get_id("6-1101"), side="debit", value_type="total_amount")) # Beban Gaji
    db.add(JournalMappingLine(mapping_id=m_pay.id, account_id=get_id("2-1202"), side="credit", value_type="tax_amount"))  # PPh 21
    db.add(JournalMappingLine(mapping_id=m_pay.id, account_id=get_id("2-1201"), side="credit", value_type="total_amount")) # Hutang Gaji

    # 2.4 Operasional Umum
    m_ops = JournalMapping(tenant_id=tenant_id, transaction_type=TransactionType.OPERATIONAL, description="Beban Operasional Tunai", is_active=True)
    db.add(m_ops); db.flush()
    db.add(JournalMappingLine(mapping_id=m_ops.id, account_id=get_id("6-1301"), side="debit", value_type="total_amount")) 
    db.add(JournalMappingLine(mapping_id=m_ops.id, account_id=get_id("1-1101"), side="credit", value_type="total_amount")) 

    # 2.5 Opname Kas
    m_cash = JournalMapping(tenant_id=tenant_id, transaction_type=TransactionType.CASH_COUNT, description="Opname Kas (Surplus)", is_active=True)
    db.add(m_cash); db.flush()
    db.add(JournalMappingLine(mapping_id=m_cash.id, account_id=get_id("1-1101"), side="debit", value_type="total_amount")) 
    db.add(JournalMappingLine(mapping_id=m_cash.id, account_id=get_id("4-2101"), side="credit", value_type="total_amount")) 

    # 2.6 Modal
    m_cap = JournalMapping(tenant_id=tenant_id, transaction_type=TransactionType.CAPITAL, description="Setoran Modal Pemilik", is_active=True)
    db.add(m_cap); db.flush()
    db.add(JournalMappingLine(mapping_id=m_cap.id, account_id=get_id("1-1101"), side="debit", value_type="total_amount")) 
    db.add(JournalMappingLine(mapping_id=m_cap.id, account_id=get_id("3-1101"), side="credit", value_type="total_amount")) 

    db.commit()
    print("Berhasil memperbarui Mapping Jurnal ke Standar PSAK EMKM (Lengkap).")
    db.close()

if __name__ == "__main__":
    seed_psak_complete()
