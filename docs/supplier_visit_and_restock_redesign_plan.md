# Rencana Kerja (Plan): Redesain Rekomendasi Restock & Jadwal Kunjungan Sales Supplier

Dokumen ini berisi rencana perbaikan untuk mendesain ulang antarmuka rekomendasi restock berdasarkan pengelompokan supplier dan perhitungan tanggal belanja berikutnya (`next_purchase`), serta penambahan fitur jadwal kunjungan sales pada master supplier.

---

## 📸 Preview Desain (Mockup)

![Mockup UI Restock Redesign](/Users/user/.gemini/antigravity-cli/brain/a28d9d94-a762-499f-a51f-7e91c078c8aa/restock_ui_redesign_mockup.jpg)

---

## 🛠️ Masalah & Solusi yang Diusulkan

### 1. Modifikasi Tabel & Model Supplier (DB + API)
* **Solusi**: 
  - Tambahkan kolom `sales_visit_day` (String) dan `sales_visit_interval` (Integer) ke model `Contact` di `sajen/app/models/inventory.py`.
  - Daftarkan kolom baru ini pada schema Pydantic `ContactBase`, `ContactCreate`, `ContactUpdate`, dan `ContactResponse` di `sajen/app/schemas/inventory.py`.
  - Buat file migrasi database Alembic untuk mengupdate tabel `contacts`.

### 2. Form Input Jadwal Kunjungan Sales di Frontend
* **Solusi**:
  - Di `SupplierPage.tsx` pada form tambah/edit supplier, tambahkan dropdown pilihan hari kunjungan sales (Senin s.d. Minggu) dan input angka untuk interval kunjungan (berapa hari sekali).

### 3. Redesain Algoritma & API `/recommendations`
* **Solusi**:
  - Ubah respons `/recommendations` di `sajen/app/services/material_control.py` menjadi struktur terkelompok per supplier:
    ```json
    [
      {
        "supplier_id": 1,
        "supplier_name": "Supplier A",
        "last_purchase_date": "YYYY-MM-DD",
        "next_purchase_date": "YYYY-MM-DD",
        "items": [
          { "product_id": 10, "product_name": "Beras", "qty": 100, "unit": "kg" }
        ]
      }
    ]
    ```
  - **Kalkulasi `next_purchase`**:
    * Hitung tanggal pembelian terakhir (`last_purchase_date`).
    * Hitung rata-rata selisih hari dari riwayat transaksi pembelian.
    * Jika transaksi < 2: cari jadwal kunjungan sales terdekat dari supplier. Jika tidak diatur, buat minimal 6 hari setelah pembelian terakhir/hari ini.

### 4. Penyesuaian Halaman Rekomendasi Restock di Frontend
* **Solusi**:
  - Modifikasi file UI rekomendasi restock di `blonjo` (biasanya `RecommendedPurchase.tsx` atau halaman terkait) agar merender row supplier utama beserta tabel bersarang (nested) untuk item yang diusulkan.

---

## 📅 Peta Eksekusi

1. **Langkah 1**: Edit model database `Contact` dan lakukan migrasi Alembic.
2. **Langkah 2**: Perbarui schema Pydantic kontak di backend.
3. **Langkah 3**: Update form supplier di `SupplierPage.tsx` untuk input jadwal kunjungan.
4. **Langkah 4**: Implementasikan perhitungan `next_purchase` dan restrukturisasi respons di `material_control.py`.
5. **Langkah 5**: Modifikasi UI Rekomendasi Restock di frontend untuk merender struktur nested row baru.
6. **Langkah 6**: Deploy ke VPS dan uji coba.

---
*Silakan berikan konfirmasi "Setuju" agar saya langsung mengeksekusi arsitektur restock premium ini.*
