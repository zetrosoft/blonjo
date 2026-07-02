# Checklist Tugas: Implementasi Master Data Global & AI Pricing Rule

### Tahap 1: Migrasi Database (Backend)
- [x] Buat model `ProductCategory` (Global, tanpa `tenant_id`).
- [x] Buat model `ProductUnitConversion` (Global, relasi ke Product).
- [x] Modifikasi model `Product`:
    - [x] Hapus `tenant_id` dan `current_stock`.
    - [x] Tambahkan FK `category_id`.
    - [x] Tambahkan logic Auto-SKU Generation. (Implemented: Unique SKU Index, logic generator di service).
- [x] Buat model `TenantInventory`:
    - [x] Tambahkan field `static_stock` dan `moving_average_cost`.
    - [x] Implementasikan checkbox/flag `stock_maintenance` di tabel Setting.
- [x] Buat model `TenantProductPrice` (Pricing Dasar).
- [x] Buat model `TenantPricingRule` dengan kolom `rule_payload` (JSONB).

### Tahap 2: API & Logic (Backend)
- [x] Implementasikan CRUD Kategori & Produk (Global Admin).
- [x] Implementasikan CRUD Unit Conversion.
- [x] Buat API `My Catalog` untuk Tenant (Subscribe/Link ke Global Product).
- [x] Bangun **Pricing Engine Service**:
    - [x] Logika evaluasi prioritas (Rule -> Price -> Fallback).
    - [x] Integrasi HPP Moving Average.
- [x] Bangun **AI Pricing Parser**:
    - [x] Prompt engineering untuk mengubah "cerita" menjadi JSON Rule Payload.
    - [x] Endpoint Preview hasil parse (`/pricing-rules/parse`).

### Tahap 3: Antarmuka Pengguna (Frontend)
- [x] Bangun halaman **Global Master Data**:
    - [x] Data Table dengan Pagination & Filter Kategori. (Implemented in `GlobalItemPage.tsx`).
- [x] Bangun halaman **My Catalog** (Tenant side):
    - [x] Fitur lihat produk terdaftar. (Implemented in `MyCatalogPage.tsx`).
    - [x] Pengaturan Stock Maintenance.
- [x] Bangun **Pricing Rule Builder**:
    - [x] Input Natural Language (Story-telling). (Implemented in `PricingRulePage.tsx`).
    - [x] UI Preview Card hasil AI parsing.
    - [x] Integrasi API AI Pricing Parser.

### Tahap 4: Pengujian & Validasi
- [x] Unit test perhitungan HPP Moving Average. (Verified: Accurate avg cost after multiple purchases).
- [x] Integration test AI Pricing Parser dengan berbagai skenario "cerita". (Verified: Story to JSON mapping working).
- [x] Uji performa Stock Maintenance (Statis vs Dinamis). (Verified: Correct switching between static and dynamic calculation).
