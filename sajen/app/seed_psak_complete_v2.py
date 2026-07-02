from app.core.database import SessionLocal
from app.models.accounting import JournalMapping, JournalMappingLine, Account, TransactionType, AccountType
from sqlalchemy import or_

def seed_remaining_psak():
    db = SessionLocal()
    tenant_id = 1
    
    def get_id(code):
        a = db.query(Account).filter(Account.code == code, Account.tenant_id == tenant_id).first()
        return a.id if a else None

    # Hapus mapping lama secara manual per ID untuk menghindari Join Delete Error
    mappings = db.query(JournalMapping).filter(JournalMapping.tenant_id == tenant_id).all()
    for m in mappings:
        db.query(JournalMappingLine).filter(JournalMappingLine.mapping_id == m.id).delete()
        db.delete(m)
    db.commit()

    mappings_data = [
        {
            "type": TransactionType.SALES,
            "desc": "Penjualan Tunai PSAK (Perpetual)",
            "lines": [
                {"code": "1-1101", "side": "debit", "v": "total_amount"}, # Kas
                {"code": "5-1101", "side": "debit", "v": "cogs_amount"},  # HPP
                {"code": "4-1101", "side": "credit", "v": "total_amount"}, # Pendapatan
                {"code": "1-1301", "side": "credit", "v": "cogs_amount"}   # Persediaan
            ]
        },
        {
            "type": TransactionType.PURCHASE,
            "desc": "Pembelian Tunai + PPN",
            "lines": [
                {"code": "1-1301", "side": "debit", "v": "total_amount"},
                {"code": "1-1401", "side": "debit", "v": "tax_amount"},
                {"code": "1-1101", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.EXPENSE,
            "desc": "Pengakuan Gaji & PPh 21",
            "lines": [
                {"code": "6-1101", "side": "debit", "v": "total_amount"},
                {"code": "2-1202", "side": "credit", "v": "tax_amount"},
                {"code": "2-1201", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.OPERATIONAL,
            "desc": "Beban Listrik & Air",
            "lines": [
                {"code": "6-1301", "side": "debit", "v": "total_amount"},
                {"code": "1-1101", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.CASH_COUNT,
            "desc": "Opname Kas (Surplus)",
            "lines": [
                {"code": "1-1101", "side": "debit", "v": "total_amount"},
                {"code": "4-2101", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.INCOME,
            "desc": "Penerimaan Piutang Usaha",
            "lines": [
                {"code": "1-1101", "side": "debit", "v": "total_amount"},
                {"code": "1-1201", "side": "credit", "v": "total_amount"}
            ]
        },
        {
            "type": TransactionType.NON_CASH_IN,
            "desc": "Penerimaan via Transfer Bank",
            "lines": [
                {"code": "1-1102", "side": "debit", "v": "total_amount"},
                {"code": "4-1101", "side": "credit", "v": "total_amount"}
            ]
        }
    ]

    for m in mappings_data:
        new_map = JournalMapping(
            tenant_id=tenant_id,
            transaction_type=m["type"],
            description=m["desc"],
            is_active=True
        )
        db.add(new_map)
        db.flush()
        
        for l in m["lines"]:
            acc_id = get_id(l["code"])
            if acc_id:
                db.add(JournalMappingLine(
                    mapping_id=new_map.id,
                    account_id=acc_id,
                    side=l["side"],
                    value_type=l["v"]
                ))
            
    db.commit()
    print("Mapping Jurnal PSAK Lengkap (Multi-Pair) berhasil diterapkan.")
    db.close()

if __name__ == "__main__":
    seed_remaining_psak()
