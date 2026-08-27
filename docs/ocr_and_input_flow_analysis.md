# Analisis Teknis & Alur Kerja Sistem (OCR, Kamera, Voice & Text Input)

Dokumen ini mendokumentasikan analisis arsitektur mengenai proses asinkron OCR, pemecahan masalah muatan payload, serta tiga alur utama pengolahan data masukan (Upload Nota, Kamera, dan Voice/Text Input) pada ekosistem **Blonjo (Frontend)** & **Sajen (Backend)**.

---

## 1. Analisis Polling & Investigasi Integrasi MCP OCR

### A. Mekanisme Polling Asinkron
Pada sisi frontend, pemrosesan nota berjalan secara asinkron untuk mencegah antarmuka pengguna membeku (*freeze*). Prosesnya diatur oleh berkas React hook [useOcrUpload.ts](file:///Users/user/kerjaan/jualan/blonjo/src/pages/transaction/hooks/useOcrUpload.ts):
- Ketika berkas berhasil diunggah, backend langsung mengembalikan respons `201 Created` dengan status awal `"pending"` atau `"processing"`.
- Frontend mengaktifkan polling menggunakan `setInterval` dengan interval **2 detik (`2000ms`)** ke endpoint `GET /api/v1/ocr/tasks/{id}`.
- Polling akan dihentikan secara bersih (`clearInterval`) begitu status berubah menjadi `"completed"` atau `"failed"`.

### B. Investigasi Kendala Payload MCP (HTTP 413 & 404)
Saat memproses gambar nota di Celery worker ([ocr_worker.py](file:///Users/user/kerjaan/jualan/sajen/app/workers/ocr_worker.py)), sistem mencoba mengirimkan muatan gambar ke MCP Server menggunakan panggilan tool `ocr_receipt`. Di sinilah kegagalan berulang terjadi:
1. **HTTP 413 (Payload Too Large)**: JSON parser di server MCP menggunakan batas default Express (100KB), sementara berkas foto resolusi tinggi dari kamera handphone berkisar antara 3MB–7MB setelah di-encode ke Base64.
2. **HTTP 404 (Not Found)**: Tool `ocr_receipt` tidak didefinisikan secara resmi pada daftar tool server MCP ([index.ts](file:///Users/user/kerjaan/mcp-server/src/index.ts)).

**Solusi Fallback**: 
Karena kegagalan di gerbang MCP ini, sistem secara otomatis mundur (*fallback*) ke utilitas lokal `call_ai_vision` di sisi backend Sajen, yang langsung berinteraksi dengan Google Gemini Vision API. Hal inilah yang membuat proses ekstraksi nota tetap berhasil meskipun mencatat pesan error MCP di balik layar.

---

## 2. Peta Alur Kerja (Flowchart) Sistem

```mermaid
graph TD
    subgraph A [Alur 1: Upload Nota & Alur 2: Kamera]
        A1[Upload File / Capture Kamera] -->|POST /ocr/upload| A2[Sajen API: ocr.py]
        A2 -->|Simpan File & Buat task status PENDING| A3[(PostgreSQL: ocr_tasks)]
        A2 -->|Trigger Async Job| A4[Celery Worker: ocr_worker.py]
        A4 -->|Task: PROCESSING| A3
        A4 -->|1. Baca Gambar: Gemini Vision / Tesseract| A5[Raw OCR Text]
        A4 -->|2. Strukturkan JSON: Gemini / Ollama| A6[Extracted JSON]
        A6 -->|Simpan Hasil & Set COMPLETED| A3
        A7[Blonjo UI: Polling useOcrUpload.ts 2s] -->|GET /ocr/tasks/{id}| A2
        A2 -->|Ambil Data & Map Schema Adapter| A3
        A7 -->|Jika COMPLETED, Hentikan Polling| A8[Isi teks ke Smart Note & Form]
    end

    subgraph B [Alur 3: Voice Note & Text Input]
        B1[Tulis Teks di Smart Note] -->|Debounce 150ms| B2[POST /transactions/parse]
        B2 -->|Build RAG Context & COA| B3[MCP / AI Local]
        B3 -->|Kembalikan JSON Jurnal/Item| B4[Render Tabel Form Transaksi]

        C1[Rekam Voice Note] -->|Kirim Audio| C2[Transkrip Teks]
        C2 -->|POST /vibe/intent| C3[Sajen API: vibe.py]
        C3 -->|Ambil Data Nyata Kas/Stok/Kontak| C4[LLM Orchestrator]
        C4 -->|Jika Ada Intent Simpan| C5[Create Transaction & Journal]
        C4 -->|Kembalikan Visual/Card UI| C6[Render di Chat Omnibar]
    end
```

---

## 3. Urutan Detail Langkah Pemrosesan

### ALUR 1: Upload Data Nota (PDF / Gambar)
1. **Pemicu Frontend**: User mengunggah berkas lewat antarmuka Blonjo. Event ditangkap oleh hook `handleFileUpload` yang membungkus berkas ke dalam objek `FormData` dan mengirimkannya via `POST /api/v1/ocr/upload`.
2. **Penerimaan Backend**: Endpoint `/ocr/upload` pada berkas [ocr.py](file:///Users/user/kerjaan/jualan/sajen/app/api/v1/ocr.py) menyimpan file fisik ke folder `sajen/uploads/`, mendaftarkan tugas baru di tabel database `ocr_tasks` dengan status `PENDING`, dan memicu antrean Celery worker.
3. **Pemrosesan Worker**: Celery task `process_receipt_ocr` mengambil tugas ➡️ Mengubah status menjadi `PROCESSING` ➡️ Mengekstrak teks dari gambar/PDF via Gemini Vision ➡️ Membaca teks mentah tersebut dengan LLM untuk diformat menjadi JSON terstruktur (items, qty, price, total) ➡️ Menyimpan JSON ke kolom `extracted_data` ➡️ Mengubah status menjadi `COMPLETED`.
4. **Adapter Frontend**: Polling frontend mendeteksi status `completed` ➡️ Memanggil fungsi adapter `_map_rich_schema_to_frontend` di backend untuk menormalisasi perbedaan kunci JSON (seperti mengubah kunci `item_name` dari tiruan RAG menjadi `product_name`) ➡️ Menampilkan daftar barang di editor Smart Note.

### ALUR 2: Camera Capture (Kamera Handphone)
1. **Pemicu Frontend**: Kamera diaktifkan melalui modal kamera di antarmuka Blonjo ➡️ Mengambil foto struk secara langsung ➡️ Mengonversi gambar di kanvas HTML menjadi format JPEG Blob.
2. **Penyatuan Alur**: JPEG Blob ini dikirimkan ke fungsi `uploadFileDirectly(file)`.
3. **Penyelesaian**: Sejak titik ini, seluruh alur pemrosesan berjalan **100% sama dengan Alur 1 (Upload Data Nota)** menggunakan endpoint `/ocr/upload` yang sama.

### ALUR 3: Voice Note & Text Input

#### A. Text Input (Smart Note Editor)
1. Pengguna mengetik teks transaksi natural pada kolom catatan ➡️ Sistem menunggu jeda berhenti mengetik (*debounce*) selama **150ms**.
2. Frontend mengirimkan teks bersih ke endpoint `POST /api/v1/transactions/parse`.
3. Backend merakit prompt minimal berisi aturan harga (pricing rules) dan daftar COA yang relevan, mengevaluasinya melalui LLM (Ollama lokal dengan fallback Gemini), lalu mengembalikan respons JSON terstruktur untuk mengisi tabel input form transaksi secara otomatis.

#### B. Voice Note (Vibes Chat / Audio)
1. Pengguna melakukan perekaman suara ➡️ Sistem menerjemahkan suara menjadi teks transkripsi.
2. Teks transkripsi dikirimkan ke endpoint `POST /api/v1/vibe/intent` di berkas [vibe.py](file:///Users/user/kerjaan/jualan/sajen/app/api/v1/vibe.py).
3. Backend memuat informasi data nyata langsung dari database (Saldo Kas, Laba Rugi berjalan, data produk terdaftar, dan kontak aktif) untuk disertakan sebagai instruksi sistem.
4. LLM memilah maksud (*intent*) pengguna secara presisi:
   - **Intent Simpan**: Jika terdeteksi instruksi pencatatan, sistem langsung membuat data jurnal dan transaksi ke database menggunakan fungsi `create_transaction_with_journal`.
   - **Intent Tanya**: Sistem akan menyusun data visualisasi berupa grafik statis, ringkasan saldo, atau tabel laporan untuk dirender langsung di antarmuka obrolan Vibes Chat.
