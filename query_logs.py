import sys
from sqlalchemy import create_engine, text

engine = create_engine("postgresql://postgres:postgres@localhost:5432/sajen_db")
with engine.connect() as conn:
    result = conn.execute(text("SELECT id, prompt, parsed_result FROM ai_parsing_logs ORDER BY id DESC LIMIT 1"))
    row = result.fetchone()
    if row:
        print(f"--- ID: {row[0]} ---")
        print("PROMPT:")
        print(row[1])
        print("\nPARSED RESULT:")
        print(row[2])
    else:
        print("No logs found.")
