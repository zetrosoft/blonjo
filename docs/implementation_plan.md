# Rencana Implementasi: Integrasi Data Riil Master Data & Pembaharuan Log Transaksi Mentah

Rencana ini bertujuan untuk menyempurnakan integrasi data di aplikasi **Blonjo** dengan menggantikan data tiruan (*mock data*) di semua submenu Master Data dengan data riil dari backend API, serta merombak halaman Riwayat Transaksi agar menampilkan data hasil input riil (melalui `inventory_logs`) dan menyajikan detail pembukuan sebagai log transaksi/aliran dana mentah, bukan sebagai tabel debit-kredit akuntansi yang kaku.

---

## User Review Required

> [!IMPORTANT]
> - **Pembersihan Data Mock**: Semua submenu Master Data (Katalog Produk, Mitra Pemasok, Pelanggan Setia, Satuan Ukuran) akan dihubungkan langsung ke backend API. Jika koneksi backend gagal atau data kosong, sistem akan menampilkan pesan error profesional atau halaman kosong dengan tombol muat ulang, tanpa pernah menggunakan data mock statis sebagai fallback penyelamat.
> - **Integrasi Log Persediaan Riil**: Halaman detail riwayat transaksi akan dimodifikasi untuk menggunakan `inventory_logs` dari backend secara dinamis guna menampilkan daftar barang belanjaan yang dibeli/dijual. Ini menyelesaikan bug visual di mana tabel detail barang kosong karena menggunakan properti `items` yang tidak ada di schema API backend.
> - **Log Jurnal Mentah (Log Aliran Dana)**: Rincian entri jurnal akuntansi ganda (`selectedTx.entries`) tidak akan ditampilkan dalam format tabel debit-kredit formal akuntansi (yang membingungkan non-akuntan). Sebagai gantinya, rincian ini disajikan sebagai daftar **Log Aliran Dana & Jurnal Mentah** yang intuitif (menunjukkan akun mana yang bertambah/berkurang dengan indikator visual hijau/merah).

---

## Rincian Perubahan Kode

### 1. Katalog Produk (`blonjo/src/pages/master-data/ItemPage.tsx`)
* **[MODIFY] [ItemPage.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/master-data/ItemPage.tsx)**:
  - Mengintegrasikan call API `/inventory/products` menggunakan `fetchClient`.
  - Menghapus fallback ke `MOCK_ITEMS`. Jika terjadi error, tampilkan toast kesalahan dan biarkan state produk kosong `[]`.
  - Memetakan properti backend (`current_stock` ke `stock`, `unit` ke `uom`) secara dinamis.
  - Menghitung status stok (`active`, `low_stock`, `out_of_stock`) secara cerdas berdasarkan `current_stock` dan `min_stock_level`.

### 2. Pelanggan Setia (`blonjo/src/pages/master-data/CustomerPage.tsx`)
* **[MODIFY] [CustomerPage.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/master-data/CustomerPage.tsx)**:
  - Mengintegrasikan call API `/inventory/contacts?contact_type=customer` menggunakan `fetchClient`.
  - Menghapus fallback ke `MOCK_CUSTOMERS`. Jika terjadi error, biarkan data kosong dan beri notifikasi kepada user.
  - Memetakan field balance (`current_balance` ke `receivable_balance` sebagai piutang dagang).

### 3. Mitra Pemasok (`blonjo/src/pages/master-data/SupplierPage.tsx`)
* **[MODIFY] [SupplierPage.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/master-data/SupplierPage.tsx)**:
  - Mengintegrasikan call API `/inventory/contacts?contact_type=supplier` menggunakan `fetchClient`.
  - Menghapus fallback ke `MOCK_SUPPLIERS`. Jika terjadi error, data diset kosong.
  - Memetakan field balance (`current_balance` ke `outstanding_balance` sebagai utang dagang).

### 4. Satuan Ukuran (`blonjo/src/pages/master-data/UomPage.tsx`)
* **[MODIFY] [UomPage.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/master-data/UomPage.tsx)**:
  - Melakukan call ke `/inventory/products` untuk mengekstrak satuan-satuan (`unit`) unik yang terdaftar secara resmi di database.
  - Menyediakan default UoM standar bawaan sistem (pcs, kg, ltr, dll.) yang sah jika database kosong, namun menampilkan error state jika koneksi API gagal secara total (tidak menggunakan mock statis).

### 5. Riwayat Log Transaksi (`blonjo/src/pages/transaction/daftar-input.tsx`)
* **[MODIFY] [daftar-input.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/transaction/daftar-input.tsx)**:
  - Mengubah tabel detail barang agar membaca data dari `selectedTx.inventory_logs` alih-alih `selectedTx.items`.
  - Setiap log barang belanjaan akan memetakan properti `product.name`, `quantity`, `price_per_unit`, dan menghitung total subtotal secara dinamis.
  - Menambahkan bagian baru di dalam detail dialog: **"Log Aliran Dana & Jurnal Mentah"**.
  - Bagian ini akan membaca data jurnal `selectedTx.entries` dan menerjemahkannya ke format log naratif yang mudah dipahami:
    - Contoh: `🟢 [Kas Utama] bertambah +Rp 150.000 (Debit)`
    - Contoh: `🔴 [Persediaan Barang] berkurang -Rp 150.000 (Kredit)`
    - Logic penambahan/pengurangan disesuaikan dengan tipe akun akuntansi (`AccountType`).

---

## Rencana Verifikasi (Verification Plan)

### 1. Automated Compile Check
Menjalankan kompilasi proyek React Blonjo untuk memvalidasi tipe TypeScript dan impor:
```bash
cd blonjo
pnpm run build
```

### 2. Manual Verification
1. **Verifikasi Master Data**:
   - Buka menu Katalog Produk, Pelanggan, Supplier, dan Satuan.
   - Pastikan data dimuat langsung dari backend API.
   - Hentikan server backend (atau simulasi network error) dan pastikan halaman menunjukkan state error / data kosong, bukan menampilkan data mock.
2. **Verifikasi Riwayat Transaksi**:
   - Buat transaksi baru melalui form smart input.
   - Buka menu Riwayat Transaksi, lalu klik transaksi yang baru saja diinput.
   - Pastikan detail barang yang dibeli muncul dengan benar di tabel detail barang (berasal dari `inventory_logs`).
   - Pastikan bagian **"Log Aliran Dana & Jurnal Mentah"** muncul dengan visualisasi yang menarik, mudah dipahami, dan akurat berdasarkan entri jurnal di database.
