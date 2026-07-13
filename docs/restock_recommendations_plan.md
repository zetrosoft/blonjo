# Rencana Kerja (Plan): Rekomendasi Restock Cerdas Berdasarkan Pengaturan Maintenance Stock

Dokumen ini berisi rencana perbaikan untuk mengimplementasikan algoritma restock cerdas berdasarkan status pelacakan stok tenant (`maintenance_stock`).

---

## 🛠️ Masalah & Solusi yang Diusulkan

### 1. Rekomendasi Pembelian Dinamis
* **Masalah**: Fitur "Smart Restock Recommendations" saat ini hanya mengandalkan perhitungan sisa stok (`static_stock < reorder_point`), yang akan selalu kosong jika tenant mematikan pelacakan stok (`maintenance_stock = False`).
* **Solusi**:
  - Di file `sajen/app/services/material_control.py`, perbarui fungsi `get_replenishment_recommendations`.
  - **Jika `maintenance_stock` = `True`**: Pertahankan logika ROP berdasarkan level stok saat ini.
  - **Jika `maintenance_stock` = `False`**: Hitung estimasi belanja berdasarkan riwayat frekuensi transaksi pembelian dan rata-rata kuantitas (`proposed_qty = total_qty_pembelian / frekuensi_transaksi_pembelian`) dalam rentang 180 hari terakhir (atau sepanjang masa jika belum ada transaksi baru).

---

## 📅 Peta Eksekusi

1. **Langkah 1**: Modifikasi `get_replenishment_recommendations` di `sajen/app/services/material_control.py` sesuai aturan percabangan `maintenance_stock`.
2. **Langkah 2**: Deploy kode ke VPS produksi.
3. **Langkah 3**: Verifikasi pemuatan rekomendasi di halaman Restock Blonjo.

---
*Silakan berikan konfirmasi Anda agar saya langsung memproses perubahan ini.*
