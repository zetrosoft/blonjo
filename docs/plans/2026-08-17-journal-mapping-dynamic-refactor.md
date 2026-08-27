# Plan: Refactoring Dynamic Journal Mapping untuk Transaksi Modal (Bebas Hardcode)

## 📋 Ringkasan Masalah Arsitektur
Saat ini, penanganan jurnal modal di backend (`sajen`) dan frontend (`blonjo`) menggunakan pengkodean langsung (*hardcode*) nomor akun (seperti `"3-1101"`, `"1-1101"`, `"kas"`, `"modal"`). 

Hal ini kurang fleksibel karena:
1. Pengguna tidak bisa mengubah pemetaan akun melalui halaman **Mapping Jurnal** (`JournalMappingPage`).
2. Jika struktur Bagan Akun (CoA) toko disesuaikan, sistem akan tetap memanggil nomor akun hardcode tersebut.

---

## 🎯 Target Perubahan Arsitektur

### 1. Backend (`sajen`)
- **Tipe Transaksi Baru (Enum)**:
  - Tambahkan `TransactionType.CAPITAL_WITHDRAWAL = "capital_withdrawal"` pada `app/models/accounting.py` dan migration/enum.
- **Dynamic Mapping Engine (`app/services/accounting.py`)**:
  - Hapus blok *Special Handling Hardcode* (`3-1101` / `1-1101`).
  - Biarkan `generate_suggested_entries` secara konsisten membaca pemetaan dari tabel `JournalMapping` dan `JournalMappingLine` yang tersimpan di database.
- **Smart Parser AI (`app/services/smart_parser.py`)**:
  - AI parser mendeteksi apakah transaksi modal merupakan `capital` (Setoran Modal) atau `capital_withdrawal` (Pengembalian Modal).
- **Database Seeding (`seed_psak_complete.py` / DB Seed)**:
  - Tambahkan pemetaan standar di DB:
    - **`capital`**: Debet: Kas (`1-1101`), Kredit: Modal Pemilik (`3-1101`).
    - **`capital_withdrawal`**: Debet: Modal Pemilik (`3-1101`), Kredit: Kas (`1-1101`).

### 2. Frontend (`blonjo`)
- **Master Data Mapping Jurnal (`src/pages/master-data/JournalMappingPage.tsx`)**:
  - Tambahkan pilihan tipe transaksi **"Pengembalian Modal (Prive)"** (`capital_withdrawal`) agar pengguna dapat secara mandiri mengatur pasangan akun Debet & Kredit dari UI.
- **Dynamic Confirm Hook (`src/pages/transaction/hooks/useSmartConfirm.ts`)**:
  - Gunakan `suggested_entries` dari API backend yang bersumber dari `JournalMapping` DB secara dinamis tanpa melakukan hardcode keyword akun di client-side.

---

## 🧪 Rencana Pengujian
1. Buka halaman **Master Data -> Mapping Jurnal**.
2. Verifikasi ada opsi pemetaan untuk **Setoran Modal** dan **Pengembalian Modal**.
3. Uji transaksi Smart Note: `"Pengembalian penyertaan modal 1.000.000 tunai"`.
4. Pastikan entri jurnal yang dihasilkan murni berasal dari data `JournalMapping` di database tanpa hardcode.

---

## 🚀 Deployment Plan
1. Jalankan Alembic migration di VPS server untuk tipe enum transaksi baru.
2. Deploy service API: `./deploy.sh sajen`
3. Deploy service UI: `./deploy.sh blonjo-ui`

---

## 📝 Changelog

### 2026-08-17 - Refactoring Dynamic Journal Mapping untuk Transaksi Modal (Bebas Hardcode)
- **Backend (`sajen`)**:
  - `app/models/accounting.py`: Menambahkan `CAPITAL_WITHDRAWAL = "capital_withdrawal"` ke `TransactionType` enum.
  - `app/services/accounting.py`: Menghapus blok hardcode *special handling* pada `CAPITAL`. Seluruh jurnal kini dibentuk 100% secara dinamis dari tabel DB `JournalMapping` & `JournalMappingLine`.
  - `app/services/smart_parser.py`: Memperbarui parser agar mengategorikan penarikan modal ke `capital_withdrawal` secara otomatis.
  - `app/seed_psak_complete.py`: Mendaftarkan default `JournalMapping` untuk `CAPITAL_WITHDRAWAL` (Debet: `3-1101`, Kredit: `1-1101`).
- **Frontend (`blonjo`)**:
  - `src/pages/master-data/JournalMappingPage.tsx`: Menambahkan opsi **"Pengembalian Modal (Prive)"** (`capital_withdrawal`) pada dropdown tipe transaksi di halaman Mapping Jurnal.
  - `src/lib/smartParser.ts` & `src/pages/transaction/hooks/useSmartConfirm.ts`: Menambahkan tipe `capital_withdrawal` pada parser dan default mapping.

