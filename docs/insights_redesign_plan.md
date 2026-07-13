# Rencana Kerja (Plan): Perbaikan & Penyempurnaan Vibes Chat (NotebookLM-Style)

Dokumen ini berisi rencana perbaikan untuk memastikan Vibes Chat menggunakan data riil 100% yang terisolasi ketat per tenant_id (anti-bocor), fungsionalitas yang tepat sasaran untuk stakeholder, serta lokalisasi bahasa (i18n) dual-language secara penuh.

---

## 🛠️ Masalah & Solusi yang Diusulkan

### 1. Isolasi Total Data Tenant (Keamanan & Anti-Bocor)
* **Solusi**: Pastikan **semua query** di `sajen/app/api/v1/insights.py` (untuk saldo kas, penjualan terlaris, status stok) disaring menggunakan filter eksplisit `Transaction.tenant_id == current_user.tenant_id` dan `TenantInventory.tenant_id == current_user.tenant_id` sehingga tidak ada kebocoran data antar-tenant sama sekali.

### 2. Saldo Kas & Bank Tidak Akurat
* **Masalah**: Saldo kas & bank di Vibes Chat tidak sinkron dengan data di Cashflow Projection karena query mengabaikan akun sistem (`tenant_id IS NULL`).
* **Solusi**: Perbarui `cash_accounts_query` di `sajen/app/api/v1/insights.py` untuk mengikutsertakan `tenant_id == None` dan memfilter kode akun persis seperti pada modul Cashflow (`1-1101`, `1-1102`, `1-1000`, `1-1100`, `1-1200`), tetapi transaksi riilnya tetap disaring berdasarkan `tenant_id` dari user aktif.

### 3. Duplikasi Informasi Widget (Pembelian Terbanyak vs Top Purchase)
* **Masalah**: Pembelian terbanyak dan Top Purchase adalah data yang sama (sama-sama mengambil data supply masuk).
* **Solusi**: 
  * Ubah Widget ke-2 di panel kanan menjadi **Penjualan Terlaris (Top Selling)** untuk memberikan gambaran omzet pasar ke stakeholder.
  * Query diambil dari `InventoryLog` tipe `out` (pengeluaran karena penjualan) per bulan berjalan dan per tahun berjalan.

### 4. Link Berita Makro Tidak Spesifik
* **Masalah**: Berita makro masih menggunakan data statis dan mengarah ke homepage portal berita generik.
* **Solusi**: 
  * Lakukan pencarian berita dinamis via HTTP request ke DuckDuckGo/RSS Feed berita retail Indonesia secara real-time berdasarkan kategori bisnis tenant aktif.
  * Kembalikan judul berita aktual beserta **link artikel spesifik** dari sumber tersebut.

### 5. Tampilan Visual Statistik di Kiri saat Landing & Auto-Scroll
* **Masalah**: Saat halaman dibuka, area chat kiri kosong atau tidak menampilkan statistik bisnis. Dan jika ada chat history hari ini, tidak otomatis scroll ke bawah.
* **Solusi**:
  * Di UI `VibesChat.tsx`, saat baru dibuka (landing state), tampilkan **Mini Chart Grafik Penjualan/Likuiditas** berbasis data riil database tenant di area chat sebelah kiri.
  * Jika ada obrolan, render riwayat chat dan gunakan `useEffect` + `useRef` untuk melakukan **auto-scroll** ke chat terakhir hari ini secara instan saat halaman dibuka/di-refresh.

### 6. Penerapan Dual Language (i18n)
* **Solusi**: Pindahkan semua teks / label string statis di `VibesChat.tsx` (misal: "Mengetik tanggapan pintar...", "Kas & Bank", "Pembelian Terbanyak", "Klip Berita Makro", dll.) ke file `i18n.ts` agar mendukung bahasa Inggris (EN) & bahasa Indonesia (ID) dengan benar menggunakan fungsi `t('key')`.

---

## 📅 Peta Eksekusi

1. **Langkah 1**: Perbaiki API backend `sajen/app/api/v1/insights.py` untuk menyelaraskan query saldo kas, mengganti Top Purchasing menjadi Top Selling, dan menambahkan pencarian berita dinamis.
2. **Langkah 2**: Daftarkan terjemahan bahasa baru di `blonjo/src/lib/i18n.ts`.
3. **Langkah 3**: Perbarui UI `blonjo/src/pages/insights/VibesChat.tsx` untuk menggunakan i18n secara penuh, menampilkan grafik statistik tenant saat landing, memosisikan panel sources di sebelah kanan, dan menambahkan auto-scroll ref.
4. **Langkah 4**: Lakukan test build dan deploy ke VPS.

---
*Silakan tinjau rencana perbaikan di atas. Jika Anda setuju, silakan konfirmasi "Setuju" agar saya langsung memproses perbaikan kodingnya menggunakan subagent secara bertahap.*
