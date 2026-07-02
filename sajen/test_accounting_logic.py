import os
import sys
import json
from sqlalchemy.orm import Session

# Add the app directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.services.ai_engine import call_ai_text
from app.core.database import SessionLocal
from app.models.accounting import Transaction, JournalEntry, Account
from app.models.inventory import Product, InventoryLog
from app.models.tenant import Tenant
from app.models.user import User

def test_accounting_flow(input_text: str, description: str):
    print(f"\n--- TESTING: {description} ---")
    print(f"Input: \"{input_text}\"")
    
    db = SessionLocal()
    try:
        # 1. AI Parsing Step
        system_instruction = (
            "Anda adalah pakar akuntansi PSAK EMKM. Ekstrak teks menjadi JSON.\n"
            "Skema: {\"transaction_type\": \"sales|purchase|expense\", \"items\": [{\"product_name\": string, \"quantity\": number, \"price\": number}], \"total\": number}"
        )
        
        res = call_ai_text(db, input_text, system_instruction=system_instruction)
        parsed = res.get("parsed_data")
        
        if not parsed:
            print("❌ AI gagal parsing.")
            return

        print(f"✅ AI Result ({res.get('processor')}): {json.dumps(parsed)}")
        
        # 2. Simulate Journal Mapping logic (Simplified for Dry Run)
        # In real app, this would call accounting_service.create_transaction_from_ai
        tx_type = parsed.get("transaction_type")
        total = parsed.get("total", 0)
        
        print(f"Simulasi Jurnal (Metode Perpetual):")
        
        if tx_type == "sales":
            print("  [D] Kas / Piutang          :", total)
            print("  [K] Pendapatan Penjualan   :", total)
            print("  [D] Harga Pokok Penjualan  : (Berdasarkan HPP rata-rata)")
            print("  [K] Persediaan Barang      : (Mengurangi stok)")
        elif tx_type == "purchase":
            print("  [D] Persediaan Barang      :", total)
            print("  [K] Kas / Hutang           :", total)
        elif tx_type == "expense":
            print(f"  [D] Beban (Operasional)    :", total)
            print("  [K] Kas                    :", total)
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Test 1: Penjualan (Perpetual - Kas & Pendapatan + HPP & Persediaan)
    test_accounting_flow(
        "Jual Beras 5kg sebanyak 2 karung, total 150rb tunai", 
        "PENJUALAN (SALES) - Harus ada HPP & Persediaan"
    )
    
    # Test 2: Pembelian (Perpetual - Stok bertambah)
    test_accounting_flow(
        "Beli stok Sabun 10 pcs harga 50rb dari Supplier Makmur", 
        "PEMBELIAN (PURCHASE) - Stok bertambah"
    )

    # Test 3: Beban (Expense)
    test_accounting_flow(
        "Bayar listrik kantor 200rb", 
        "BEBAN (EXPENSE) - Tidak ada HPP/Stok"
    )
