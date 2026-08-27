# TODO: Eksekusi Peningkatan Kecerdasan Smartnote & OCR

Berikut adalah rencana eksekusi terstruktur. Kita akan mulai dari penyelesaian masalah jangka pendek (yang tadi tertunda), hingga perombakan arsitektur OCR jangka panjang.

## Fase 1: Perbaikan Akurasi Parsing Teks (Jangka Pendek) - *Status: In Progress*
Fase ini berfokus pada perbaikan otak AI (LLM) agar tidak bingung membedakan angka nama barang dan angka kuantitas.
- [x] Menyusun draf prompt baru (Aturan #9) untuk pemisahan varian produk vs QTY.
  *Detail Rancangan Prompt yang disuntikkan ke kodebase:*
  > **9. PEMISAHAN NAMA BARANG BER-ANGKA DAN KUANTITAS (QTY):**
  > Seringkali nama barang memiliki angka/ukuran (seperti '500g', '10Kg', 'ISI 15') yang bersebelahan dengan jumlah barang (QTY).
  > - Contoh 1: 'tepung beras 500g 10Kg 12000' -> Nama='tepung beras 500g', Qty=10, Unit='Kg', Harga=12000.
  > - Contoh 2: 'Beras Obor 10Kg 5pack x 146000' -> Nama='Beras Obor 10Kg', Qty=5, Unit='pack', Harga=146000.
  > - Contoh 3: 'TONG TJI TEA ISI 15 20 pcs @ 2800' -> Nama='TONG TJI TEA ISI 15', Qty=20, Unit='pcs', Harga=2800.
  > **PANDUAN PENTING:** Angka/satuan yang berada paling belakang atau berdekatan dengan lambang harga ('@', 'x', 'Rp') adalah QTY transaksi Anda. Angka yang mendahuluinya adalah bagian mutlak dari NAMA BARANG.
- [x] Menyisipkan Aturan #9 ke dalam kode `smart_parser.py`.
- [x] Menjalankan `deploy.sh sajen-api sajen-worker` untuk menerapkan perubahan.
- [x] Uji coba pemrosesan kalimat *"Beras Obor 10Kg 5pack x 146000"* untuk memvalidasi pemisahan nama vs QTY.
- [x] **Pembersihan Prompt Bleed**: Sinkronisasi JSON Schema antara `mcp-server/src/tools/transactionParser.ts` dan `sajen/app/services/smart_parser.py` (menambahkan field `contact_name` dan `payment_method` yang sebelumnya hilang).

---

## Fase 2: Persiapan Database Template Memory (MCP Server) - *Status: Selesai*
Fase ini menyiapkan tempat penyimpanan ingatan koordinat visual di server pusat.
- [x] Menganalisa struktur tabel `knowledge_vectors` di database PostgreSQL MCP Server (`mcp_hub_db`).
- [x] Menambahkan skema penyimpanan `bounding_boxes` (koordinat potong X, Y, W, H) ke dalam *metadata* RAG.
- [x] Membuat fungsi API agar saat pengguna melakukan koreksi OCR, sistem tidak hanya menyimpan teks, tapi juga menyimpan profil gambar/koordinatnya.

---

## Fase 3: Implementasi "Visual-First" (Computer Vision) - *Status: Selesai*
Fase ini menanamkan mata visual ringan ke dalam backend agar bisa mengenali nota tanpa harus membaca teksnya.
- [x] Meng-install library `opencv-python` di dalam *environment* backend Sajen.
- [x] Membuat modul `vision_matcher.py` untuk melakukan *Image Hashing* atau ekstraksi fitur (ORB/SIFT).
- [x] Mengembangkan fungsi pemotongan gambar (*auto-crop*) secara presisi berdasarkan koordinat dari MCP Server.

---

## Fase 4: Orkestrasi Celery Worker & LLM - *Status: Selesai*
Fase terakhir untuk menyatukan semua alur agar proses upload nota menjadi kilat.
- [x] Memodifikasi `ocr_worker.py` agar mengeksekusi `vision_matcher.py` terlebih dahulu sebelum memanggil Vision LLM.
- [x] **Skenario Hit (Template Dikenali):** Lempar gambar kecil (*cropped*) ke Vision LLM dengan prompt sangat singkat, lalu rakit JSON secara paksa (*hardcode header* dari RAG).
- [x] **Skenario Miss (Template Baru):** Lempar gambar *full* ke Vision LLM (alur klasik).
- [x] Pengujian komparasi waktu *loading* (Sebelum vs Sesudah).
