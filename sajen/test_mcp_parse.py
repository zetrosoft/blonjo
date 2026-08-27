import sys
import asyncio
from app.core.database import SessionLocal
from app.services.mcp_client import mcp_client

async def main():
    db = SessionLocal()
    text = """
PT. INDOMARCO ADI PRIMA
Tgl: 24-07-2026
Jatuh Tempo: 14 Hari
Barang:
1. Indomie Goreng 1 Dus (40 Pcs) @ 110.000
2. Sarimi Isi 2 Ayam Bawang 1 Dus (24 Pcs) @ 85.000
"""
    context = {}
    try:
        res = await mcp_client.parse_transaction(db, text, context, tenant_id=1)
        print("RESULT:")
        import json
        print(json.dumps(res, indent=2))
    except Exception as e:
        print("ERROR:", e)
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())
