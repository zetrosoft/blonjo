from app.core.database import SessionLocal
from app.models.accounting import JournalMapping, JournalMappingLine, Account, TransactionType
db = SessionLocal()
tenant_id = 1

def get_id(code):
    a = db.query(Account).filter(Account.code == code, Account.tenant_id == tenant_id).first()
    return a.id if a else None

# Perbaiki CASH_COUNT agar ke Selisih Kas, bukan Pendapatan Lain-lain
m = db.query(JournalMapping).filter(JournalMapping.transaction_type == TransactionType.CASH_COUNT, JournalMapping.tenant_id == tenant_id).first()
if m:
    db.query(JournalMappingLine).filter(JournalMappingLine.mapping_id == m.id).delete()
    db.add(JournalMappingLine(mapping_id=m.id, account_id=get_id("1-1101"), side="debit", value_type="total_amount"))
    # Coba 6-9000 atau 4-2101 untuk tes
    db.add(JournalMappingLine(mapping_id=m.id, account_id=get_id("4-2101"), side="credit", value_type="total_amount")) 
    db.commit()
    print("Mapping CASH_COUNT diperbarui.")
