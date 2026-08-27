# Plan: Perbaikan ImportError JournalEntryLine pada Backend Sajen API

## 📋 Ringkasan Masalah & Bukti Log Docker
Berdasarkan log Docker container `sajen_backend_api` di server VPS:
```text
ImportError: cannot import name 'JournalEntryLine' from 'app.models.accounting' (/app/app/models/accounting.py)
```
Penyebab:
Pada `sajen/app/api/v1/accounting.py` line 23 & 548-558, nama kelas model `JournalEntryLine` diimpor dan dipanggil, padahal kelas model resmi di `app.models.accounting` bernama **`JournalEntry`**. Hal ini membuat service backend `sajen-api` crash saat uvicorn meload modul, sehingga Nginx mengembalikan **502 Bad Gateway**.

---

## 🎯 Target Perubahan

### Backend (`sajen`)
- **`sajen/app/api/v1/accounting.py`**:
  - Ganti impor `JournalEntryLine` menjadi **`JournalEntry`** pada baris 23.
  - Ganti panggilan `session.query(JournalEntryLine)` menjadi **`session.query(JournalEntry)`** pada baris 548 dan 557.

---

## 🧪 Rencana QC & Pengujian
1. Perbaiki impor di `accounting.py`.
2. Deploy service backend: `./deploy.sh sajen`.
3. Periksa status container & log via SSH `ssh vps-server "docker logs sajen_backend_api --tail 30"`.
4. Verifikasi `sajen-api` berjalan sehat (Status: Up / Healthy) dan Nginx dapat mengakses API tanpa error 502.

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
