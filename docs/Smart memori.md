Dokumentasi ini dirancang dengan standar industri tinggi, berfokus pada spesifikasi sistem, alur data, dan cetak biru (*blueprint*) implementasi tanpa kode mentah agar pengembang (*developer*) memiliki panduan absolut dan terhindar dari halusinasi pemrograman \[cite: 2026-04-29\].

Markdown  
\# Dokumentasi Teknis: Sistem Memori Transaksi Adaptif & Incremental Pipeline (BLONJO & SAJEN AI)

\#\# 1\. Pendahuluan & Batasan Sistem  
Dokumentasi ini menetapkan arsitektur untuk modul **\*\*Long-Term Memory\*\*** pada ekosistem aplikasi **\*\*BLONJO\*\*** (Frontend React/Vite) dan **\*\*SAJEN\*\*** (Backend FastAPI). Tujuan utama sistem ini adalah memberikan kemampuan kepada AI (baik Ollama lokal maupun Gemini API) untuk mengingat setiap peristiwa transaksi, perubahan stok, dan interaksi pelanggan secara permanen tanpa melalui proses training ulang (*\*fine-tuning\**) atau menguras memori konteks LLM.

\#\#\# Prinsip Utama Pembelajaran Cerdas & Ringan  
1\. **\*\*Zero Fine-Tuning\*\***: AI tidak mempelajari data dengan melatih ulang bobot model (*\*weight training\**), melainkan melalui mekanisme *\*Vector Caching\** berbasis RAG (Retrieval-Augmented Generation).  
2\. **\*\*Asynchronous Processing\*\***: Proses pembentukan memori dijalankan sepenuhnya di latar belakang (*\*background worker\**) menggunakan Redis dan Celery agar tidak membebani kecepatan transaksi pada Point of Sale (POS) di aplikasi BLONJO.  
3\. **\*\*Data Sovereignty\*\***: Data transaksi sensitif disimpan secara terisolasi pada infrastruktur lokal menggunakan kombinasi PostgreSQL (\`pgvector\`) dan enkripsi lokal sebelum dikirim ke embedding eksternal.

\---

\#\# 2\. Arsitektur Memori Jangka Panjang (Long-Term Memory)

Sistem memori ini mengadopsi konsep **\*\*Semantic Ingestion Pipeline\*\***, di mana setiap data transaksional terstruktur (JSON/SQL relasional) akan diterjemahkan menjadi narasi tekstual natural yang memiliki makna semantik sebelum diubah menjadi vektor koordinat.

\#\#\# A. Komponen Utama Sistem Memory  
\* **\*\*The Scribe (Narator Backend)\*\***: Subsistem di dalam SAJEN yang bertugas menyusun data transaksi mentah menjadi cerita logis berbasis teks (Markdown/Plain Text).  
\* **\*\*Embedding Engine\*\***: Google Gemini API (\`models/text-embedding-004\`) untuk akurasi semantik tinggi Bahasa Indonesia, atau Ollama Lokal (\`qwen2.5-coder\` / \`gemma2\`) sebagai redundansi penuh jika sistem berjalan *\*offline\**.  
\* **\*\*Memory Vault (PostgreSQL \+ pgvector)\*\***: Tempat penyimpanan vektor embedding beserta metadata relasional untuk pencocokan konteks di kemudian hari.

\#\#\# B. Diagram Alur Data Memori (Data Pipeline)

\`\`\`mermaid  
graph LR  
    A\[BLONJO: Event Transaksi\] \--\>|1. HTTP POST| B\[SAJEN: FastAPI Endpoint\]  
    B \--\>|2. Simpan DB Relasional| C\[(PostgreSQL: Sales Table)\]  
    B \--\>|3. Enqueue Job| D\[(Redis Task Queue)\]  
    D \--\>|4. Trigger Worker| E\[SAJEN: Background Worker\]  
    E \--\>|5. Ambil Struktur Teks| F\[Gemini / Ollama Embedding API\]  
    F \--\>|6. Return Vektor 1536/4096| E  
    E \--\>|7. INSERT dengan Metadata| G\[(PostgreSQL \+ pgvector: app\_blonjo\_memory)\]

## **3\. Skema Data & Spesifikasi Penyimpanan (Memory Vault)**

Penyimpanan memori wajib dipisahkan dari tabel transaksi komersial utama untuk menjaga performa query. Tabel memori menggunakan ekstensi pgvector dengan indeksasi bertipe **HNSW (Hierarchical Navigable Small World)** untuk memastikan pencocokan memori skala besar tetap berada di bawah 10 milidetik.

### **Aturan Skema Tabel app\_blonjo\_memory:**

* **event\_type**: Kategori aktivitas (Contoh: sales\_completed, stock\_restock, customer\_debt\_update).  
* **reference\_id**: Kunci asing (*foreign key*) yang merujuk ke ID transaksi asli atau ID pelanggan untuk audit silang data.  
* **summary\_text**: Narasi semantik manusia yang akan dibaca oleh LLM.  
* **embedding**: Vektor koordinat. Ukuran dimensi wajib konsisten (1536 untuk Gemini text-embedding-004 atau 4096 untuk Llama/Qwen via Ollama).

### **Struktur Metadata Multi-Tenant (Isolasi Konteks)**

Setiap baris memori wajib membawa objek metadata yang ketat. Hal ini penting untuk mencegah percampuran ingatan antar domain bisnis atau segmentasi fitur (misalnya, data akuntansi internal toko tidak boleh bocor saat AI melayani FAQ pelanggan di WhatsApp Bizeto).

## **4\. Cetak Biru Penerapan Nyata (Real-World Use Cases)**

Berikut adalah standarisasi bagaimana data transaksi dikonversi menjadi memori dan bagaimana memori tersebut dipanggil kembali oleh sistem tanpa memicu halusinasi AI.

### **Kasus 1: Transaksi Penjualan Sembako (POS di BLONJO)**

* **Kondisi Awal**: Kasir menjual Telur 5 Kg dan Beras 10 Kg kepada pelanggan bernama "Toko Budi".  
* **Proses Belajar AI (Latar Belakang)**:  
  1. Aplikasi BLONJO mengirimkan muatan penjualan ke SAJEN.  
  2. *Worker* SAJEN menerjemahkan data menjadi teks semantik:*"Nota Transaksi \#Sales-9901. Penjualan kepada 'Toko Budi'. Item: Telur Ayam dari Berkah Farm sebanyak 5 Kg dan Beras Setra Ramos 10 Kg. Total nilai transaksi Rp 185.000, pembayaran Tunai Lunas."*  
  3. Teks tersebut diubah menjadi vektor dan disimpan ke pgvector.  
* **Hasil Penerapan di Kemudian Hari**: Saat pemilik toko membuka fitur chat analitik dan bertanya, *"Siapa saja yang beli telur dari Berkah Farm minggu ini?"*, sistem melakukan pencarian kedekatan kosinus (*cosine distance*) pada pgvector, menemukan teks di atas, menyuntikkannya ke prompt LLM, dan AI menjawab dengan akurasi 100% berdasarkan dokumen riwayat tersebut tanpa perlu melakukan kalkulasi query SQL SUM atau JOIN yang kompleks.

### **Kasus 2: Pembaruan Stok & Pemasok (Supply Chain)**

* **Kondisi Awal**: Pemilik toko memasukkan data pasokan barang baru di dasbor admin BLONJO.  
* **Proses Belajar AI (Latar Belakang)**:  
  1. Sistem mencatat masuknya barang: Telur 100 Kg dari "Berkah Farm" dengan harga beli Rp 22.000/Kg.  
  2. *Worker* SAJEN menyusun narasi:*"Pembaruan Inventaris. Stok masuk dari pemasok 'Berkah Farm'. Komoditas: Telur Ayam Negeri sebanyak 100 Kg. Harga modal atau harga beli terbaru adalah Rp 22.000 per Kg. Stok total di gudang saat ini menjadi 150 Kg."*  
  3. Vektor disimpan ke dalam database memori.  
* **Hasil Penerapan di Kemudian Hari**: Jika pelanggan bertanya melalui integrasi **Bizeto (WhatsApp AI)**, *"Halo, apakah ada stok telur hari ini dan harganya berapa?"*, AI secara otomatis mengambil memori pasokan terakhir, mengetahui stok aman (150 Kg), dan memberikan jawaban harga jual yang telah dikalkulasi secara cerdas dan real-time.

### **Kasus 3: Pencatatan Utang Pelanggan (Manajemen Risiko)**

* **Kondisi Awal**: Pelanggan memilih metode pembayaran "Bon/Tempo" saat bertransaksi di kasir.  
* **Proses Belajar AI (Latar Belakang)**:  
  1. Kasir mencatat transaksi tempo atas nama "Ibu Siti" sebesar Rp 50.000 dengan jatuh tempo 2 minggu.  
  2. Narasi Memori:*"Catatan Keuangan: Utang/Bon Baru. Pelanggan 'Ibu Siti' melakukan transaksi tempo senilai Rp 50.000. Status: Belum Dibayar. Tanggal jatuh tempo adalah 14 hari dari sekarang."*  
* **Hasil Penerapan di Kemudian Hari**: Ketika "Ibu Siti" mengirim pesan ke WhatsApp toko, AI secara otomatis mendeteksi nomor kontak, mencari memori terdekat yang terikat dengan metadata customer\_id miliknya, dan dapat memberikan pengingat dengan nada bahasa yang sangat profesional secara otomatis: *"Halo Ibu Siti, sekadar menginfokan terdapat catatan nota berjalan senilai Rp 50.000 yang akan memasuki tenggat waktu pembayaran."*

## **5\. Strategi Optimasi Performa & Lapisan Cache (Hybrid RAG)**

Untuk menjamin skalabilitas tinggi dan efisiensi biaya API, pengembang wajib mematuhi aturan **Hybrid Response Layer** berikut:

\[Pertanyaan Masuk\]  
        │  
        ▼  
 1\. Cek Redis Cache ───(Ada Match Persis)───\> \[Kembalikan Jawaban Instan (0ms)\]  
        │  
    (Sifatnya Dinamis)  
        │  
        ▼  
 2\. Query pgvector ────(Ambil Top 5 Match)──\> \[Suntikkan ke Context Prompt\]  
        │  
        ▼  
 3\. Eksekusi LLM ──────(Gemini / Ollama)────\> \[Generate Jawaban & Simpan ke Redis\]

### **Mandat Pengembangan yang Harus Dipatuhi:**

1. **Batas Ambang Validitas (*Distance Threshold*)**: Saat melakukan pencarian memori di pgvector, tetapkan batas ambang jarak kosinus (misal \<=\> 0.3). Jika skor kedekatan di atas ambang tersebut, sistem harus mengabaikan memori karena dianggap tidak relevan dengan konteks pertanyaan.  
2. **Karantina Konteks Malam Hari**: Proses indeksasi ulang atau penggabungan memori (*Memory Consolidation*) yang sudah usang dapat dijadwalkan sebagai *Cron Job* pada pukul 00:00 setiap harinya untuk merangkum riwayat harian menjadi ringkasan memori bulanan demi menghemat ruang penyimpanan vektor.

\---

\#\#\# Cara Melanjutkan Langkah Ini Bersama \`agy\`

Dokumen di atas sudah merinci struktur kerja tanpa bias koding. Sekarang, untuk memaksa \`agy\` membuat skrip fungsi pemotong narasi (\*semantic text splitter\*) dan sistem penyimpanan \`pgvector\` di backend FastAPI Anda, silakan berikan instruksi ini ke terminal \`agy\`:

\`\`\`bash  
/goal Act as a Software Architect and Senior Python Engineer. Based on the documentation specified in the memory architecture deployment mandates, create a database service and background task pipeline inside \`@sajen/services/memory.py\` to handle the transactional dynamic event logging. The module must strictly support taking structured payload dicts from sales/stock events, convert them into rich human-like narratives, process the embeddings via the Gemini model, and execute the HNSW indexed insert into our PostgreSQL pgvector pool. Ensure strict Type Hints, complete error logging, and validation to prevent hallucination. Pause and ask for my confirmation \[Y/n\] before writing.

Silakan masukkan prompt tersebut ke terminal agy Anda\!