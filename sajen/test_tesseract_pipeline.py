"""
Test Script: Hybrid OCR-LLM Pipeline (Tesseract OCR + Ollama)
=========================================================
Skrip mandiri untuk memvalidasi performa pipeline OCR dan LLM secara lokal.
Bisa dijalankan di dalam Docker sebagai standalone test.

Cara pakai:
    docker exec sajen_agentic_worker python test_tesseract_pipeline.py nota_test.jpg
"""

import sys
import os
import json
import re
import time

# -------------------------------------------------------------------
# 1. Konfigurasi
# -------------------------------------------------------------------
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
OLLAMA_LLM_MODEL = os.getenv("OLLAMA_LLM_MODEL", "qwen2.5:3b")


def clean_json_output(raw_text: str) -> str:
    """
    Tangguh terhadap output Ollama yang mungkin berisi markdown wrapper,
    teks pengantar, tag reasoning <think>, atau karakter pengganggu.
    """
    clean = raw_text.strip()
    clean = re.sub(r"<think>.*?</think>", "", clean, flags=re.DOTALL)
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)

    start = clean.find('{')
    end = clean.rfind('}')
    if start != -1 and end != -1 and end > start:
        return clean[start:end+1]
    return clean.strip()


def validate_schema(data: dict) -> list[str]:
    """Validasi bahwa output JSON memiliki field-field wajib."""
    errors = []
    
    # Root level
    if "transaction" not in data:
        errors.append("Missing 'transaction' object")
    else:
        if "date" not in data["transaction"]:
            errors.append("Missing 'transaction.date'")
    
    if "merchant" not in data:
        errors.append("Missing 'merchant' object")
    
    if "summary" not in data:
        errors.append("Missing 'summary' object")
    elif "grand_total" not in data["summary"]:
        errors.append("Missing 'summary.grand_total'")
    
    if "transaction_type" not in data:
        errors.append("Missing 'transaction_type'")
    elif data["transaction_type"] not in ("purchase", "sales", "expense"):
        errors.append(f"Invalid 'transaction_type': {data['transaction_type']}")
    
    if "items" not in data:
        errors.append("Missing 'items' array")
    elif not isinstance(data["items"], list):
        errors.append("'items' should be a list")
    else:
        for i, item in enumerate(data["items"]):
            for key in ("product_name", "quantity", "unit_price", "subtotal"):
                if key not in item:
                    errors.append(f"Item[{i}] missing '{key}'")
    
    return errors


