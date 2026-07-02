# Smart Transaction Parser Rules — Blonjo NLP Engine v2.0

Dokumen ini merangkum aturan logika yang digunakan oleh `smartParser.ts` untuk mengekstrak data dari teks input bebas menjadi data transaksi terstruktur.

## 1. Ekstraksi Supplier & Customer (Contact)
Sistem menggunakan tanda `:` (titik dua) sebagai pemisah struktural utama antara identitas transaksi dan daftar item.

*   **Pola Utama**: `[Kata Kerja] [Info Tanggal] di/ke [Nama Kontak] :`
*   **Logika Pengambilan**:
    *   Sistem membagi baris menjadi dua bagian berdasarkan tanda `:`.
    *   Bagian **kiri** (sebelum `:`) dianalisis untuk mencari kata kunci ` di ` atau ` ke `.
    *   Semua teks **setelah** `di`/`ke` hingga tanda `:` diambil sebagai nama kontak.
*   **Pembersihan Noise**:
    *   Pola tanggal seperti `tgl 26/05/2026` atau `26-05-2026` dibuang secara otomatis dari nama kontak.
    *   Karakter bullet points (`•`, `-`, `*`) di awal baris dibersihkan.
*   **Contoh**:
    *   `Belanja tgl 26/05/2026 di Sales Unilever :` → **Supplier**: `Sales Unilever`
    *   `Kirim uang ke Toko Berkah :` → **Customer/Supplier**: `Toko Berkah`

---

## 2. Ekstraksi Daftar Item (Line Items)
Item diekstrak dari baris yang diawali dengan bullet point atau baris di sebelah kanan tanda `:`.

### A. Pola Harga dengan Diskon
*   **Format**: `{Nama Barang} {Jumlah} {Satuan} @ {Harga Satuan} dengan diskon {X}%`
*   **Variasi Kata Diskon**: `diskon`, `disko.`, `disc`, `discount`.
*   **Logika Kalkulasi**:
    *   `Harga Neto = Harga Satuan - (Harga Satuan * (Diskon / 100))`
    *   `Total = Jumlah * Harga Neto`
*   **Contoh**:
    *   `Kecap Bango 12 Btl @ 9.255 dengan diskon 10%`
        *   Qty: `12`, Unit: `Btl`, Satuan Neto: `8.329,5`, Total: `99.954`

### B. Pola Klasik / Standar
*   **Format**: `{Nama Barang} {Jumlah} {Satuan} @ {Harga}` atau `{Nama Barang} {Jumlah} {Satuan} = {Total}`
*   **Contoh**:
    *   `Beras Pandan Wangi 5 kg @ 15.000` → Total: `75.000`
    *   `Gula Pasir 2 kg = 30.000` → Unit Price: `15.000`

---

## 3. Penanganan Angka & Satuan
### A. Format Angka (Localization)
Sistem mendukung format angka Indonesia:
*   Pemisah Ribuan: Titik (`.`) — Contoh: `1.500.000`
*   Pemisah Desimal: Koma (`,`) — Contoh: `10.500,50`
*   Suffix Singkatan: `rb` (ribu), `jt` (juta), `k` (kilo).

### B. Satuan yang Dikenali (Vocabulary)
Sistem mengenali satuan berikut:
`kg, gram, gr, g, ltr, liter, lt, ml, pcs, biji, buah, pak, pack, dus, karton, botol, btl, bks, bungkus, pouch, lusin, kodi, lembar, lbr, meter, m, unit, set, porsi, sak, ball, kotak, kaleng, roll, rim, pasang`.

---

## 4. Penentuan Tipe Transaksi
Sistem mendeteksi kategori berdasarkan kata kunci (Keyword matching):

| Tipe | Label | Kata Kunci Utama |
| :--- | :--- | :--- |
| **Purchase** | Pengeluaran (Belanja) | belanja, beli, pembelian, lunas piutang |
| **Income** | Pemasukan | jualan, hasil penjualan, pendapatan, terima transfer |
| **Operational** | Pengeluaran Operasional | bensin, bbm, listrik, wifi, gaji, makan, ongkir |
| **Capital** | Tambah Modal | setor modal, tambah modal, investasi |

---

## 5. Metadata Otomatis
*   **Tanggal**: Jika tidak disebutkan, default adalah hari ini. Jika ada pola `DD/MM/YYYY`, akan dikonversi ke ISO `YYYY-MM-DD`.
*   **Deskripsi**: Dihasilkan otomatis dengan format: `[Prefix Tipe] di [Nama Kontak]: [Item 1], [Item 2]...`

## 6. Voice Command Shortcuts (Pintasan Suara)
Saat menggunakan fitur **Voice Recorder**, sistem secara otomatis menerjemahkan ucapan natural menjadi simbol-simbol akuntansi dan format struktural melalui *Dynamic Voice Rules*.

| Ucapan Suara | Hasil Pengganti | Kegunaan |
| :--- | :--- | :--- |
| `"enter"` | `(Baris Baru)` | Membuat baris item baru |
| `"a keong"` atau `"saunya"` | `@` | Pemisah nama barang dan harga |
| `"{n} kali {n}"` | `nxn` | Menghitung kuantitas (misal: "12 kali 9000") |
| `"strip"` atau `"bulet"` | `- ` | Membuat list item belanja |
| `"sama dengan"` | `=` | Menghitung total per baris |
| `"plus"` | `+` | Simbol tambah |
| `"minus"` | `-` | Simbol kurang |
| `"stop"` atau `"selesai"` | `[STOP]` | Menghentikan perekaman secara otomatis |

---

## Cara Update Aturan
Logika ini tersimpan di file:
1.  **Parsing Teks**: `blonjo/src/lib/smartParser.ts`
2.  **Voice Rules**: `blonjo/src/lib/voiceRules.ts`

Setiap kali menambahkan satuan baru atau pola kalimat baru, pastikan untuk memperbarui Regex pada fungsi yang relevan.
