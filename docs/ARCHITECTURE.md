# Global Architectural Landscape: BLONJO & SAJEN
*(Status: Finalized Master Blueprint - Living Document)*

## 1. Core Philosophy: Semantic Orchestration
Sistem ini menggunakan **Cognitive Economic Orchestrator**. Tugas utamanya adalah mengubah "Bahasa Manusia yang Tidak Beraturan" (Teks Bebas, Suara, Gambar) menjadi "Data Akuntansi Baku (PSAK EMKM)" secara konsisten melalui penalaran kontekstual, bukan aturan posisi kaku.

## 2. Peta Relasi Data & Domino Effect
Setiap transaksi (`create_transaction_with_journal`) wajib mematuhi rantai integritas:
*   **Double-Entry Balance**: Total Debit == Total Kredit (Decimal Precision).
*   **Inventory Integration**: Transaksi dengan item wajib memicu `InventoryLog` dan mengupdate `Product.current_stock`.
*   **Metode Perpetual (HPP)**: Transaksi 'SALES' otomatis menghitung HPP berdasarkan harga modal historis dan menghasilkan jurnal: **Debit HPP, Kredit Persediaan**.

## 3. Smart Note & Cognitive Entity Mapping (C.E.M)
AI bertindak sebagai "Detektif Data" dengan tahapan:
1.  **Named Entity Recognition (NER)**: Memetakan Merchant, SKU Produk, Qty Transaksi, dan Nilai Ekonomi.
2.  **Nested Units Awareness**: Membedakan satuan yang merupakan bagian dari Nama Produk (misal: "Beras 5kg") dengan satuan volume transaksi (misal: "10 pack").
3.  **Implicit Reasoning**:
    *   Tanda `@` atau `per` = Harga Satuan.
    *   Tanda `=` atau tanpa simbol = Harga Total (AI wajib menghitung balik `unit_price = Total / Qty`).
4.  **Zero-Knowledge Protocol**: Jika barang tidak ada di Master Data, AI dilarang mencocokkan paksa (Halu) dan wajib menandai sebagai `is_new_product: true`. Pada input ringkasan, AI dilarang mengarang item (items: []).

## 4. Universal Numeric & Currency Protocol
Menangani ambiguitas format angka (US vs Indo Style) secara otomatis:
1.  **Last Separator Rule**: Pemisah (titik/koma) yang muncul paling akhir dianggap sebagai **DESIMAL**. Pemisah sebelumnya dianggap **RIBUAN**.
2.  **3-Digit Pattern**: Jika hanya satu jenis pemisah diikuti tepat 3 digit, ia adalah **RIBUAN** (misal: 1.354.000).
3.  **Pre-emptive Normalization**: Backend menghapus titik ribuan sebelum teks dikirim ke AI untuk menjamin integritas nominal jutaan.
4.  **JSON Standard**: Seluruh data angka di level API/DB wajib berupa murni `Number` (Integer/Float), bukan String berformat.

## 5. High-Performance Vector & Memory Strategy
Kolaborasi antara **Redis (Short-term)** dan **pgvector (Long-term)**:
*   **Indeks HNSW**: Menggunakan Hierarchical Navigable Small World pada PostgreSQL untuk pencarian master data yang cepat dan akurat (Metric: `cosine_distance`, m=16, ef_construction=64).
*   **Optimalisasi halfvec (Mandat Skalabilitas)**: Untuk vektor dimensi tinggi (di atas 2000, seperti 3072), sistem **WAJIB** menggunakan tipe data `halfvec` (16-bit precision) guna mendukung indeks HNSW dan efisiensi memori (pgvector v0.7.0+ required).
*   **Hybrid Validation**:
    *   Jarak < 0.1: **Exact Match**. Identitas dikunci otomatis.
    *   Jarak 0.1 - 0.4: **Candidate**. Disuapkan ke AI sebagai rujukan.
    *   Jarak > 0.4: **New Entity**. Protokol belajar mandiri aktif.
