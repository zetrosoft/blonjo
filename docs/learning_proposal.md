# Learning Proposal: Aturan Pembangunan Proyek Jualan

Berdasarkan perbaikan dan penyelarasan fitur baru yang telah berhasil diterapkan dalam sesi ini, berikut adalah usulan penambahan aturan baru (Rules) ke dalam file [GEMINI.md](file:///Users/user/kerjaan/jualan/GEMINI.md) dan [AGENTS.md](file:///Users/user/kerjaan/jualan/.agents/AGENTS.md) agar agen berikutnya selalu mengikuti pedoman ini secara konsisten.

---

## Rincian Usulan Aturan Baru

### 1. Kebijakan Referensi Transaksi (Reference Code Generation)
* **Aturan**: Pembuatan kode referensi berurut (misal: `PUR-YYYY-NNNN` atau `SLS-YYYY-NNNN`) **dilarang keras** menggunakan fungsi `count() + 1`. Pembuat nomor urut wajib mencari nilai maksimum numerik dari kode yang sudah ada di database untuk tahun berjalan, lalu menambahkannya dengan `1` untuk mencegah duplikasi jika ada transaksi yang dihapus atau diedit tanggalnya.

### 2. Kebijakan Standardisasi Item "Telur"
* **Aturan**: Database master hanya menggunakan satu nama barang tunggal yaitu **"Telur"**. Di semua logika parsing teks / OCR / suara, modul pra-pemrosesan wajib mengubah variasi penulisan seperti `telor` menjadi `telur` secara case-insensitive agar pemetaan produk master selalu akurat dan tidak meleset.

### 3. Akuntansi & Proyeksi Rencana Belanja (Purchase Plan)
* **Aturan**: Dokumen rencana belanja (`PurchasePlan`) dengan status `DRAFT` dan `APPROVED` **tidak boleh** diposting ke General Ledger akuntansi (tidak menghasilkan entri jurnal ganda / akrual). Namun, mereka wajib dimasukkan dalam perhitungan proyeksi Cash Flow sebagai proyeksi pengeluaran (*outflow*).
* Dokumen rencana belanja yang sudah dieksekusi atau ditutup wajib diubah statusnya menjadi `COMPLETED` agar secara otomatis keluar dari perhitungan proyeksi cash flow.

### 4. Optimalisasi Filter Tanggal
* **Aturan**: Daftar transaksi di frontend harus difilter tanggal secara server-side (dikirim ke API backend) dengan filter default dimulai dari tanggal 1 awal bulan berjalan hingga hari ini (berdasarkan waktu lokal pengguna) untuk menghemat memori dan meningkatkan performa.

---

## Rencana Perubahan Berkas (Diff)

Akan ditambahkan bagian baru `## Aturan Bisnis & Teknis Khusus` di akhir file:
- [GEMINI.md](file:///Users/user/kerjaan/jualan/GEMINI.md)
- [.agents/AGENTS.md](file:///Users/user/kerjaan/jualan/.agents/AGENTS.md)
