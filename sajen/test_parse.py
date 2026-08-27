import time
import asyncio
from app.services.smart_parser import try_rule_based_parse, classify_transaction
from app.services.ai_context import build_minimal_context, get_rag_context
from app.services.coa_cache import get_coa_string
from app.services.mcp_client import mcp_client
from app.core.database import SessionLocal

text = """Pembelian hari ini di TOKO BERAS DARMA SARLEG :
• BERAS PREMIUM SIIP 150kg @14800
• BERAS BROKOLI 25kg @13500
• BERAS MEDIUM C4 PACUL 25kg @14000"""

async def run_test():
    db = SessionLocal()
    tenant_id = 1
    print("STARTING TEST...")
    
    t0 = time.time()
    # 1. Pre-processing & L1
    normalized_text = text.lower() # simplify
    rule_result = try_rule_based_parse(normalized_text)
    t1 = time.time()
    print(f"L1 (Rule-Based): {(t1-t0)*1000:.2f} ms")
    
    if not rule_result:
        # 2. Context Building
        tx_class = classify_transaction(normalized_text)
        min_context = build_minimal_context(normalized_text, tx_class, tenant_id, db)
        is_complex = len(normalized_text) > 60
        if is_complex:
            rag_context = get_rag_context(db, tenant_id, normalized_text)
        coa_str = min_context.get("coa", "")
        if not coa_str:
            coa_str = get_coa_string(db, tenant_id)
        
        t2 = time.time()
        print(f"L2 (Context Build / DB Queries): {(t2-t1)*1000:.2f} ms")
        
        # 3. LLM MCP Call
        print("Calling MCP...")
        try:
            mcp_result = await mcp_client.parse_transaction(
                db,
                normalized_text,
                {"coa": coa_str, "pricing_rules": [], "catalog_context": ""},
                tenant_id=tenant_id
            )
        except Exception as e:
            mcp_result = {"error": str(e)}
        t3 = time.time()
        print(f"L3 (MCP / LLM Call): {(t3-t2)*1000:.2f} ms")
        print(f"Result: {mcp_result}")

    db.close()

if __name__ == "__main__":
    asyncio.run(run_test())
