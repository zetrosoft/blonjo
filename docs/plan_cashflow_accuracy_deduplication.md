# Plan: Deduplikasi Baris pada Catatan Akurasi Harian (Cashflow Accuracy Log)

## 1. Analisis Masalah (Root Cause)
* **Gejala**: Halaman "Catatan Akurasi Harian" menampilkan baris ganda (duplikat) untuk tanggal target yang sama (contoh: `2026-07-07` muncul 3 kali, `2026-07-06` muncul 2 kali).
* **Penyebab**: Setiap kali proyeksi cashflow dijalankan pada tanggal `projection_date` yang berbeda, sistem menyimpan snapshot baru untuk hari-hari ke depan (`target_date`). Fungsi `get_projection_accuracy` menarik semua snapshot ini secara mentah tanpa pengelompokan (grouping) atau deduplikasi, sehingga semua versi proyeksi di tanggal yang berbeda untuk satu hari target yang sama ditampilkan sekaligus di UI.

---

## 2. Rencana Solusi Arsitektur
Untuk menyajikan data akurasi harian yang bersih (satu baris per hari target), kita perlu mengimplementasikan deduplikasi di backend pada fungsi `get_projection_accuracy` di [sajen/app/services/material_control.py](file:///Users/user/kerjaan/jualan/sajen/app/services/material_control.py):

* **Algoritma Pemilihan Snapshot**:
  1. Urutkan semua snapshot berdasarkan `target_date` secara menaik (ascending) dan `projection_date` secara menurun (descending).
  2. Kelompokkan snapshot berdasarkan `target_date` (1 baris per hari).
  3. Untuk setiap `target_date`, pilih snapshot yang paling representatif:
     * **Prioritas Utama**: Snapshot yang diproyeksikan **sebelum** hari target (`projection_date < target_date`), dengan mengutamakan proyeksi terbaru (misalnya H-1). Ini mengukur akurasi ramalan kas yang sesungguhnya.
     * **Prioritas Kedua (Fallback)**: Jika tidak ada proyeksi masa lalu (misalnya hari pertama sistem berjalan), gunakan snapshot hari H (`projection_date == target_date`).

---

## 3. Langkah Koding & Eksekusi
1. Edit fungsi `get_projection_accuracy` di [sajen/app/services/material_control.py](file:///Users/user/kerjaan/jualan/sajen/app/services/material_control.py) dengan algoritma deduplikasi Python di atas.
2. Lakukan build dan testing backend lokal.
3. Deploy service `sajen-api` dan `sajen-worker` ke VPS.
