# TODO Checklist: Implementasi Fitur Material Control

Dokumen ini berisi daftar tugas (*TODO Checklist*) sistematis untuk mengimplementasikan fitur **Material Control** pada ekosistem **SAJEN** (Backend FastAPI) dan **BLONJO** (Frontend React). Sesuai dengan instruksi, **fitur POS disisihkan sepenuhnya** dari daftar pengerjaan ini agar tidak terjadi tumpang tindih (*overlapping*).

---

## 🛠️ FASE 1: Migrasi Skema Database (Backend - Sajen)

Tujuan fase ini adalah memperluas model database PostgreSQL yang ada tanpa merusak data transaksi riil.

- [x] **1.1 Perluas Model `Tenant`** (`sajen/app/models/tenant.py` / `setting.py`)
  - Tambahkan kolom `maintenance_stock` (Boolean, default: `False`).
  - Tambahkan kolom `default_po_channel_wa` (Boolean, default: `False`).
  - Tambahkan kolom `default_po_channel_email` (Boolean, default: `False`).
- [x] **1.2 Perluas Model `TenantInventory`** (`sajen/app/models/inventory.py`)
  - Dibanding membuat tabel ekstensi terpisah, tambahkan kolom berikut langsung di `TenantInventory` agar performa *query join* lebih optimal:
    - `safety_stock` (Numeric(15, 2), default: `0.00`)
    - `reorder_point` (Numeric(15, 2), default: `0.00`)
    - `max_stock` (Numeric(15, 2), default: `0.00`)
    - `preferred_supplier_id` (ForeignKey ke `contacts.id`, nullable)
    - `shelf_location` (String(50), nullable)
- [x] **1.3 Buat Model `PurchasePlan` & `PurchasePlanItem`** (`sajen/app/models/inventory.py`)
  - `PurchasePlan`:
    - `id` (Primary Key)
    - `tenant_id` (ForeignKey ke `tenants.id`)
    - `status` (String: `DRAF`, `APPROVED`, `COMPLETED`)
    - `total_amount` (Numeric(15, 2))
    - `planned_date` (Date)
    - `created_at` (Timestamp)
  - `PurchasePlanItem`:
    - `id` (Primary Key)
    - `purchase_plan_id` (ForeignKey ke `purchase_plans.id`)
    - `product_id` (ForeignKey ke `products.id`)
    - `supplier_contact_id` (ForeignKey ke `contacts.id`, nullable)
    - `qty` (Numeric(15, 2))
    - `unit_price` (Numeric(15, 2))
    - `subtotal` (Numeric(15, 2))
- [x] **1.4 Buat Model `StockDiscard` (Waste / Spoilage)** (`sajen/app/models/inventory.py`)
  - `StockDiscard`:
    - `id` (Primary Key)
    - `tenant_id` (ForeignKey ke `tenants.id`)
    - `product_id` (ForeignKey ke `products.id`)
    - `qty` (Numeric(15, 2))
    - `reason` (String: `EXPIRED`, `DAMAGED`, `SPOILED`)
    - `created_at` (Timestamp)
- [x] **1.5 Jalankan Migrasi Alembic**
  - Buat berkas migrasi baru: `alembic revision --autogenerate -m "add_material_control_tables"`
  - Jalankan migrasi di database produksi VPS: `alembic upgrade head`

---

## 🔌 FASE 2: API Endpoints & Logika Bisnis (Backend - Sajen)

Membangun REST API baru di folder `/api/v1/` dan menghubungkannya dengan service akuntansi/persediaan.

- [x] **2.1 Endpoint Kalkulasi ROP & Rekomendasi Belanja** (`/material-control/recommendations`)
  - Buat fungsi di `services/inventory.py` untuk mengidentifikasi produk yang stoknya berada di bawah ROP.
  - Rancang agar jika `maintenance_stock` aktif, gunakan formula *Safety Stock & Lead Time*, jika nonaktif gunakan estimasi rata-rata pembelian historis.
