# Plan: Perbaikan 502 Bad Gateway pada Endpoint Purchase Matrix Insights

## 📋 Ringkasan Masalah
Endpoint `GET /api/v1/insights/purchase-matrix?year=2026` mengembalikan response `502 Bad Gateway`.

Akar Masalah (Empirical Analysis):
Pada file `sajen/app/api/v1/insights.py` line 387-390, fungsi `get_purchase_matrix_analytics` menjalankan query SQL pada tabel `inventory_logs`:
```python
all_logs = db.query(InventoryLog).filter(
    InventoryLog.log_type == "in",
    InventoryLog.created_at >= datetime(2026, 7, 1) # BUG: InventoryLog TIDAK memiliki kolom created_at!
).all()
```
Model `InventoryLog` di database tidak memiliki kolom `created_at` maupun `tenant_id`. Hal ini menyebabkan PostgreSQL melemparkan error `UndefinedColumn: column inventory_logs.created_at does not exist` sehingga server FastAPI mengembalikan 500 Internal Error dan Nginx menampilkan **502 Bad Gateway**.

---

## 🎯 Target Perubahan

### Backend (`sajen`)
- **`sajen/app/api/v1/insights.py`**:
  - Lakukan `.join(Transaction, Transaction.id == InventoryLog.transaction_id)` pada query `InventoryLog`.
  - Filter secara aman berdasarkan `Transaction.tenant_id == current_user.tenant_id` (terisolasi per tenant) dan `Transaction.status == TransactionStatus.POSTED`.
  - Gunakan `log.transaction.transaction_date` (kolom `Date` resmi dari header transaksi) untuk mengelompokkan data bulanan (`strftime("%Y-%m")`) dan memfilter berdasarkan tahun (`year`).

---

## 🧪 Rencana QC & Pengujian
1. Jalankan pengujian sintaks & query di backend `sajen`.
2. Deploy backend `sajen` (`./deploy.sh sajen`).
3. Lakukan request `GET https://blonjo.samkarsa.com/api/v1/insights/purchase-matrix?year=2026` via curl / browser dan pastikan mengembalikan status `200 OK` dengan payload JSON matriks pembelian bulanan.

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
