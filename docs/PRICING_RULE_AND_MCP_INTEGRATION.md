# Dokumentasi Integrasi: Pricing Rule & MCP Server (mcp.samkarsa.com)

Dokumen ini menjelaskan arsitektur integrasi antara fitur **Pricing Rule (Aturan Harga)**, **Price List (Daftar Harga)**, dan **MCP Server (`mcp.samkarsa.com`)** untuk platform POS multi-tenant Blonjo & Sajen.

---

## 1. Analisis Kebutuhan MCP Server (`mcp.samkarsa.com`)

| Fitur / Proses | Memerlukan MCP Server? | Penjelasan & Rationale |
| :--- | :---: | :--- |
| **Parsing Aturan Harga (NLP)** | **TIDAK** | Proses menerjemahkan teks bebas (atau suara) menjadi JSON terstruktur dilakukan secara instan di sisi backend lokal (`sajen` API) menggunakan API Key Gemini milik masing-masing tenant. Memanggil MCP Server untuk tugas ini hanya menambah *network latency*, overhead session, dan potensi kegagalan koneksi (`400 Bad Request` pada SSE). |
| **WhatsApp Stock Check (Bizeto)** | **YA** | Server asisten WhatsApp Bizeto (`bizeto.samkarsa.com`) bersifat terpusat. Ketika pelanggan mengirim pesan WA untuk cek stok/harga, Bizeto akan memanggil tool MCP di `mcp.samkarsa.com` untuk merutekan permintaan ke kontainer API VPS merchant yang tepat secara dinamis berdasarkan nomor WA terdaftar. |

---

## 2. Struktur Data Aturan Harga (Pricing Rule Schema)

AI Parser di backend Sajen bertindak sebagai **Normalizer Dinamis** untuk menerjemahkan teks instruksi bebas dari tenant menjadi salah satu skema JSON terstandar di bawah ini agar dapat dievaluasi secara presisi oleh `PricingEngine` kasir:

### A. Tipe `tiered` (Harga Bertingkat / Grosir)
Digunakan ketika harga barang menjadi lebih murah seiring bertambahnya kuantitas pembelian.
*   **Format Payload**:
    ```json
    {
      "product_name": "Telur Ayam",
      "tiers": [
        { "qty_threshold": 1.0, "unit_price": 22000, "unit": "kg" },
        { "qty_threshold": 0.5, "unit_price": 11000, "unit": "kg" },
        { "qty_threshold": 0.25, "unit_price": 5500, "unit": "kg" }
      ]
    }
    ```

### B. Tipe `bundle_multiple` (Promo Kelipatan / Paket)
Digunakan untuk paket promosi dengan harga khusus per kuantitas paket (misalnya beli 2 harga Rp 8.000, eceran tetap Rp 4.500).
*   **Format Payload**:
    ```json
    {
      "product_name": "Indomie Goreng",
      "bundle_rules": {
        "base_price": 4500,
        "bundle_qty": 2,
        "bundle_price": 8000
      }
    }
    ```

### C. Tipe `formula` (Faktor Pengali / Markup)
Digunakan untuk menaikkan/menurunkan harga secara dinamis berdasarkan persentase atau pengali dari harga beli (HPP).
*   **Format Payload**:
    ```json
    {
      "product_name": "Minyak Goreng",
      "multiplier": 1.15
    }
    ```

### D. Tipe `discount` (Diskon Persentase)
Digunakan untuk memotong harga jual sebesar persentase tertentu secara dinamis terhadap harga dasar.
*   **Format Payload**:
    ```json
    {
      "product_name": "Susu Kaleng",
      "discount_percent": 10.0
    }
    ```

---

## 3. Alur Modifikasi Dua Arah (Pricing Rule ↔ Price List)

Agar aturan harga dapat dikelola secara intuitif oleh pengguna tanpa harus menulis ulang teks instruksi AI:

