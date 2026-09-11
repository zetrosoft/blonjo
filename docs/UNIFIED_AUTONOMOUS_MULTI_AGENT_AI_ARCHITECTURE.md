# 🏛️ Cetak Biru Sistem: Dynamic Autonomous Intelligence Platform
### *Engine Nalar Adaptif: Agentic AI Adaptation (Cheap, Lightweight & Efficient), Presisi Tinggi, Respons Cepat, Fluid Multi-Agent Synthesis, Metodologi Marketing Konversi & Penyelarasan is_maintenance_stock*

Dokumen ini mendefinisikan arsitektur sistem kecerdasan buatan otonom (**Dynamic Autonomous Intelligence Platform**). Sistem ini mengadopsi metodologi **Agentic AI Adaptation: Building Intelligent Systems that are Cheap, Lightweight, and Efficient** (Zetrosoft, Bijak Techno), di mana kecerdasan sistem ditingkatkan secara radikal melalui **optimalisasi perkakas spesialis adaptif (*Specialized Lightweight Tools*)** di bawah kendali *Frozen Foundation Model* (Google Gemini), menghasilkan sistem yang berkecepatan tinggi, hemat biaya token, presisi mutlak, dan bebas halusinasi.

---

## 1. Paradigma Utama: Agentic AI Adaptation Architecture

> [!IMPORTANT]
> **"Training & Optimizing Tools Beats Training Agents"**  
> Sistem memisahkan secara tegas antara *General Planner/Reasoner* (Google Gemini yang dibiarkan *frozen*) dengan *Specialized Appendages/Tools* (Tool komputasi lokal berkinerja tinggi).
> 1. **Data & Token Efficiency**: Pemrosesan kalkulasi, penelusuran AST, dan agregasi data dituntaskan di tingkat tool lokal, mengurangi konsumsi token LLM hingga 70–80%.
> 2. **Execution Feedback Loop (A1 Paradigm)**: Agen melakukan *self-correction* otomatis berdasarkan sinyal balik eksekusi tool sebelum menghasilkan jawaban akhir.
> 3. **Supervised Tool Adaptation (T2 Paradigm)**: Perkakas spesialis diperkaya secara berkala melalui pembelajaran umpan balik (*Continuous Rule Distillation* pada `supplier_parsing_rules` & `vibes_memory`).
> 4. **Constraint-Based Integrity**: Validasi deterministik untuk standar akuntansi PSAK EMKM dan aturan operasional `is_maintenance_stock`.

```mermaid
graph TD
    subgraph S1 ["1. Otak Nalar Ringan (Frozen Foundation LLM)"]
        User["Chat Input Alami (Zero-Touch)"]
        Gemini["Google Gemini Engine (Planner & Synthesizer)\n• Biaya Token Murah & Latensi Sub-detik\n• Bebas dari Fine-Tuning Berat"]
    end

    subgraph S2 ["2. Perkakas Adaptif Spesialis (Lightweight Tools - T2 Paradigm)"]
        T1["BaseMind AST & Symbol Explorer\n(Navigasi Kode & Blast Radius)"]
        T2["Forensic Math & PSAK Engine\n(Rekonsiliasi Deterministik)"]
        T3["Dynamic Market & HET Harvester\n(Async Web Scraper + Caching 24 Jam)"]
        T4["Rule Distillation & Store Memory\n(supplier_parsing_rules & vibes_memory)"]
    end

    subgraph S3 ["3. Umpan Balik Eksekusi & Koreksi Mandiri (A1 Paradigm)"]
        Feedback["Execution Feedback Signal\n(Evaluasi Status Kueri & Validasi Output)"]
        SelfCorrect["Autonomous Auto-Repair / Retry"]
    end

    subgraph S4 ["4. Lapisan Data & Basis Pengetahuan Terdistribusi"]
        DB[("PostgreSQL DB (Buku Besar, Transaksi, is_maintenance_stock)")]
        Web["Web Market Streams (PIHPS, Kemendag)"]
        AST["BaseMind Code Graph (Tree-sitter)"]
        Docs["Astro Logbook & User Manuals"]
    end

    subgraph S5 ["5. Output Multi-Modal Instan (Cheap, Fast, & Accurate)"]
        UI["Visualisasi Dinamis (Tabel Ekspor, Grafik, Naskah Video, Blog, Katalog, Kode)"]
    end

    User --> Gemini
    Gemini -->|Dispatch Paralel| T1
    Gemini -->|Dispatch Paralel| T2
    Gemini -->|Dispatch Paralel| T3
    Gemini -->|Dispatch Paralel| T4

    T1 <--> AST
    T2 <--> DB
    T3 <--> Web
    T4 <--> DB
    T4 <--> Docs

    T1 --> Feedback
    T2 --> Feedback
    T3 --> Feedback
    T4 --> Feedback

    Feedback --> SelfCorrect
    SelfCorrect -->|Konteks Faktual yang Tereduksi & Bersih| Gemini
    Gemini --> UI
```

---

## 2. Penyelarasan Nalar Bisnis Fitur `is_maintenance_stock`

Sistem secara dinamis membaca konfigurasi `is_maintenance_stock` pada tabel `app_settings` untuk menentukan metode pembacaan data dan logika nalar AI:

