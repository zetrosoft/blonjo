from app.core.database import SessionLocal
from app.models.accounting import JournalMapping, JournalMappingLine, Account, TransactionType
from sqlalchemy import or_

def seed_psak_mappings():
    db = SessionLocal()
    tenant_id = 1
    
    # Ambil Akun Berdasarkan Kode (Tenant 1)
    def get_acc(code):
        return db.query(Account).filter(Account.code == code, Account.tenant_id == tenant_id).first()

    # Hapus mapping lama agar bersih
    db.query(JournalMapping).filter(JournalMapping.tenant_id == tenant_id).delete()
    db.commit()

    mappings_data = [
        {
            "type": TransactionType.SALES,
            "desc": "Penjualan Barang (Tunai)",
            "lines": [
                {"code": "1-1101", "side": "debit"},  # Kas
                {"code": "4-1101", "side": "credit"}  # Pendapatan Penjualan
            ]
        },
        {
            "type": TransactionType.PURCHASE,
            "desc": "Pembelian Persediaan (Tunai)",
            "lines": [
                {"code": "1-1301", "side": "debit"},  # Persediaan Barang Dagang
                {"code": "1-1101", "side": "credit"}  # Kas
            ]
        },
        {
            "type": TransactionType.EXPENSE,
            "desc": "Biaya Operasional Umum (Tunai)",
            "lines": [
                {"code": "6-9000", "side": "debit"},  # Beban Operasional Lainnya (General)
                {"code": "1-1101", "side": "credit"}  # Kas
            ]
        },
        {
            "type": TransactionType.OPERATIONAL,
            "desc": "Pembayaran Listrik & Internet",
            "lines": [
                {"code": "6-1301", "side": "debit"},  # Beban Listrik, Air & Internet
                {"code": "1-1101", "side": "credit"}  # Kas
            ]
        },
        {
            "type": TransactionType.INCOME,
            "desc": "Pendapatan Lain-lain",
            "lines": [
                {"code": "1-1101", "side": "debit"},  # Kas
                {"code": "4-2101", "side": "credit"}  # Pendapatan Lain-lain
            ]
        },
        {
            "type": TransactionType.CASH_COUNT,
            "desc": "Penyesuaian Selisih Kas (Surplus)",
            "lines": [
                {"code": "1-1101", "side": "debit"},  # Kas
                {"code": "4-2101", "side": "credit"}  # Pendapatan Lain-lain
            ]
        },
        {
            "type": TransactionType.CAPITAL,
            "desc": "Penyetoran Modal Pemilik",
            "lines": [
                {"code": "1-1101", "side": "debit"},  # Kas
                {"code": "3-1101", "side": "credit"}  # Modal Pemilik
            ]
        }
    ]

    count = 0
    for m in mappings_data:
        new_map = JournalMapping(
            tenant_id=tenant_id,
            transaction_type=m["type"],
            description=m["desc"],
            is_active=True
        )
        db.add(new_map)
        db.flush()
        
        valid_lines = 0
        for l in m["lines"]:
            acc = get_acc(l["code"])
            if acc:
                db.add(JournalMappingLine(
                    mapping_id=new_map.id,
                    account_id=acc.id,
                    side=l["side"],
                    value_type="total_amount"
                ))
                valid_lines += 1
        
        if valid_lines > 0:
            count += 1
        else:
            db.rollback()
            print(f"Warning: Mapping {m['type']} gagal karena akun tidak ditemukan.")
            continue
            
    db.commit()
    print(f"Berhasil menambahkan {count} mapping jurnal PSAK.")
    db.close()

if __name__ == "__main__":
    seed_psak_mappings()