1.  **Deteksi Aturan Aktif**: Saat pengguna membuka halaman **Price List**, sistem memuat daftar produk dan mengecek apakah ada `TenantPricingRule` yang aktif untuk tiap produk.
2.  **Visualisasi Matriks**: Di baris produk pada Price List, matriks aturan yang aktif (misalnya list tier harga grosir) akan ditampilkan di bawah harga dasar produk.
3.  **Modal Edit Dinamis**: Saat tombol edit produk di-klik, modal akan mendeteksi tipe aturan aktif:
    *   Jika **Tiered**: Render daftar input untuk setiap baris tier sehingga pengguna bisa mengubah harga per tier secara visual.
    *   Jika **Bundle**: Render input untuk mengubah harga paket, kuantitas paket, dan harga dasar.
    *   Jika **Formula / Standar**: Render input harga standar seperti biasa.
    *   Jika **Discount**: Render input persentase diskon (%) untuk diedit langsung.
4.  **Penyimpanan Pintar**: Ketika form disimpan, backend akan mendeteksi apakah payload mengandung struktur aturan harga. Jika ya, backend memperbarui data di tabel `TenantPricingRule`. Jika tidak, backend hanya memperbarui harga jual dasar di tabel `TenantProductPrice`.

---

## 4. Keuntungan Pendekatan Ini
*   **Kebebasan Input**: Tenant bebas mengetik aturan harga dalam format apa pun di menu Pricing Rule karena AI akan merapikannya secara otomatis.
*   **Kemudahan Manajemen**: Tenant tidak perlu memanggil AI lagi untuk sekadar mengubah angka harga di kemudian hari; mereka cukup mengedit angkanya langsung di tabel Price List.
*   **Keamanan & Kecepatan**: API penafsiran teks langsung di-host di VPS lokal, mengurangi risiko kegagalan koneksi pihak ketiga.

---

## 5. Penyesuaian Harga Jual Otomatis Berbasis Margin Pengaman (Smart Auto-Price Adjustment)

Untuk menjaga profitabilitas toko secara otomatis ketika harga beli (HPP) berfluktuasi tanpa intervensi manual pengguna:

### A. Formula & Logika Perhitungan Margin
Ketika stok baru masuk (pembelian) dan harga beli baru ($C_{\text{new}}$) tercatat:
1.  **Kalkulasi Margin Historis ($M_{\text{prev}}$)**:
    Sistem menghitung rasio keuntungan sebelum harga beli naik:
    $$M_{\text{prev}} = \frac{P_{\text{old}} - C_{\text{old}}}{C_{\text{old}}}$$
2.  **Evaluasi Margin Existing ($M_{\text{current}}$)**:
    Sistem mengevaluasi potensi margin jika menggunakan harga jual lama terhadap harga beli baru:
    $$M_{\text{current}} = \frac{P_{\text{old}} - C_{\text{new}}}{C_{\text{new}}}$$
3.  **Kondisi Pemicu Auto-Adjust**:
    Penyesuaian otomatis berjalan jika **TIDAK** ada pricing rule tetap (seperti Tiered/Bundle tetap) yang membatasi, DAN memenuhi salah satu kondisi:
    *   $M_{\text{current}}$ jatuh di bawah batas aman default jenis usaha (misal default 20% margin di settings).
    *   $M_{\text{current}} < M_{\text{prev}}$ (Margin tergerus oleh kenaikan harga beli).

### B. Kalkulasi Harga Jual Baru ($P_{\text{new}}$)
Untuk mempertahankan margin historis toko, harga jual dasar otomatis dinaikkan ke:
$$P_{\text{new}} = C_{\text{new}} \times (1 + M_{\text{prev}})$$

### C. Alur Kerja Deteksi & Penulisan DB
1.  Setiap kali `InventoryService.update_moving_average()` dipanggil (stok masuk), sistem membandingkan biaya MA baru dengan HPP lama.
2.  Jika terjadi kenaikan HPP yang menggerus margin di bawah ambang batas, sistem langsung memperbarui `amount` di tabel `TenantProductPrice` untuk produk tersebut.
3.  **Tanda Fluktuasi (Insight Flag)**: Baris di Price List yang harga jualnya otomatis disesuaikan oleh sistem akan menampilkan indikator visual/lencana (misal: `"⚠️ Auto-Adjusted (HPP Naik)"`) agar pengguna mengetahuinya dan dapat meninjau fluktuasi harga tersebut.
