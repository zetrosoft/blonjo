from app.core.database import SessionLocal
from app.models.accounting import JournalMapping, JournalMappingLine, Account, TransactionType, AccountType
from sqlalchemy import text

def seed_clean_psak():
    db = SessionLocal()
    tenant_id = 1
    
    print("Wiping existing data for Tenant 1...")
    # Delete in order to respect FK
    db.execute(text("DELETE FROM journal_mapping_lines WHERE mapping_id IN (SELECT id FROM journal_mappings WHERE tenant_id = 1)"))
    db.execute(text("DELETE FROM journal_mappings WHERE tenant_id = 1"))
    db.execute(text("DELETE FROM journal_entries WHERE transaction_id IN (SELECT id FROM transactions WHERE tenant_id = 1)"))
    db.execute(text("DELETE FROM inventory_logs WHERE transaction_id IN (SELECT id FROM transactions WHERE tenant_id = 1)"))
    db.execute(text("DELETE FROM transactions WHERE tenant_id = 1"))
    db.execute(text("DELETE FROM tenant_inventories WHERE tenant_id = 1"))
    db.execute(text("DELETE FROM tenant_product_prices WHERE tenant_id = 1"))
    db.execute(text("DELETE FROM contacts WHERE tenant_id = 1"))
    db.execute(text("DELETE FROM accounts WHERE tenant_id = 1"))
    db.commit()

    print("Seeding Clean COA (EMKM Standard)...")
    accounts_data = [
        {"code": "1-1101", "name": "Kas", "type": AccountType.ASSET},
        {"code": "1-1102", "name": "Bank", "type": AccountType.ASSET},
        {"code": "1-1201", "name": "Piutang Usaha", "type": AccountType.ASSET},
        {"code": "1-1202", "name": "Uang Muka Operasional", "type": AccountType.ASSET},
        {"code": "1-1301", "name": "Persediaan Barang Dagang", "type": AccountType.ASSET},
        {"code": "1-1302", "name": "Persediaan Bahan Baku", "type": AccountType.ASSET},
        {"code": "1-1303", "name": "Persediaan Barang Dalam Proses (WIP)", "type": AccountType.ASSET},
        {"code": "1-1401", "name": "PPN Masukan", "type": AccountType.ASSET},
        {"code": "1-2101", "name": "Aset Tetap - Bangunan", "type": AccountType.ASSET},
        {"code": "1-2102", "name": "Akum. Penyusutan Bangunan", "type": AccountType.ASSET},
        {"code": "2-1101", "name": "Utang Usaha", "type": AccountType.LIABILITY},
        {"code": "2-1102", "name": "Hutang Belum Ditagih", "type": AccountType.LIABILITY},
        {"code": "2-1201", "name": "Utang Gaji", "type": AccountType.LIABILITY},
        {"code": "2-1202", "name": "Hutang PPh 21", "type": AccountType.LIABILITY},
        {"code": "2-1203", "name": "Hutang BPJS", "type": AccountType.LIABILITY},
        {"code": "2-1401", "name": "PPN Keluaran", "type": AccountType.LIABILITY},
        {"code": "3-1101", "name": "Modal Pemilik", "type": AccountType.EQUITY},
        {"code": "3-1201", "name": "Laba Ditahan", "type": AccountType.EQUITY},
        {"code": "3-1301", "name": "Laba Tahun Berjalan", "type": AccountType.EQUITY},
        {"code": "3-1401", "name": "Prive / Dividen", "type": AccountType.EQUITY},
        {"code": "4-1101", "name": "Pendapatan Penjualan", "type": AccountType.REVENUE},
        {"code": "4-2101", "name": "Pendapatan Lain-lain", "type": AccountType.REVENUE},
        {"code": "5-1101", "name": "Beban Pokok Penjualan (HPP)", "type": AccountType.EXPENSE},
        {"code": "6-1101", "name": "Beban Gaji & Upah", "type": AccountType.EXPENSE},
        {"code": "6-1201", "name": "Beban Sewa", "type": AccountType.EXPENSE},
        {"code": "6-1301", "name": "Beban Listrik, Air & Internet", "type": AccountType.EXPENSE},
        {"code": "6-1401", "name": "Beban Pemasaran", "type": AccountType.EXPENSE},
        {"code": "6-1801", "name": "Beban Administrasi Bank", "type": AccountType.EXPENSE},
        {"code": "6-5000", "name": "Beban Penyusutan", "type": AccountType.EXPENSE},
        {"code": "6-9000", "name": "Beban Operasional Lainnya", "type": AccountType.EXPENSE},
    ]

    for acc in accounts_data:
        db.add(Account(tenant_id=tenant_id, code=acc["code"], name=acc["name"], account_type=acc["type"], is_active=True))
    db.commit()

    def get_id(code):
        a = db.query(Account).filter(Account.code == code, Account.tenant_id == tenant_id).first()
        return a.id if a else None

    print("Seeding Mappings (Single & Multi Pair)...")
    mappings_data = [
        {
            "type": TransactionType.SALES,
            "desc": "Penjualan Tunai (Metode Perpetual)",
            "lines": [
                {"code": "1-1101", "side": "debit", "v": "total_amount"}, # Kas
                {"code": "5-1101", "side": "debit", "v": "cogs_amount"},  # HPP
                {"code": "4-1101", "side": "credit", "v": "total_amount"}, # Pendapatan
                {"code": "1-1301", "side": "credit", "v": "cogs_amount"}   # Persediaan
            ]
        },
        {
            "type": TransactionType.PURCHASE,
            "desc": "Pembelian Persediaan + PPN Masukan",
            "lines": [
                {"code": "1-1301", "side": "debit", "v": "total_amount"},
                {"code": "1-1401", "side": "debit", "v": "tax_amount"},
                {"code": "1-1101", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.EXPENSE,
            "desc": "Beban Gaji & Potongan PPh 21",
            "lines": [
                {"code": "6-1101", "side": "debit", "v": "total_amount"},
                {"code": "2-1202", "side": "credit", "v": "tax_amount"},
                {"code": "2-1201", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.OPERATIONAL,
            "desc": "Biaya Operasional Umum (Kas)",
            "lines": [
                {"code": "6-9000", "side": "debit", "v": "total_amount"},
                {"code": "1-1101", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.CASH_COUNT,
            "desc": "Penyesuaian Opname Kas (Surplus)",
            "lines": [
                {"code": "1-1101", "side": "debit", "v": "total_amount"},
                {"code": "4-2101", "side": "credit", "v": "total_amount"}
            ]
        }
    ]

    for m in mappings_data:
        new_map = JournalMapping(tenant_id=tenant_id, transaction_type=m["type"], description=m["desc"], is_active=True)
        db.add(new_map); db.flush()
        for l in m["lines"]:
            acc_id = get_id(l["code"])
            if acc_id:
                db.add(JournalMappingLine(mapping_id=new_map.id, account_id=acc_id, side=l["side"], value_type=l["v"]))
            
    db.commit()
    print("DONE! COA and Mappings are now Clean and Professional.")
    db.close()

if __name__ == "__main__":
    seed_clean_psak()
