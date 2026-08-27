# Perbaikan Klasifikasi Pembelian dan Filter Pricing Rules

**Goal:** Memastikan input transaksi berupa pembelian (purchase) tidak lagi membawa data Pricing Rule (aturan harga jual) ke dalam prompt LLM/MCP server, demi efisiensi token dan relevansi konteks.

**Architecture:** Memperbarui fungsi `classify_transaction` di `sajen/app/services/smart_parser.py` menggunakan pendekatan berbasis skor kata kunci semantik (Semantic & Dynamic Keyword Scoring) yang lebih pintar dan tidak kaku, agar dapat mengenali intensi pembelian secara dinamis tanpa melakukan hardcode kata tertentu.

**Tech Stack:** Python, RegExp.

---

### Task 1: Perbarui Fungsi classify_transaction di smart_parser.py

**Files:**
- Modify: `sajen/app/services/smart_parser.py:52-68`

**Step 1: Write the test script**

Buat file `sajen/scratch/test_classification.py` untuk menguji berbagai variasi input transaksi:

```python
import sys
import os
sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.services.smart_parser import classify_transaction, TransactionClass

def run_tests():
    test_cases = [
        # Kasus Pembelian (Purchase)
        ("Belanja plastik di TOKO PLASTIK SJP SARLEG : • PLASRIK BOYO TENGAHAN 10.25 4 TALI", TransactionClass.PRODUCT_PURCHASE),
        ("beli stok Sabun 10 pcs harga 50rb dari Supplier Makmur", TransactionClass.PRODUCT_PURCHASE),
        ("Kulakan minyak goreng 2 ctn", TransactionClass.PRODUCT_PURCHASE),
        ("stok masuk telur 5 peti dari peternak", TransactionClass.PRODUCT_PURCHASE),
        
        # Kasus Penjualan (Sales)
        ("Jual Beras 5kg sebanyak 2 karung, total 150rb tunai", TransactionClass.PRODUCT_SALES),
        ("Penjualan toko hari ini laku sendok 2 pack @10000", TransactionClass.PRODUCT_SALES),
        ("Sendok 2 pack @10000", TransactionClass.PRODUCT_SALES),
        
        # Kasus Kas Global
        ("selisih uang tunai 50000", TransactionClass.KAS_GLOBAL),
        ("gaji karyawan 1.5jt", TransactionClass.KAS_GLOBAL),
    ]
    
    success = True
    for text, expected in test_cases:
        res = classify_transaction(text)
        if res == expected:
            print(f"✅ PASS: '{text}' -> {res}")
        else:
            print(f"❌ FAIL: '{text}' -> Expected {expected}, got {res}")
            success = False
            
    assert success, "Beberapa test case gagal!"

if __name__ == "__main__":
    run_tests()
```

**Step 2: Run test to verify current failures**

Jalankan script test di terminal:
Run: `python scratch/test_classification.py`
Expected: FAIL pada kasus-kasus pembelian tertentu (seperti "Belanja plastik di TOKO...") karena regex lama yang kaku.

**Step 3: Write minimal implementation**

Perbarui implementasi fungsi `classify_transaction` di `sajen/app/services/smart_parser.py` dengan pendekatan semantic scoring.

**Step 4: Run test to verify it passes**

Run: `python scratch/test_classification.py`
Expected: PASS untuk semua test cases.
