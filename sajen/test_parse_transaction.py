import asyncio
from app.services.mcp_client import mcp_client
from app.db.session import SessionLocal

async def test():
    db = SessionLocal()
    text = """Pembelian di PT. INDOMARCO ADI PRIMA :
• SNACK CHITATO BBQ 20PCS = 33700
• SNACK JET 2 SWEET 22PCS = 32500
• SNACK CHITATO LITE 20PCS =33700
• POPMIE INSTANT RASA SOTO 6PCS =25500
• MINYAK GORENG BIMOLI 620ML =3BTL =21685
• POPMIE INSTANT GORENG 12PCS =32200

HARGA DIATAS SUDAN TERMASUK PPN DAN METODE PEMBAYARAN TEMPO DENGAN JATUH TEMPO PADA TANGGAL 03/08/2026"""
    
    # tenant_id = 1 is usually a good guess for a local test
    res = await mcp_client.parse_transaction(db, text, tenant_id=1)
    import json
    print(json.dumps(res, indent=2))
    
if __name__ == "__main__":
    asyncio.run(test())
