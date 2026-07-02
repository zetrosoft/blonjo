# Arsitektur Master Data Komprehensif (Global Catalog & AI Pricing Rule)

## 1. Konsep Utama: Global Catalog & Tenant Isolation
Arsitektur memisahkan data menjadi dua lapisan utama untuk efisiensi dan standarisasi:
1.  **Master Data (Katalog Global)**: Bersifat **Global (One Item to Many Tenants)**. Berisi identitas standar (Nama, Kategori, SKU Dasar, Konversi Unit), tanpa mengandung angka nilai apa pun (stok/harga).
2.  **Data Nilai & Transaksional (Tenant Specific)**: Data Stok, Harga Beli, Harga Jual, Supplier, dan Aturan Harga (Pricing Rules) dikelola mandiri secara terisolasi oleh masing-masing **Tenant**.

## 2. Skema Database: Global Master Data (Identitas Murni)
Entitas ini tidak memiliki `tenant_id` dan menjadi kamus standar sistem.
- **`ProductCategory`**: Kategori barang global (misal: Sembako, Elektronik). Relasi One-to-Many ke Produk.
- **`Product`**: Master barang standar.
    - Atribut: `id`, `sku` (Global Auto-generated), `name`, `category_id`, `base_unit` (e.g., Pcs), `embedding`.
    - *Constraint*: Tidak boleh memiliki atribut nilai transaksi atau angka stok.
- **`ProductUnitConversion`**: Standar konversi baku global (e.g., 1 Lusin = 12 Pcs).

## 3. Skema Database: Tenant-Specific Data (Nilai, Stok, & Harga)
Setiap entitas memiliki `tenant_id` untuk isolasi data.
- **`TenantInventory` (Stok & HPP)**:
    - Atribut: `last_purchase_price`, `moving_average_cost`.
    - Atribut: `static_stock` (Opsional, dikontrol oleh fitur Stock Maintenance).
    - **Fitur "Stock Maintenance" (Settings)**:
        - **Checked**: Stok fisik disimpan secara **statis** di database dan diperbarui setiap transaksi.
        - **Unchecked**: Stok dihitung secara **dinamis** (Perpetual Real-time) dari log transaksi.
- **`TenantProductPrice` (Harga Jual Dasar)**:
    - Atribut: `pricing_method` (`'value'` atau `'margin'`), `amount`.
- **`TenantPricingRule` (AI-Parsed Pricing Engine)**:
    - Atribut: `rule_type`, `valid_from`, `valid_to`, `is_active`.
    - Atribut `rule_payload` (JSONB): Hasil parsing AI dari input teks bebas.

## 4. Alur Logika Perhitungan Harga (Pricing Engine)
Prioritas evaluasi harga satuan:
1.  **Aturan Khusus (`TenantPricingRule`)**: Evaluasi JSON Payload (Volume discount, Bundling, Promo).
2.  **Harga Dasar (`TenantProductPrice`)**: Evaluasi nominal atau margin dari HPP.
3.  **Default Fallback**: Moving Average / Last Price + Margin default tenant.

## 5. Antarmuka Pengguna (Frontend)

### 5.1. Katalog Global & My Catalog
- **Global Catalog**: Tabel pagination penuh untuk standarisasi barang.
- **My Catalog**: Tempat tenant mengelola inventaris mereka sendiri (aktifkan *Stock Maintenance*, pilih supplier).

### 5.2. AI Pricing Rule Builder
- **Rich Text Editor**: User menulis aturan harga dalam teks bebas (story-telling).
- **Placeholder**: Contoh penulisan promo untuk memandu user.
- **AI Parsing & Preview**:
    - AI Engine mengekstrak teks menjadi JSON.
    - Tampilan **Preview Card** muncul sebelum simpan untuk validasi user terhadap interpretasi AI.
