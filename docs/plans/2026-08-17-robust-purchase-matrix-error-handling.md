# Plan: Perbaikan Robustness & Error Handling pada Endpoint Purchase Matrix

## 📋 Ringkasan Masalah
Pengguna melaporkan pesan "Gagal memuat data matriks pembelian" pada UI **Bisnis Insight ➔ Analitik Visual**.

Akar Masalah:
1. Pengecekan properti `log.transaction.transaction_date` dan `log.product.category` belum dibungkus secara defensif (kemungkinan ada baris data `InventoryLog` yang memiliki relasi partial/null).
2. Fungsi `get_purchase_matrix_analytics` belum dibungkus blok `try ... except`, sehingga apabila terjadi unhandled exception, FastAPI akan menghentikan eksekusi dan mengembalikan response error 500/502 tanpa detail log yang jelas.

---

## 🎯 Target Perubahan

### Backend (`sajen`)
- **`sajen/app/api/v1/insights.py`**:
  - Bungkus fungsi `get_purchase_matrix_analytics` dalam blok `try ... except Exception as e` dengan pencatatan log lengkap (`logger.error(..., exc_info=True)`).
  - Terapkan defensive null-safety untuk seluruh relasi `log.transaction` dan `log.product`.
  - Gunakan `current_user: deps.CurrentUser` resmi FastAPI dependency.

---

## 🧪 Rencana Pengujian
1. Deploy backend API `sajen` (`./deploy.sh sajen`).
2. Refresh halaman **Bisnis Insight ➔ Analitik Visual** di browser.
3. Verifikasi matriks pembelian bulanan dimuat dengan sukses.

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