*   **Redis Semantic Cache**: Menyimpan hasil penalaran AI untuk input yang identik guna menghemat biaya token dan latensi.

## 6. Visual-to-Value Pipeline (File Upload)
Alur pemrosesan dokumen (Nota/PDF):
1.  **AI Vision (OCR)**: Ekstraksi teks dan struktur awal.
2.  **Normalisasi & NER**: Pembersihan noise dan pemetaan entitas ekonomi.
3.  **Vectorization**: Nama produk di-embed (Ollama/nomic-embed) untuk divalidasi ke database via HNSW.
4.  **Transactional Mapping**: Hasil divalidasi user dan disimpan ke buku besar.

## 7. AI Resilience & Model Hierarchy
Sistem menjamin ketersediaan layanan melalui hirarki:
*   **Level 1 (Local)**: Ollama (Gratis, Privat, Cepat).
*   **Level 2 (Cloud)**: Gemini Flash (Efisien untuk teks bebas).
*   **Level 3 (High-Reasoning)**: Gemini Pro (Untuk debugging arsitektur berat).
*   **Deterministic Configuration**: Selalu gunakan `temperature: 0.0` untuk tugas ekstraksi data.
*   **Operational Classification Rule**: Istilah "Pendapatan" dalam konteks toko harian wajib dipetakan ke `transaction_type: "sales"` guna memicu HPP Perpetual.

## 8. Manajemen State & Context (Implementation Status: DONE)
*   **Backend**: Menggunakan `ContextVar` (`app/core/context.py`) untuk membawa identitas tenant/user secara implisit (Implicit Global Context).
*   **Frontend**: Menggunakan **Zustand Global Store** (`store/accounting.ts`). Setiap perubahan data wajib memicu `refreshAll()` untuk sinkronisasi Dashboard, Transaksi, dan Laporan tanpa reload.

## 10. Kontrak Integrasi & Protokol Anti-Regresi
Dokumen ini menetapkan standar wajib untuk menjaga integritas lintas-lapisan (Cross-Layer Integrity):

### 10.1. Kontrak Komunikasi AI (Display vs Data)
AI (Gemini/Ollama) **WAJIB** memisahkan antara data untuk manusia dan data untuk mesin:
*   **Label Tampilan (UI)**: Harus menggunakan Nama Akun/Produk yang manusiawi (cth: "Kas Utama", "HPP Sembako"). Respon API **WAJIB** menyertakan objek `account` lengkap (id, code, name).
*   **Payload Operasi (Action)**: Harus menggunakan ID Akun/Produk (Integer/UUID) untuk menjamin akurasi operasional database.

### 10.2. Protokol Sinkronisasi State (Perpetual-Aware)
Frontend memiliki tanggung jawab reaktivitas saat data dalam status Draft/Preview:
*   **Scaling Rule**: Jika nominal transaksi (`total_amount`) diubah oleh pengguna di UI, maka seluruh baris jurnal (termasuk HPP dan Persediaan) **WAJIB** dihitung ulang secara proporsional oleh Frontend seketika (*State-Aware Scaling*).
*   **Anchor Point**: Penskalaan harus berbasis pada baris Pendapatan/Kas sebagai jangkar (*anchor*) rasio.

### 10.3. Keandalan Inferensi (Auto-Model Switching)
Backend harus menjamin ketersediaan layanan AI melalui mekanisme *Robust Failover*:
*   **Flow**: Ollama (Lokal) → Gemini Flash Lite → Gemini Flash → Gemini Pro.
*   **Recovery**: Setiap kegagalan parsing JSON atau timeout pada satu model wajib memicu percobaan pada model berikutnya secara otomatis tanpa menginterupsi pengguna.

### 10.4. Keamanan Jaringan & CORS
Konfigurasi CORS di `core/config.py` harus mencakup seluruh konteks host yang valid (localhost, 127.0.0.1, host.docker.internal) pada port 7500, 5173, dan 8005 untuk mencegah *Network Error* saat sinkronisasi state.
