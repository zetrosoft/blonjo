# Plan: Sistem Pengelolaan Dana Titipan Pelanggan & Pemantauan Likuiditas Toko

## 📋 Ringkasan Fitur
Fitur ini bertujuan untuk mengelola dan memantau **Dana Paket Lebaran & Tabungan Customer** agar tidak tercampur dengan Modal Pemilik, serta memberikan sistem peringatan dini (*Liquidity Reserve Warning*) agar toko terhindar dari krisis tunai (*cash crunch*).

---

## 🎯 Target Perubahan & Arsitektur

### 1. Backend (`sajen`)
- **Tipe Transaksi Baru (Enum & Seed Mapping)**:
  - Tambahkan `CUSTOMER_DEPOSIT = "customer_deposit"` (Setor Tabungan/Paket Lebaran) dan `CUSTOMER_WITHDRAWAL = "customer_withdrawal"` (Tarik Tabungan) ke `TransactionType` di `app/models/accounting.py`.
  - Daftarkan akun kewajiban di `seed_psak_complete.py`:
    - `2-1201`: **Hutang Uang Muka Paket Lebaran** (Liabilitas)
    - `2-1202`: **Hutang Tabungan Pelanggan** (Liabilitas)
  - Daftarkan default `JournalMapping` di database:
    - `customer_deposit` ➔ Debet: Kas/Bank (`1-1101`), Kredit: Hutang Tabungan Pelanggan (`2-1202`).
    - `customer_withdrawal` ➔ Debet: Hutang Tabungan Pelanggan (`2-1202`), Kredit: Kas/Bank (`1-1101`).

- **API Metrik Likuiditas (`app/api/v1/accounting.py` atau `reports.py`)**:
  - Buat endpoint `GET /finance/deposit-liquidity-metrics` untuk menghitung:
    - `total_customer_deposits`: Total saldo kewajiban tabungan/paket lebaran (`2-1201` & `2-1202`).
    - `cash_reserve`: Total kas tunai & bank saat ini (`1-1101` & `1-1102`).
    - `reserve_ratio`: Persentase kas cadangan terhadap total tabungan (`cash_reserve / total_customer_deposits * 100%`).
    - `status`: `"healthy"` (>= 30%), `"warning"` (15-30%), `"critical"` (< 15%).
    - `deposit_dependency_ratio`: Persentase dana titipan terhadap total modal kerja toko.

### 2. Frontend (`blonjo`)
- **Master Data Mapping Jurnal (`JournalMappingPage.tsx`)**:
  - Tambahkan opsi **"Setor Tabungan / Paket Lebaran"** (`customer_deposit`) dan **"Penarikan Tabungan Pelanggan"** (`customer_withdrawal`) pada pilihan tipe transaksi.
- **Smart Parser & Confirm Dialog (`smartParser.ts` & `useSmartConfirm.ts`)**:
  - Kenali kata kunci smart note: `"tabungan customer"`, `"setor paket lebaran"`, `"tabungan lebaran"`, `"tarik tabungan"` ➔ otomatis diarahkan ke `customer_deposit` / `customer_withdrawal`.
- **Widget Monitor Likuiditas (`Dashboard.tsx` / `BusinessCompass.tsx`)**:
  - Tampilkan Bento Card **"Pemantau Dana Titipan & Likuiditas"** di Dashboard yang menyajikan:
    - Total Dana Titipan Pelanggan (Rp).
    - Status Kesehatan Cadangan Kas (Aman / Waspada / Kritis dengan badge warna).
    - Bar indikator alokasi rasio aman (30% Cadangan Tunai | 50% Lock Price Supplier | 30% Fast Restock).

### 3. Koreksi Jurnal Historis 12 Juta
- Buat penyesuaian jurnal historis (bisa diinput via Smart Note / Manual Entry):
  - **Debet**: Modal Pemilik (`3-1101`) Rp 12.000.000
  - **Kredit**: Hutang Tabungan Pelanggan (`2-1202`) Rp 12.000.000

---

## 🧪 Rencana Pengujian
1. Buka halaman **Mapping Jurnal**, pastikan tipe transaksi `customer_deposit` dan `customer_withdrawal` dapat diatur.
2. Input Smart Note: `"Setoran tabungan lebaran ibu tutik 300rb tunai"`.
   - Verifikasi jurnal: Debet: Kas (300.000), Kredit: Hutang Uang Muka Paket Lebaran / Tabungan (300.000).
3. Cek Widget Dashboard **Pemantau Dana Titipan & Likuiditas**:
   - Pastikan angka total dana titipan dan rasio kesehatan kas terhitung secara akurat real-time.

---

## 🚀 Deployment Plan
1. Re-build dan Deploy backend API: `./deploy.sh sajen`
2. Re-build dan Deploy UI frontend: `./deploy.sh blonjo-ui`

---

## 📝 Changelog

### 2026-08-17 - Sistem Pengelolaan Dana Titipan Pelanggan & Pemantauan Likuiditas Toko
- **Backend (`sajen`)**:
  - `app/models/accounting.py`: Menambahkan `CUSTOMER_DEPOSIT` dan `CUSTOMER_WITHDRAWAL` ke Enum `TransactionType`.
  - `app/seed_psak_complete.py`: Mendaftarkan akun `2-1205` ("Hutang Uang Muka Paket Lebaran") & `2-1206` ("Hutang Tabungan Pelanggan") serta default `JournalMapping` untuk `CUSTOMER_DEPOSIT` dan `CUSTOMER_WITHDRAWAL`.
  - `app/services/smart_parser.py`: Menambahkan pengenalan kata kunci `"tabungan customer"`, `"paket lebaran"`, `"setor paket"`, `"tarik tabungan"` pada AI & heuristic parser.
  - `app/api/v1/accounting.py`: Menambahkan endpoint API `/finance/deposit-liquidity-metrics` untuk menghitung rasio cadangan kas tunai, total dana titipan, status kesehatan likuiditas (Aman / Waspada / Kritis), dan rekomendasi alokasi formula 20-50-30.
- **Frontend (`blonjo`)**:
  - `src/lib/smartParser.ts`: Menambahkan tipe `customer_deposit` dan `customer_withdrawal` pada kategori transaksi & union type.
  - `src/pages/master-data/JournalMappingPage.tsx`: Menambahkan opsi pemetaan untuk **"Setor Tabungan / Paket Lebaran"** dan **"Penarikan Tabungan Pelanggan"**.
  - `src/components/DepositLiquidityCard.tsx`: Membuat widget Bento Card baru **"Pemantau Likuiditas & Dana Titipan"** di Dashboard yang menyajikan metrik rasio likuiditas dan rekomendasi alokasi 20-50-30 secara real-time.
  - `src/pages/Dashboard.tsx`: Menampilkan `DepositLiquidityCard` di halaman utama dashboard.

