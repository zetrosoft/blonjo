# Rencana Implementasi: Klasifikasi Transaksi Cerdas Berbasis Local Vector Similarity (ONNX)

**Goal:** Menggantikan klasifikasi heuristik statis dengan klasifikasi semantik dinamis berbasis kesamaan vektor lokal (*Vector Cosine Similarity*) menggunakan model ONNX yang sudah terpasang. Ini menjamin akurasi tinggi dalam mendeteksi tipe transaksi tanpa membebani resource komputasi atau menggunakan token LLM.

**Architecture:**
1. Menggunakan model E5 ONNX lokal (`multilingual-e5-small`) dari `sajen/app/services/onnx_embed.py`.
2. Menyimpan daftar kalimat jangkar (*Anchor Sentences*) untuk setiap kategori transaksi (`KAS_GLOBAL`, `PRODUCT_PURCHASE`, `PRODUCT_SALES`).
3. Menghitung Cosine Similarity secara lokal menggunakan `numpy` terhadap vektor jangkar yang telah di-cache.
4. Mengintegrasikannya ke dalam `classify_transaction` di `sajen/app/services/smart_parser.py` sebagai L2 classifier setelah L1 (Exact keyword/Regex).

---

### Task 1: Implementasikan Vector Classifier di smart_parser.py

**Files:**
- Modify: `sajen/app/services/smart_parser.py`

**Step 1: Write a test script to verify performance and accuracy**

Kita buat test script di `sajen/scratch/test_vector_classification.py` untuk menguji fungsionalitas klasifikasi vektor baru ini secara langsung:

```python
import sys
import os
import time

sys.path.append(os.path.join(os.getcwd(), "app"))
sys.path.append(os.getcwd())

from app.services.smart_parser import classify_transaction, TransactionClass

def run_vector_tests():
    test_cases = [
        # Kasus Pembelian (Purchase)
        ("Belanja plastik di TOKO PLASTIK SJP SARLEG : • PLASRIK BOYO TENGAHAN 10.25 4 TALI", TransactionClass.PRODUCT_PURCHASE),
        ("stok masuk telur 5 peti dari peternak", TransactionClass.PRODUCT_PURCHASE),
        ("kulakan beras kencur dari supplier jamu", TransactionClass.PRODUCT_PURCHASE),
        
        # Kasus Penjualan (Sales)
        ("Jual Beras 5kg sebanyak 2 karung, total 150rb tunai", TransactionClass.PRODUCT_SALES),
        ("laku sendok garpu 2 pack", TransactionClass.PRODUCT_SALES),
        
        # Kasus Kas Global
        ("gaji karyawan 1.5jt", TransactionClass.KAS_GLOBAL),
        ("bayar sewa ruko bulanan", TransactionClass.KAS_GLOBAL),
    ]
    
    print("Memulai pengujian Vector Classifier...")
    success = True
    for text, expected in test_cases:
        start_time = time.time()
        res = classify_transaction(text)
        duration = (time.time() - start_time) * 1000
        
        if res == expected:
            print(f"✅ PASS ({duration:.2f}ms): '{text}' -> {res}")
        else:
            print(f"❌ FAIL ({duration:.2f}ms): '{text}' -> Expected {expected}, got {res}")
            success = False
            
    assert success, "Beberapa test case klasifikasi vektor gagal!"

if __name__ == "__main__":
    run_vector_tests()
```

**Step 2: Implement Vector Cosine Similarity Classifier**

Tambahkan caching anchors dan fungsi pencarian kesamaan kosinus di `sajen/app/services/smart_parser.py`. Untuk menghindari overhead lambat saat import modul, pemanggilan model ONNX akan dilakukan secara malas (*lazy-loaded*) saat klasifikasi pertama kali dijalankan.

**Step 3: Run test to verify it passes**

Jalankan test script:
Run: `python scratch/test_vector_classification.py`
Expected: Seluruh test case sukses (PASS) dengan latency di bawah 30ms per input.
