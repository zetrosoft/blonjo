from app.core.database import SessionLocal
from app.models.accounting import JournalMapping, JournalMappingLine, Account, TransactionType
db = SessionLocal()
tenant_id = 1

def get_id(code):
    a = db.query(Account).filter(Account.code == code, Account.tenant_id == tenant_id).first()
    return a.id if a else None

# 1. Hapus jika ada duplikat atau salah tipe
mappings = db.query(JournalMapping).filter(JournalMapping.transaction_type == TransactionType.CAPITAL, JournalMapping.tenant_id == tenant_id).all()
for m in mappings:
    db.query(JournalMappingLine).filter(JournalMappingLine.mapping_id == m.id).delete()
    db.delete(m)
db.commit()

# 2. Tambah mapping CAPITAL yang benar
m = JournalMapping(tenant_id=tenant_id, transaction_type=TransactionType.CAPITAL, description='Setoran Modal / Saldo Awal', is_active=True)
db.add(m); db.flush()

db.add(JournalMappingLine(mapping_id=m.id, account_id=get_id("1-1101"), side="debit", value_type="total_amount"))
db.add(JournalMappingLine(mapping_id=m.id, account_id=get_id("3-1101"), side="credit", value_type="total_amount"))
db.commit()
print("Mapping CAPITAL resmi didaftarkan.")
