import os
import sys
import json
from decimal import Decimal
from sqlalchemy.orm import Session

# Add the app directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.services.ai_engine import call_ai_text
from app.core.database import SessionLocal

def test_summary_with_cogs(input_text: str):
    print(f"\n--- TESTING INPUT: \"{input_text}\" ---")
    
    db = SessionLocal()
    try:
        # Prompt diperbaiki untuk menangkap detail ringkasan
        system_instruction = (
            "Anda adalah pakar akuntansi PSAK EMKM. Ekstrak teks menjadi JSON.\n"
            "Skema: {\"transaction_type\": \"sales|purchase|expense\", \"total\": number, \"note\": string}"
        )
        
        res = call_ai_text(db, input_text, system_instruction=system_instruction)
        parsed = res.get("parsed_data")
        
        if not parsed:
            print("❌ AI gagal parsing.")
            return

        print(f"✅ AI Result ({res.get('processor')}):\n{json.dumps(parsed, indent=2)}")
        
        tx_type = parsed.get("transaction_type")
        total = Decimal(str(parsed.get("total", 0)))
        
        print(f"\nAnalisa Jurnal (Metode Perpetual + Pro-rata HPP):")
        if tx_type == "sales":
            # LOGIKA PRO-RATA HPP (Sesuai Koreksi User)
            # Default margin UMKM Sembako = 8% (sesuai app/services/accounting.py)
            # HPP = 92% dari Total
            margin_rate = Decimal('0.08')
            hpp_rate = Decimal('1.00') - margin_rate
            hpp_amount = (total * hpp_rate).quantize(Decimal('1.00'))
            
            print(f"  [D] Kas / Bank              : {total}")
            print(f"  [K] Pendapatan Penjualan    : {total}")
            print(f"  --- Entri Perpetual Otomatis (Pro-rata) ---")
            print(f"  [D] Harga Pokok Penjualan   : {hpp_amount} (Asumsi Margin {margin_rate*100}%)")
            print(f"  [K] Persediaan Barang       : {hpp_amount}")
            print(f"\n  INFO: Karena input tanpa item rincian, HPP dihitung secara prorata")
            print(f"  berdasarkan setting margin bisnis.")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Test input ringkasan harian
    test_summary_with_cogs("Pendapatan Hari ini 2.550.000")
