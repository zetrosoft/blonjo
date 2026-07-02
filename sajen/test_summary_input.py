import os
import sys
import json
from sqlalchemy.orm import Session

# Add the app directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.services.ai_engine import call_ai_text
from app.core.database import SessionLocal

def test_single_input(input_text: str):
    print(f"\n--- TESTING INPUT: \"{input_text}\" ---")
    
    db = SessionLocal()
    try:
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
        total = parsed.get("total", 0)
        
        print(f"\nAnalisa Jurnal (Metode Perpetual):")
        if tx_type == "sales":
            print(f"  [D] Kas                     : {total}")
            print(f"  [K] Pendapatan Penjualan    : {total}")
            print(f"  [!] PERINGATAN: Input ringkasan tanpa item.")
            print(f"      HPP dan Persediaan harus diinput manual atau via stok opname")
            print(f"      karena tidak ada rincian barang yang terjual.")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_single_input("Pendapatan Hari ini 2.550.000")
