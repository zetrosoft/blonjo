import os
import sys
import json
from sqlalchemy.orm import Session

# Add the app directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.services.ai_engine import call_ai_text
from app.core.database import SessionLocal

def test_complex_accounting(input_text: str, description: str):
    print(f"\n--- TESTING: {description} ---")
    print(f"Input: \"{input_text}\"")
    
    db = SessionLocal()
    try:
        # Instruction mencakup identifikasi BKP (Barang Kena Pajak)
        system_instruction = (
            "Anda adalah pakar akuntansi dan perpajakan Indonesia. Ekstrak teks menjadi JSON.\n"
            "Identifikasi apakah barang termasuk BKP (Barang Kena Pajak) atau Non-BKP (misal: bahan pokok/beras/telur adalah Non-BKP).\n"
            "Skema: {\n"
            "  \"transaction_type\": \"purchase|sales\",\n"
            "  \"party_name\": \"nama supplier/customer\",\n"
            "  \"items\": [\n"
            "    {\"name\": string, \"qty\": number, \"price\": number, \"is_bkp\": boolean}\n"
            "  ],\n"
            "  \"total_non_tax\": number,\n"
            "  \"estimated_ppn_11pct\": number\n"
            "}"
        )
        
        res = call_ai_text(db, input_text, system_instruction=system_instruction)
        parsed = res.get("parsed_data")
        
        if not parsed:
            print("❌ AI gagal parsing.")
            return

        print(f"✅ AI Result ({res.get('processor')}):\n{json.dumps(parsed, indent=2)}")
        
        # Simulasi Logika Pajak & Jurnal
        print(f"\nAnalisa Akuntansi (Perpetual & PPN):")
        total_dpp = 0
        total_ppn = 0
        for item in parsed.get("items", []):
            if item.get("is_bkp"):
                dpp = item.get("qty") * item.get("price")
                total_dpp += dpp
                total_ppn += dpp * 0.11
        
        if parsed.get("transaction_type") == "purchase":
            print(f"  > [D] Persediaan (BKP + Non-BKP)")
            if total_ppn > 0:
                print(f"  > [D] PPN Masukan              : {total_ppn}")
            print(f"  > [K] Hutang/Kas               : {parsed.get('total_non_tax') + total_ppn}")
        else:
            print(f"  > [D] Kas/Piutang              : {parsed.get('total_non_tax') + total_ppn}")
            print(f"  > [K] Pendapatan Penjualan")
            if total_ppn > 0:
                print(f"  > [K] PPN Keluaran             : {total_ppn}")
            print(f"  > [D] HPP                      : (Auto-calculated)")
            print(f"  > [K] Persediaan               : (Auto-calculated)")
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    # Skenario 1: Pembelian ke Supplier dengan banyak item
    test_complex_accounting(
        "Beli dari PT Makmur Jaya: 10 karung Beras 5kg @150rb (Non-BKP), 5 botol Minyak Goreng 2L @40rb (BKP), dan 2 lusin Sabun Mandi @60rb (BKP). Bayar tempo.",
        "PEMBELIAN MULTI-ITEM (BKP & NON-BKP)"
    )
    
    # Skenario 2: Penjualan ke Customer
    test_complex_accounting(
        "Jual ke Bu Endang: 2kg Telur Ayam @30rb (Non-BKP), 1 botol Shampoo 200ml @25rb (BKP), dan 1 sisir Pisang @20rb (Non-BKP). Bayar tunai.",
        "PENJUALAN MULTI-ITEM (BKP & NON-BKP)"
    )