- [x] **2.2 API Rencana Belanja (CRUD)** (`/material-control/purchase-plans`)
  - `GET /` : Menampilkan seluruh rencana belanja per tenant.
  - `POST /` : Membuat rencana belanja draf.
  - `PUT /{id}` : Mengedit draf rencana belanja (ubah qty, override supplier).
  - `POST /{id}/approve` : Menyetujui rencana belanja dan membuat draf jurnal pembelian PSAK UMKM secara otomatis.
- [x] **2.3 API Proyeksi Kas 30 Hari** (`/material-control/cashflow-projection`)
  - Hitung saldo awal kas riil saat ini (dari akun kas `1-1101` dan bank `1-1102`).
  - Tambahkan proyeksi kas masuk harian (rata-rata bergerak omzet harian 3 bulan terakhir).
  - Kurangi rencana pengeluaran belanja (`PurchasePlan`) dan hutang jatuh tempo (`Transaction.due_date`).
- [x] **2.4 API Pembuangan Barang Rusak (Waste)** (`/material-control/stock-discards`)
  - `POST /` : Mencatat barang rusak, mengurangi stok fisik di log, dan memosting draf jurnal penyesuaian PSAK (Debit: Beban Kerusakan Persediaan, Kredit: Persediaan Barang).

---

## 🖥️ FASE 3: Integrasi Antarmuka UI/UX (Frontend - Blonjo)

- [x] **3.1 Buat Halaman Dashboard Material Control** (`src/pages/material-control/MaterialControlHub.tsx`)
  - Tampilkan ringkasan bento grid:
    - Status ROP (Daftar bahan baku kritis yang harus segera direorder).
    - Grafik/Daftar perbandingan harga antar supplier dari histori transaksi pembelian.
- [x] **3.2 Buat Form Editor Rencana Belanja** (`src/pages/material-control/PurchasePlanForm.tsx`)
  - Tampilkan tabel detail barang usulan sistem.
  - Sediakan dropdown untuk mengganti (*override*) supplier per item beserta harga beli terbaik.
  - Integrasikan tombol kirim otomatis PO via WhatsApp.
- [x] **3.3 Buat Halaman Proyeksi Kas Harian** (`src/pages/material-control/BudgetingPage.tsx`)
  - Tampilkan tabel linier 30 hari proyeksi saldo kas.
  - Tambahkan notifikasi/status `WARNING` jika ada perkiraan kas tidak mencukupi untuk rencana belanja.
  - Sediakan tombol aksi cepat (seperti tombol geser tanggal PO rencana belanja).
- [x] **3.4 Tambah Tab / Menu Waste Tracking** (`src/pages/material-control/WasteTracking.tsx`)
  - Form pencatatan kerusakan/kedaluwarsa barang dengan masukan tipe alasan (`EXPIRED`, `DAMAGED`, `SPOILED`).

---

## 🧠 FASE 4: Integrasi AI & Asisten MCP Server (`mcp.samkarsa.com`)

*Detail implementasi teknis dapat dilihat di dokumen rancangan: 👉 **[Rancangan Desain Fase 4 (AI)](file:///Users/user/kerjaan/jualan/docs/material_control_phase4_design.md)***

- [ ] **4.1 Penyelarasan AI OCR Matcher (Auto-Reconciliation)**
  - [ ] Tambahkan endpoint backend `POST /material-control/purchase-plans/{plan_id}/reconcile` untuk pencocokan hasil OCR dengan PO aktif.
  - [ ] Implementasikan pencocokan nama barang menggunakan `pgvector` semantic similarity dan Jaccard/Dice fallback.
  - [ ] Buat UI dialog perbandingan selisih item, harga, dan kuantitas barang di Blonjo setelah koreksi nota selesai.
- [ ] **4.2 AI Product/Part Substitution Recommendation**
  - [ ] Buat API backend `GET /material-control/products/{product_id}/substitutions` untuk mencari produk substitusi yang setara secara semantik.
  - [ ] Tambahkan tombol "Cari Pengganti" (ikon Sparkles) di baris tabel rencana belanja jika barang kosong.
  - [ ] Integrasikan dialog pop-up rekomendasi AI untuk menukar barang secara instan di form rencana belanja.
