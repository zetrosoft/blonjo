# Plan: Hybrid Purchase Matrix Data Fetch (Inventory Log + Header Transaksi Pembelian)

## 📋 Ringkasan Masalah
Pada halaman UI **Bisnis Insight ➔ Analitik Visual** (`https://blonjo.samkarsa.com/insights/analytics`), data matriks pembelian belum muncul ("Belum ada log pembelian tercatat" / blank).

Penyebab:
Fungsi `get_purchase_matrix_analytics` di `sajen/app/api/v1/insights.py` saat ini hanya mengambil data dari tabel `inventory_logs`. Transaksi pembelian yang dimasukkan melalui Smart Note / Pembelian Header (`TransactionType.PURCHASE`) belum secara otomatis ditarik jika log inventaris fisiknya belum ter-generate.

---

## 🎯 Target Perubahan

### Backend (`sajen`)
- **`sajen/app/api/v1/insights.py`**:
  - Perbarui fungsi `get_purchase_matrix_analytics` untuk menggabungkan 2 sumber data (Hybrid Purchase Aggregation):
    1. Log fisik inventaris masuk (`InventoryLog` dengan `log_type == "in"`).
    2. Header transaksi pembelian (`Transaction` dengan `transaction_type == TransactionType.PURCHASE` dan `status == TransactionStatus.POSTED`) yang belum tercatat di log inventaris.
  - Untuk transaksi header, gunakan AI Heuristic Categorization (`auto_classify_item_name`) berdasarkan deskripsi transaksi.
  - Ekstrak daftar bulan & tahun secara serentak dari seluruh rentang transaksi yang ada di database (misal: April 2026 s/d Agustus 2026).

---

## 🧪 Rencana Pengujian
1. Deploy backend API `sajen` (`./deploy.sh sajen`).
2. Buka `https://blonjo.samkarsa.com/insights/analytics` di browser.
3. Verifikasi seluruh data pembelian per bulan (April, Mei, Juni, Juli, Agustus 2026) beserta pengelompokan kategorinya tampil dengan sempurna di tabel matriks.

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