```mermaid
graph TD
    Check{"Evaluasi Setting\nis_maintenance_stock"}

    subgraph ModeLumsum ["Mode A: is_maintenance_stock = false (Kasir Cepat / Omset Lumsum)"]
        L1["Karakteristik: Penjualan dicatat agregat tanpa potong stok rak"]
        L2["Larangan Mutlak: AI DILARANG mengarang angka sisa stok fisik"]
        L3["Nalar AI: Analisis ritme & frekuensi belanja modal kulakan ke pemasok (Procurement Velocity)"]
        L4["Rekomendasi Restock: Berdasarkan siklus historis belanja modal kasir"]
    end

    subgraph ModeFisik ["Mode B: is_maintenance_stock = true (Manajemen Stok Fisik Penuh)"]
        F1["Karakteristik: Penjualan kasir memotong stok per unit secara real-time"]
        F2["Pembacaan Data: Membaca langsung kolom products.current_stock"]
        F3["Nalar AI: Menghitung kuantitas fisik riil & estimasi tanggal habis (Stockout Date)"]
        F4["Evaluasi Dead Stock: Menghitung rupiah modal mengendap di rak gudang"]
    end

    Check -->|Nilai: false| ModeLumsum
    Check -->|Nilai: true| ModeFisik
```

---

## 3. Kapabilitas 6 Gugus Agen Spesialis Terpadu

### 📊 1. Finansial & Forensik Akuntansi *(WrenAI & Forensic Math Tool)*
* **Kapabilitas**: Otomasi Laba Rugi, Neraca, Arus Kas, dan Neraca Saldo PSAK EMKM. Menyesuaikan perhitungan HPP sesuai model toko (perpetual jika `is_maintenance_stock = true` atau pembelian periodik jika `false`). Menghasilkan visualisasi grafik interaktif (`chart:bar`, `chart:line`, `chart:pie`) dan ekspor instan CSV/PDF.

### 🌐 2. Intelijen Pasar & Arbitrase Pasokan *(OpenBB & Market Harvester Tool)*
* **Kapabilitas**: Memadukan riwayat harga faktur kulakan toko dengan data pasar komoditas nasional (PIHPS) dan HET resmi Kemendag secara real-time melalui web scraping async dengan caching cerdas untuk mendeteksi disparitas harga dan memberikan rekomendasi waktu belanja grosir terbaik.

### 💼 3. Strategi Operasional & Manajemen Ritel *(Retail Optimization Tool)*
* **Kapabilitas**: Menganalisis perputaran modal (*turnover rate*). Mengubah barang lambat gerak menjadi penarik traffic (*loss-leader*) dan memproyeksikan ketahanan kas (*cash runway*) 30–90 hari ke depan.

### 🎯 4. Pertumbuhan Bisnis & Psikologi Marketing Konversi *(AIDA, PAS & Anchoring Engine)*
* **Kapabilitas**:
  1. **Framework PAS & AIDA Terapan**: Merancang penawaran produk yang menonjolkan keuntungan fungsional dan emosional pembeli tanpa buzzword klise.
  2. **Smart Bundling & Price Anchoring**: Memaketkan barang kebutuhan pokok ber-margin tipis bersama produk pelengkap ber-margin tebal.
  3. **Program Tabungan & Arisan Ritel**: Merancang skema arisan paket sembako hari raya yang memicu loyalitas komunitas sekitar toko.

### 🎨 5. Studio Konten Kreatif & Penerbitan Omnichannel *(Creative Studio Tool)*
* **Kapabilitas Utama**:
  1. **Naskah Video Pendek (Reels/TikTok/Shorts)**: Struktur hook 0–3 detik pembuka (*pattern interrupt*), narasi empati, dan CTA persuasif.
  2. **Prompt Visual Sinematik**: Parameter detail (*lighting, lens, mood, camera settings*) untuk poster promosi toko.
  3. **Artikel Blog Edukatif & Berita Toko**: Artikel ramah SEO berbasis Markdown (tips penyimpanan sembako, panduan belanja hemat, komparasi bahan pangan).
  4. **Ulasan Produk Mendalam (*Product Review & Comparison*)**: Review objektif dan persuasif kelebihan/karakteristik produk.
  5. **Penyusunan Lembar Katalog Produk (*Digital Price Catalog*)**: Format katalog daftar harga produk mingguan/bulanan yang rapi, terstruktur dalam tabel, dan siap dibagikan ke WhatsApp pelanggan atau dicetak.

### 💻 6. BaseMind Codebase Archaeologist *(Code-Graph-RAG & AST Tool)*
* **Kapabilitas**: Penjelajahan pohon sintaksis AST Tree-sitter, pemetaan simbol, analisis dampak perubahan fungsi (*Blast Radius*), inspeksi skema basis data PostgreSQL, dan penelusuran riwayat keputusan rilis dari 95+ artikel logbook.

---

## 4. Alur Siklus Permintaan Adaptif (Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor Pengguna as Pengguna (Kasir / Pemilik / Dev / Creator)
    participant Chat as Antarmuka Chat
    participant Router as Autonomous Router
    participant Tools as Specialized Lightweight Tools
    participant SumberData as Basis Data & Pengetahuan
    participant Gemini as Google Gemini (Frozen Planner)
    participant Validator as Execution Feedback & Math Guard

    Pengguna->>Chat: Mengirim pertanyaan atau instruksi
    Chat->>Router: Meneruskan permintaan bersama konteks auth & setting toko
    
    Router->>Router: Identifikasi kebutuhan domain & evaluasi flag is_maintenance_stock
    Router->>Tools: Dispatch paralel ke lightweight tools yang dibutuhkan
    
    Tools->>SumberData: Eksekusi komputasi lokal & ekstraksi data terstruktur
    SumberData-->>Tools: Raw Data Faktual
    
    Tools->>Validator: Validasi deterministik & sinyal eksekusi (A1 Feedback)
    Validator-->>Gemini: Data terekstraksi yang ringkas, bersih & bebas halusinasi
    
    Gemini->>Gemini: Sintesis akhir dengan gaya bahasa natural & profesional
    Gemini-->>Chat: Menghasilkan streaming response multi-modal instan
    Chat-->>Pengguna: Menyajikan tabel ekspor, grafik interaktif, artikel blog, review, katalog, atau kode
```
