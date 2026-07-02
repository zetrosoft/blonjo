from app.core.database import engine
from sqlalchemy import text

def check():
    with engine.connect() as conn:
        res = conn.execute(text("SELECT enum_range(NULL::transactiontype)")).scalar()
        print(f"Enum Values: {res}")

if __name__ == "__main__":
    check()
