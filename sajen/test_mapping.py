from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.accounting import JournalMapping, JournalMappingLine

engine = create_engine("postgresql://sajen_user:secret@localhost:5432/blonjo_db")
Session = sessionmaker(bind=engine)
session = Session()

mappings = session.query(JournalMapping).all()
for m in mappings:
    print(f"Mapping: {m.transaction_type} (Tenant: {m.tenant_id})")
    for l in m.lines:
        print(f"  Line: Account {l.account_id}, Side {l.side}, ValueType {l.value_type}")
