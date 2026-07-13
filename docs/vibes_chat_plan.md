# Rencana Kerja (Plan): Implementasi Vibes Chat (NotebookLM-Style)

Dokumen ini menjelaskan langkah-langkah implementasi fitur **Vibes Chat** di bawah menu utama **Business Insights**. Fitur ini akan mengambil data langsung dari database riil (tanpa mock data) dan memosisikan panel "Sources" di sebelah kanan.

## Peta Perubahan

```
┌─────────────────────────────────────────────────────────────┐
│                       Vibes Chat                            │
├───────────────────────────────┬─────────────────────────────┤
│                               │                             │
│       Vibes Chat (Kiri)       │       Sources (Kanan)       │
│                               │                             │
│  - Landing: Info Ringkas      │   - Cash balance snapshot   │
│  - NotebookLM Chat Interface  │   - Top purchasing products │
│  - Input Box & Action Button  │   - Forecast & depletion    │
│                               │   - Macro news clips        │
└───────────────────────────────┴─────────────────────────────┘
```

---

## Rincian Implementasi

### 📍 Langkah 1: Modifikasi Routing & Sidebar (`blonjo`)
*   Hapus rute `/reports/business-compass` di `App.tsx` dan hapus menu Compass di `Sidebar.tsx`.
*   Ubah rute `/insights` di `App.tsx` agar mengarah ke `VibesChatLayout` atau daftarkan sub-menu di bawah `/insights`:
    *   💬 Vibes Chat: `/insights/vibes-chat` (Halaman utama)
    *   📊 Analitik Visual: `/insights/analytics` (Placeholder / Phase 2)
    *   🌐 Market Intelligence: `/insights/market-intelligence` (Placeholder / Phase 2)
*   Update `Sidebar.tsx` untuk menampilkan navigasi drop-down **Business Insights** (`menu_insights`) yang berisi sub-menu tersebut.

### 📍 Langkah 2: Endpoint API Backend (`sajen`)
Kita buat endpoint baru `/api/v1/insights/widgets` di `sajen/app/api/v1/accounting.py` atau route baru `/api/v1/insights.py` untuk mengembalikan data dinamis dari database riil:
1.  **Likuiditas Kas**: Query saldo terkini dari akun kas & bank (seperti CoA `1-1101`, dll) + hitung actual inflow/outflow kemarin & bulan ini.
2.  **Top Purchasing**: Query 5 item transaksi pembelian (`TransactionType.PURCHASE` atau `PURCHASING`) dengan jumlah terbanyak untuk bulan ini dan tahun ini.
3.  **Forecast & Depletion**:
    *   Cek status `maintenance_stock` tenant.
    *   Jika `True`: Ambil 5 barang dengan kuantitas penjualan tertinggi dari tabel transaksi sales, sertakan sisa stok fisiknya dari `TenantInventory`.
    *   Jika `False`: Ambil 5 barang dengan volume pembelian tertinggi dari supplier.
4.  **Macro News Clips**: Ambil ringkasan berita makro ekonomi secara real-time menggunakan pencarian web (Web Search) yang disesuaikan dengan kategori bisnis dari tenant aktif (misal: "retail FMCG Indonesia", "tren warung kelontong", dsb).

### 📍 Langkah 3: Antarmuka UI Vibes Chat (`blonjo`)
*   Buat file baru `blonjo/src/pages/insights/VibesChat.tsx`.
*   Layout Flexbox/Grid:
    *   Area Kiri (65% - 70%): Chat interaktif NotebookLM-style. Saat landing, tampilkan sambutan dan rangkuman matriks ringkas.
    *   Area Kanan (30% - 35%): Panel **Sources** yang memuat 4 kartu visual Glassmorphism:
        *   *Cash balance snapshot*
        *   *Top purchasing products*
        *   *Forecast & depletion risk*
        *   *Macro news clips*
*   Hubungkan chat input dengan endpoint RAG di backend yang memanggil tool di MCP Server `mcp.samkarsa.com`.

### 📍 Langkah 4: Deployment & Validasi
*   Deploy menggunakan `./deploy.sh blonjo-ui sajen-api sajen-worker`.

---
*Silakan tinjau rencana implementasi teknis di atas. Jika Anda setuju, silakan konfirmasi "Setuju" agar saya dapat langsung memproses kodingnya secara bertahap.*
