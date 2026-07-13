# Rencana Kerja (Plan): Perbaikan Bug Merger Supplier (TenantInventory Preferred Supplier)

Dokumen ini berisi rencana perbaikan untuk menyelesaikan crash `AttributeError` karena model `Product` tidak memiliki kolom `preferred_supplier_id`.

---

## 🛠️ Masalah & Solusi yang Diusulkan

### 1. AttributeError preferred_supplier_id pada model Product
* **Masalah**: Kolom `preferred_supplier_id` ada di model `TenantInventory`, bukan di model `Product`. Pemanggilan `Product.preferred_supplier_id` memicu error 500.
* **Solusi**: Ubah kueri pembaruan di backend pada file `sajen/app/api/v1/inventory.py` agar melakukan update ke tabel `TenantInventory`.

---

## 📅 Peta Eksekusi

1. **Langkah 1**: Edit `sajen/app/api/v1/inventory.py` untuk mengimpor dan memperbarui model `TenantInventory`.
2. **Langkah 2**: Deploy pembaruan ini ke VPS.
3. **Langkah 3**: Verifikasi ulang.
