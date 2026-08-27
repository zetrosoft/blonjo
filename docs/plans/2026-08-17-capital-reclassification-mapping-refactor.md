# Plan: Dynamic Journal Mapping untuk Koreksi Reklasifikasi Modal (100% Tanpa Hardcode)

## 📋 Ringkasan Masalah & Arsitektur
Pengguna menegaskan prinsip arsitektur: **Seluruh pasangan akun jurnal HARUS menggunakan Journal Mapping dari database, TIDAK boleh di-hardcode di kode program.**

Solusi arsitektur yang 100% berbasis database mapping:
1. Daftarkan jenis transaksi resmi **`capital_reclassification` (Koreksi Reklasifikasi Modal)** pada Enum, Database, dan UI Mapping Jurnal.
2. Simpan pemetaan jurnalnya di tabel `journal_mappings` & `journal_mapping_lines` di database:
   - **Debet**: Modal Pemilik (Akun Ekuitas yang dipetakan user)
   - **Kredit**: Simpanan / Titipan Dana Pelanggan (Akun Liabilitas yang dipetakan user)
3. Hapus seluruh blok *special handling hardcode* di backend `accounting.py`. Seluruh entri jurnal diambil secara dinamis dari DB.

---

## 🎯 Target Perubahan

### 1. Backend (`sajen`)
- **Model Enum (`app/models/accounting.py`)**:
  - Tambahkan `CAPITAL_RECLASSIFICATION = "capital_reclassification"`.
- **Database Seeding (`app/seed_psak_complete.py`)**:
  - Daftarkan default `JournalMapping` untuk `CAPITAL_RECLASSIFICATION`:
    - Debet: `3-1101` (Modal Pemilik)
    - Kredit: `2-1206` (Simpanan / Titipan Dana Pelanggan)
- **Engine Jurnal (`app/services/accounting.py`)**:
  - Hapus blok hardcode `is_capital_reclass`. Serahkan pembentukan jurnal ke `JournalMapping` database query.
- **Smart Parser AI (`app/services/smart_parser.py`)**:
  - Parser mendeteksi kata kunci koreksi/reklasifikasi modal ➔ menetapkan `transaction_type = "capital_reclassification"`.

### 2. Frontend (`blonjo`)
- **Master Data Mapping Jurnal (`src/pages/master-data/JournalMappingPage.tsx`)**:
  - Tambahkan opsi **"Koreksi Reklasifikasi Modal"** (`capital_reclassification`) di dropdown mapping agar user bisa mengubah akun Debet/Kredit kapan saja via UI.
- **Parser & Confirm Hook (`smartParser.ts` & `useSmartConfirm.ts`)**:
  - Daftarkan `capital_reclassification` pada kategori & fallback mapping.

---

## 🧪 Rencana Pengujian
1. Buka menu **Master Data ➔ Mapping Jurnal**, verifikasi ada opsi **"Koreksi Reklasifikasi Modal"**.
2. Input Smart Note: `"Koreksi pemindahan dari modal pemilik ke hutang titipan tabungan pelanggan 12.000.000"`.
3. Verifikasi entri jurnal yang muncul 100% diambil dari DB Journal Mapping:
   - Debet: Modal Pemilik (Rp12.000.000)
   - Kredit: Simpanan / Titipan Dana Pelanggan (Rp12.000.000)

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
2. Deploy UI frontend: `./deploy.sh blonjo-ui`

---

## 📝 Changelog

### 2026-08-17 - Dynamic Journal Mapping Koreksi Reklasifikasi Modal (100% Bebas Hardcode)
- **Backend (`sajen`)**:
  - `app/models/accounting.py`: Menambahkan `CAPITAL_RECLASSIFICATION = "capital_reclassification"` ke `TransactionType` Enum.
  - `app/seed_psak_complete.py`: Mendaftarkan default `JournalMapping` database untuk `CAPITAL_RECLASSIFICATION` (Debet: Modal Pemilik `3-1101`, Kredit: Simpanan / Titipan Dana Pelanggan `2-1206`).
  - `app/services/accounting.py`: Menghapus seluruh blok hardcode `is_capital_reclass`. Seluruh entri jurnal kini 100% diambil dari DB `JournalMapping`.
  - `app/services/smart_parser.py`: Mengarahkan deteksi kalimat koreksi/reklasifikasi pemindahan modal ke `capital_reclassification`.
- **Frontend (`blonjo`)**:
  - `src/pages/master-data/JournalMappingPage.tsx`: Menambahkan opsi **"Koreksi Reklasifikasi Modal"** (`capital_reclassification`) di dropdown halaman Mapping Jurnal.
  - `src/lib/smartParser.ts` & `src/pages/transaction/hooks/useSmartConfirm.ts`: Menambahkan tipe `capital_reclassification` pada parser & keymap.

