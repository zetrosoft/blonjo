# Rencana Kerja: Proyeksi Cashflow H-4 & Logika Inflow Hibrida Hari H

Dokumen ini menjelaskan rencana perbaikan pada kalkulasi proyeksi cashflow agar menampilkan data historis dimulai dari H-4 hingga H+30 ke depan, dengan detail visualisasi data aktual vs data proyeksi pada hari H.

---

## 🔍 Analisa Kebutuhan Bisnis

1. **Rentang Waktu Tampilan (T-4 s/d T+30)**:
   * Saat ini tabel cashflow projection hanya menampilkan data mulai dari hari H (hari ini) sampai 30 hari ke depan (T+30).
   * Kebutuhan baru meminta tabel menyajikan data dari **H-4** (4 hari sebelum hari ini) agar pengguna bisa melihat tren aktual kas beberapa hari ke belakang.
2. **Kombinasi Data Aktual & Proyeksi pada Hari H (Hari Ini)**:
   * **Sebelum Hari H**: Menggunakan data **Aktual** murni (uang masuk/inflow riil yang tercatat di pembukuan/jurnal).
   * **Hari H (Hari Ini)**:
     * Jika total transaksi masuk riil (aktual) hari ini masih **nol (Rp 0)**, atau
     * Waktu lokal saat ini **belum melewati jam 18:00 WIB**,
     * Maka sistem harus menampilkan **proyeksi inflow prediktif** (bukan nol aktual, agar grafik likuiditas hari ini tidak drop seolah-olah tidak ada pendapatan sama sekali).
     * Di luar kondisi di atas (sudah ada penjualan masuk ATAU sudah lewat jam 18:00), sistem akan menampilkan data **Aktual**.

---

## 🛠️ Langkah Perbaikan (Action Plan)

### Fase 1: Backend (Sajen - `material_control.py`)
Kita akan memperbarui fungsi `generate_cashflow_projection` di `/Users/user/kerjaan/jualan/sajen/app/services/material_control.py`:
1. **Perluas Rentang Simulasi Visual**:
   * Ubah loop visual agar berjalan dari `d` dalam range `[-4, 30]`.
   * Hari `H-4` sampai `H-1` (yaitu `d < 0`) akan mengambil data dari snapshot database atau menghitung total transaksi kas masuk (debit) & kas keluar (kredit) riil yang sudah *posted* pada tanggal tersebut.
2. **Implementasi Logika Jam 18:00 WIB & Inflow Hibrida**:
   * Ambil waktu server saat ini dan konversikan ke zona waktu Asia/Jakarta (WIB).
   * Untuk `d == 0` (Hari H):
     * Cek apakah `actual_inflow_today == 0` ATAU `current_hour < 18`.
     * Jika ya, set `inflow_val = projected_inflow` (menggunakan baseline prediktif AI).
     * Jika tidak, set `inflow_val = actual_inflow_today`.

### Fase 2: Frontend (Blonjo - `BudgetingPage.tsx`)
1. Memastikan sorting baris tabel tetap urut dari tanggal paling lampau (`H-4`) ke paling depan (`H+30`).
2. Menambahkan indikator penanda visual (badge/icon) yang jelas pada baris yang merupakan hari historis (`H-4` sampai `H-1`), Hari H (dengan keterangan apakah statusnya Proyeksi/Aktual), dan hari mendatang.

---

## 🔄 Pengujian & Deployment
1. Jalankan `./deploy.sh sajen-api sajen-worker` untuk menerapkan logika backend baru di VPS.
2. Lakukan verifikasi di antarmuka web untuk memastikan data cashflow projection dimulai dari 4 hari sebelum hari ini dengan kalkulasi saldo kas yang sinkron berurutan (rollover).