def run_test(image_path: str):
    """Jalankan full pipeline test: Tesseract OCR -> Ollama LLM -> Validasi JSON."""
    
    if not os.path.exists(image_path):
        print(f"❌ GAGAL: File tidak ditemukan: {image_path}")
        sys.exit(1)

    # -------------------------------------------------------------------
    # 2. Tesseract OCR Extraction
    # -------------------------------------------------------------------
    print("=" * 60)
    print("🔍 TAHAP 1: Ekstraksi Teks dengan PyTesseract")
    print("=" * 60)
    
    t0 = time.time()
    
    import pytesseract
    from PIL import Image
    
    try:
        img = Image.open(image_path)
        raw_ocr_text = pytesseract.image_to_string(img, lang="ind+eng")
        raw_lines = [line.strip() for line in raw_ocr_text.split("\n") if line.strip()]
        for line in raw_lines:
            print(f"  {line}")
    except Exception as e:
        print(f"❌ GAGAL: Gagal melakukan ekstraksi Tesseract OCR — {e}")
        sys.exit(1)
        
    t_ocr = time.time() - t0
    
    print(f"\n⏱️  Waktu OCR: {t_ocr:.2f}s")
    print(f"📝 Total baris teks: {len(raw_lines)}")
    
    if not raw_ocr_text.strip():
        print("❌ GAGAL: PyTesseract tidak menghasilkan teks apapun dari gambar.")
        sys.exit(1)
    
    print(f"\n✅ Ekstraksi OCR berhasil ({len(raw_lines)} baris)")

    # -------------------------------------------------------------------
    # 3. Ollama LLM Structuring
    # -------------------------------------------------------------------
    print("\n" + "=" * 60)
    print(f"🤖 TAHAP 2: Strukturisasi JSON via Ollama ({OLLAMA_LLM_MODEL})")
    print(f"   Host: {OLLAMA_HOST}")
    print("=" * 60)
    
    prompt = f"""Anda adalah sistem ekstraksi data terstruktur tingkat lanjut. Tugas Anda adalah menganalisis teks mentah hasil OCR dari sebuah nota/struk belanja dan mengubahnya menjadi format JSON yang valid dan terstruktur.

Aturan Ekstraksi:
1. Ekstrak semua informasi penting sesuai dengan skema JSON yang diberikan di bawah ini.
2. Format tanggal transaksi wajib YYYY-MM-DD. Jika tidak terlihat atau tidak valid, gunakan tanggal hari ini.
3. Jenis transaksi (transaction_type) wajib bernilai salah satu dari: "purchase", "sales", atau "expense".
4. Output harus berupa string JSON murni yang valid tanpa ada penjelasan pembuka/penutup, atau tag markdown tambahan.

Skema JSON yang harus dipatuhi secara mutlak:
{{
  "transaction": {{
    "date": "YYYY-MM-DD",
    "invoice_number": "Nomor invoice/nota/struk belanja (string atau null jika tidak ada)"
  }},
  "merchant": {{
    "brand_name": "Nama merchant/toko/warung (string atau null)"
  }},
  "summary": {{
    "grand_total": angka total transaksi belanja (number)
  }},
  "transaction_type": "purchase, sales, atau expense",
  "items": [
    {{
      "product_name": "Nama produk/barang belanja (string)",
      "quantity": angka jumlah kuantitas barang (number),
      "unit_price": angka harga satuan barang (number),
      "subtotal": angka subtotal total harga barang tersebut (number, quantity * unit_price)
    }}
  ]
}}

Teks Mentah Hasil OCR Nota:
{raw_ocr_text}
"""

    t1 = time.time()
    
    from ollama import Client
    client = Client(host=OLLAMA_HOST)
    
    try:
        response = client.generate(
            model=OLLAMA_LLM_MODEL,
            prompt=prompt,
            stream=False,
            options={"temperature": 0.25}
        )
    except Exception as e:
        print(f"❌ GAGAL: Tidak bisa terhubung ke Ollama ({OLLAMA_HOST}): {e}")
        sys.exit(1)
    
    t_llm = time.time() - t1
    raw_output = response['response']
    
    print(f"\n⏱️  Waktu LLM: {t_llm:.2f}s")
    print(f"\n--- Raw Output LLM ---")
    print(raw_output[:500])
    if len(raw_output) > 500:
        print(f"... ({len(raw_output)} total chars)")
    print("--- End ---\n")

    # -------------------------------------------------------------------
    # 4. Parse & Validate JSON
    # -------------------------------------------------------------------
    print("=" * 60)
    print("✅ TAHAP 3: Parsing & Validasi Skema JSON")
    print("=" * 60)
    
    clean_str = clean_json_output(raw_output)
    
    try:
        data = json.loads(clean_str)
    except json.JSONDecodeError as e:
        print(f"❌ GAGAL: JSON tidak valid — {e}")
        print(f"   Clean string: {clean_str[:200]}...")
        sys.exit(1)
    
    print("✅ JSON berhasil di-parse")
    print(f"\n{json.dumps(data, indent=2, ensure_ascii=False)}\n")
    
    # Schema validation
    schema_errors = validate_schema(data)
    if schema_errors:
        print("⚠️  Validasi Skema — Ditemukan masalah:")
        for err in schema_errors:
            print(f"   ❌ {err}")
    else:
        print("✅ Validasi Skema — Semua field wajib lengkap!")
        if len(data.get("items", [])) == 0:
            print("   ℹ️  Catatan: Array 'items' kosong karena teks gambar bukan merupakan struk belanja komersial yang memiliki daftar barang.")

    # -------------------------------------------------------------------
    # 5. Summary
    # -------------------------------------------------------------------
    print("\n" + "=" * 60)
    print("📊 RINGKASAN HASIL TEST")
    print("=" * 60)
    print(f"  OCR Engine     : PyTesseract (lang=ind+eng)")
    print(f"  LLM Model      : {OLLAMA_LLM_MODEL}")
    print(f"  Ollama Host     : {OLLAMA_HOST}")
    print(f"  Waktu OCR       : {t_ocr:.2f}s")
    print(f"  Waktu LLM       : {t_llm:.2f}s")
    print(f"  Total Waktu     : {t_ocr + t_llm:.2f}s")
    print(f"  Baris Teks OCR  : {len(raw_lines)}")
    print(f"  Items Terdeteksi: {len(data.get('items', []))}")
    print(f"  Grand Total     : Rp {data.get('summary', {}).get('grand_total', 'N/A'):,}")
    print(f"  Schema Valid    : {'✅ YA' if not schema_errors else '❌ TIDAK'}")
    print("=" * 60)
    
    if schema_errors:
        sys.exit(1)
    else:
        print("\n🎉 TEST PASSED — Pipeline Hybrid OCR-LLM berjalan dengan sempurna!")
        sys.exit(0)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Penggunaan: python test_tesseract_pipeline.py <path_gambar_struk>")
        print("Contoh:     python test_tesseract_pipeline.py nota_test.jpg")
        sys.exit(1)
    
    run_test(sys.argv[1])
