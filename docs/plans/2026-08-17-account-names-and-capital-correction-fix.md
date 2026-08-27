# Plan: Formalisasi Nama Akun Titipan & Penanganan Jurnal Koreksi Modal

## 📋 Ringkasan Permintaan
1. **Formalisasi Nama Akun**: Ubah nama akun `2-1205` dan `2-1206` dari spesifik (*Paket Lebaran & Tabungan Pelanggan*) menjadi istilah standar akuntansi formal yang lebih luas:
   - `2-1205`: **Uang Muka Pelanggan / Titipan Penjualan**
   - `2-1206`: **Simpanan / Titipan Dana Pelanggan**
   - Perbarui label transaksi di UI:
     - `customer_deposit` ➔ **Penerimaan Uang Muka / Titipan Pelanggan**
     - `customer_withdrawal` ➔ **Pengembalian Titipan Pelanggan**

2. **Penanganan Jurnal Koreksi Pemindahan Modal ke Titipan**:
   - Tambahkan pengenalan otomatis untuk frasa koreksi/reklasifikasi modal (misal: `"koreksi modal"`, `"pindah modal"`, `"koreksi pemindahan dari modal"`).
   - Jurnal Koreksi yang dihasilkan secara otomatis:
     - **Debet**: Modal Pemilik (`3-1101`)
     - **Kredit**: Simpanan / Titipan Dana Pelanggan (`2-1206`)

---

## 🎯 Target Perubahan

### 1. Backend (`sajen`)
- **`app/seed_psak_complete.py` & Seed Script**:
  - Ubah nama akun `2-1205` menjadi `"Uang Muka Pelanggan"` dan `2-1206` menjadi `"Simpanan / Titipan Dana Pelanggan"`.
  - Perbarui nama deskripsi mapping `customer_deposit` dan `customer_withdrawal`.
- **`app/services/smart_parser.py`**:
  - Perbarui `_TYPE_DESCRIPTION` dengan nama formal.
  - Tambahkan aturan deteksi frasa koreksi modal (`"koreksi modal"`, `"pindah modal"`, `"reklasifikasi modal"`). Jika terdeteksi, berikan entri jurnal penyesuaian:
    - **Debet**: Modal Pemilik (`3-1101`)
    - **Kredit**: Simpanan / Titipan Dana Pelanggan (`2-1206`)

### 2. Frontend (`blonjo`)
- **`src/lib/smartParser.ts`**:
  - Perbarui label kategori `customer_deposit` dan `customer_withdrawal` dengan nama formal.
  - Tambahkan pengenalan kata kunci koreksi modal.
- **`src/pages/master-data/JournalMappingPage.tsx`**:
  - Perbarui label pilihan tipe transaksi di dropdown dengan istilah formal.
- **`src/components/DepositLiquidityCard.tsx`**:
  - Perbarui label UI agar selaras dengan nama formal (*Titipan Pelanggan & Uang Muka*).

---

## 🧪 Rencana Pengujian
1. Input Smart Note: `"Koreksi pemindahan dari modal pemilik ke hutang titipan tabungan pelanggan 12.000.000"`.
2. Verifikasi entri jurnal otomatis di modal konfirmasi:
   - **Debet**: Modal Pemilik (Rp12.000.000)
   - **Kredit**: Simpanan / Titipan Dana Pelanggan (Rp12.000.000)
3. Cek halaman Master Data ➔ Chart of Accounts & Mapping Jurnal untuk memverifikasi penamaan formal akun baru.

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
2. Deploy UI frontend: `./deploy.sh blonjo-ui`

---

## 📝 Changelog

### 2026-08-17 - Formalisasi Nama Akun Titipan & Penanganan Jurnal Koreksi Modal
- **Backend (`sajen`)**:
  - `app/seed_psak_complete.py`: Mengubah nama akun `2-1205` menjadi `"Uang Muka Pelanggan"` dan `2-1206` menjadi `"Simpanan / Titipan Dana Pelanggan"`. Serta memperbarui nama deskripsi mapping `customer_deposit` dan `customer_withdrawal`.
  - `app/services/accounting.py`: Menambahkan penanganan khusus untuk transaksi Koreksi / Reklasifikasi Pemindahan Modal Pemilik ke Titipan Pelanggan (`is_capital_reclass`), yang secara otomatis menghasilkan entri jurnal: **Debet: Modal Pemilik (`3-1101`)** dan **Kredit: Simpanan / Titipan Dana Pelanggan (`2-1206`)**.
- **Frontend (`blonjo`)**:
  - `src/lib/smartParser.ts`: Memperbarui label kategori menjadi **"Penerimaan Uang Muka / Titipan Pelanggan"** (`customer_deposit`) dan **"Pengembalian Titipan Pelanggan"** (`customer_withdrawal`).
  - `src/pages/master-data/JournalMappingPage.tsx`: Memperbarui label pilihan tipe transaksi di dropdown dengan nama formal standar akuntansi.
  - `src/components/DepositLiquidityCard.tsx`: Memperbarui subtitle & label widget menjadi **"Uang Muka & Simpanan Pelanggan"**.

