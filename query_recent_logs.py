import sys
from sqlalchemy import create_engine, text

engine = create_engine("postgresql://postgres:postgres@localhost:5432/sajen_db")
try:
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT id, input_text, parsed_result, created_at 
            FROM ai_parsing_logs 
            ORDER BY created_at DESC 
            LIMIT 4
        """))
        rows = result.fetchall()
        for row in rows:
            print(f"--- ID: {row[0]} | Date: {row[3]} ---")
            print("INPUT:")
            print(row[1])
            print("RESULT:")
            print(row[2])
            print("="*40)
except Exception as e:
    print(f"Error querying DB: {e}")
