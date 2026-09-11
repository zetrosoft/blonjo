# 🏛️ Cetak Biru Arsitektur: Unified Autonomous AI Multi-Expert Intelligence
### *(Integrasi Zero-Touch: BaseMind, Gemini, PostgreSQL, Laporan Akuntansi, Visual Charts, Proyeksi & Web Market Intelligence)*

Dokumen ini mendefinisikan arsitektur teknis komprehensif untuk membangun **Unified Autonomous AI Multi-Expert Assistant** yang bekerja **100% otomatis berbasis intens kalimat pengguna (Zero-Touch / No Manual Persona Switcher)**. Asisten ini menggabungkan:
1. **Laporan Akuntansi Standar PSAK EMKM** (Laba Rugi, Neraca, Arus Kas, Trial Balance).
2. **Interactive Chart & Visualization Engine** (Bar, Line, Pie, Mermaid Flowcharts).
3. **Financial & Operational Projections** (Proyeksi Arus Kas, BEP, Kebutuhan Modal Kerja).
4. **Hybrid External Web & Market Intelligence** (Integrasi HET, Indeks Harga Komoditas, & Tren Pasar Online).
5. **Bisnis & Marketing Advisor** (Analisis Dead Stock, Strategi Bundling, Optimasi Margin).
6. **Senior Content Creator** (Naskah Video Hook Kuat, Prompt Visual Detail, Copywriting).
7. **Customer & SOP Support** (Panduan Operasional Kasir & POS).
8. **Technical & Codebase Intelligence (BaseMind Engine)** (AST Symbols, Schemas, Routes, Changelog).

---

## 1. Peta Arsitektur Ekosistem Terpadu (Unified Architecture Map)

```mermaid
flowchart TB
    subgraph SingleInputLayer["🖥️ Antarmuka Pengguna Tunggal (Single Natural Language Chat)"]
        ChatInput["Input Pesan Bebas Tanpa Pemilih Mode\n(Contoh: 'Buat laporan laba rugi Agustus + chart tren omset' / 'Prediksi harga minyak bulan depan berdasarkan pasar')"]
    end

    subgraph AutonomousOrchestrator["⚡ Dynamic Intent Classifier & Autonomous Expert Router"]
        Classifier["Multi-Dimensional Semantic Intent Classifier\n(Analisis Nalar Kalimat, Entitas Tanggal, & Domain Pengetahuan)"]
        RBAC["Silent Role-Based Access Guardrail"]
    end

    subgraph CoreCapabilities["🧠 Matriks Kemampuan & Eksekusi Cerdas"]
        subgraph AccountingAndViz["📊 Akuntansi, Visualisasi & Proyeksi"]
            Cap_Acc["📋 Laporan Akuntansi PSAK\n(Laba Rugi, Neraca, Arus Kas,\nExport CSV/Excel & Print PDF)"]
            Cap_Viz["📈 Visual Chart Engine\n(Bar Chart, Line Trend, Pie,\nDiagram Alir Mermaid)"]
            Cap_Proj["🔮 Proyeksi & Prediksi Finansial\n(Arus Kas 30-90 Hari, BEP,\nForecast Habis Stok)"]
        end

        subgraph MarketAndCreative["🌐 Riset Pasar, Bisnis & Kreatif"]
            Cap_Web["🌍 Hybrid Web & Market Intel\n(HET Nasional, Komoditas PIHPS,\nTren Inflasi & Momen Grosir)"]
            Cap_Biz["💼 Bisnis & Marketing Advisor\n(Dead Stock, Margin, Bundling)"]
            Cap_Creative["🎨 Senior Content Creator\n(Naskah Video, Prompt Visual, Copy)"]
        end

        subgraph SupportAndTech["🛠️ Support & Codebase"]
            Cap_SOP["📘 Customer & SOP Support\n(Panduan Kasir & User Manual)"]
            Cap_Code["💻 BaseMind Codebase Engine\n(AST, Symbols, Schemas, Routes)"]
        end
    end

    subgraph KnowledgeDataSources["📦 Data Feeds & Grounding Sources"]
        DB_Postgres[("PostgreSQL Production\n(transactions, inventory_logs,\naccounts, contacts, app_settings)")]
        Web_Search["Web Search Engine (Real-Time API)\n(PIHPS, Kemendag, Berita Komoditas)"]
        Astro_Logbook["95+ Artikel Logbook & CHANGELOG.md"]
        BaseMind_AST["BaseMind Codebase AST Index"]
    end

    subgraph LLMEngine["🌟 Multi-Model Reasoning Engine"]
        Gemini["Google Gemini 2.0 / 1.5 Flash (Primary)"]
        Guard["Zero-Hallucination & Math Verification Guardrail"]
    end

    ChatInput --> Classifier
    Classifier --> RBAC

    RBAC --> Cap_Acc
    RBAC --> Cap_Viz
    RBAC --> Cap_Proj
    RBAC --> Cap_Web
    RBAC --> Cap_Biz
    RBAC --> Cap_Creative
    RBAC --> Cap_SOP
    RBAC --> Cap_Code

    Cap_Acc <--> DB_Postgres
    Cap_Viz <--> DB_Postgres
    Cap_Proj <--> DB_Postgres
    Cap_Web <--> Web_Search
    Cap_Biz <--> DB_Postgres
    Cap_Code <--> BaseMind_AST
    Cap_Code <--> Astro_Logbook

    CoreCapabilities --> Gemini
    Gemini --> Guard
    Guard --> ChatInput
```

---

## 2. Rincian Fitur Utama & Format Output

### A. 📋 Laporan Akuntansi Standar PSAK EMKM
* **Jenis Laporan**:
  * **Laporan Laba Rugi (*Profit & Loss*)**: Pendapatan, HPP faktual, Biaya Operasional terperinci (Listrik, BBM, Sewa, Gaji), Laba Bersih.
  * **Neraca (*Balance Sheet*)**: Aset Lancar (Kas, Bank, Piutang, Persediaan Barang), Aset Tetap, Kewajiban (Utang Usaha/Pemasok, Titipan Dana Pelanggan), Ekuitas (Modal Pemilik, Prive, Laba Ditahan).
  * **Laporan Arus Kas (*Cash Flow*)**: Arus Kas Operasi, Investasi, dan Pendanaan.
  * **Neraca Saldo (*Trial Balance*)**: Saldo Debit-Kredit seluruh akun COA dalam kondisi seimbang (*Balanced*).
* **Format Output**: Tabel Markdown presisi yang dilengkapi tombol instan **Download CSV/Excel** dan **Cetak Laporan / PDF** (menggunakan fungsi bawaan `VibesChat.tsx`).

### B. 📈 Interactive Chart & Diagram Engine
Ketika pengguna meminta visualisasi, AI secara otomatis menyertakan tag JSON chart di dalam responnya:
* ````chart:bar` : Perbandingan omset per kategori, ranking produk terlaris, pengeluaran terbesar.
* ````chart:line` : Tren pergerakan omset harian, mingguan, atau bulanan.
* ````chart:pie` : Komposisi biaya operasional atau pangsa komoditas.
* ````mermaid` : Diagram alir alur kerja sistem, pohon akun COA, atau relasi rantai pasok (*Supply Chain*).

### C. 🔮 Financial & Operational Forecasting (Proyeksi & Prediksi)
* **Proyeksi Arus Kas (*Cash Flow Runway*)**: Menghitung estimasi saldo kas 30, 60, hingga 90 hari ke depan berdasarkan rata-rata *burn rate* beban operasional dan pola penerimaan omset harian.
* **Prediksi Titik Habis Stok (*Stock Depletion Forecast*)**: Mengestimasi tanggal habis barang berdasarkan kecepatan penjualan (*velocity*) dan merekomendasikan tanggal kulakan kembali sebelum kehabisan (*Stockout Prevention*).
* **Evaluasi Dead Stock & Modal Mandek**: Mengidentifikasi produk yang tidak bergerak dalam 30–60 hari beserta nilai modal yang tertahan.

### D. 🌍 Hybrid External Web & Market Intelligence (Data Internal + Eksternal)
* **Integrasi Data Internal + Eksternal**:
  * Membandingkan harga beli kulakan toko dengan **HET (Harga Eceran Tertinggi)** resmi pemerintah dan harga pasar induk PIHPS.
  * Menganalisis momen terbaik untuk belanja grosir stok komoditas (misal: tren harga beras, minyak, cabai, atau bawang menjelang hari raya / cuaca panen).
* **Mekanisme**: Memanggil `webSearchService.ts` secara otomatis ketika pertanyaan melibatkan tren pasar, harga nasional, komoditas, atau berita regulasi terbaru.

---

## 3. Matriks Keahlian Terpadu (Autonomous Multi-Expert Matrix)

| Domain Keahlian | Pemicu Alami (Intent Triggers) | Karakteristik Jawaban | Sumber Data |
| :--- | :--- | :--- | :--- |
| **📊 Akuntansi & Laporan** | *"Tampilkan laporan laba rugi bulan lalu"*<br>*"Buat neraca saldo dan posisi kas"* | Tabel keuangan formal PSAK, debit-kredit seimbang, exportable ke CSV/PDF. | `transactions`, `journal_entries`, `accounts` |
| **📈 Visualisasi Grafik** | *"Buat grafik tren omset 3 bulan terakhir"*<br>*"Visualisasikan porsi pengeluaran operasional"* | Render grafik interaktif (Bar/Line/Pie) dan diagram Mermaid langsung di UI. | Agregasi SQL PostgreSQL |
| **🔮 Proyeksi & Prediksi** | *"Berapa perkiraan kas 1 bulan ke depan?"*<br>*"Kapan stok beras panen diperkirakan habis?"* | Proyeksi matematis realistis, prediksi tanggal kulakan, analisis runway modal. | `inventory_logs`, `predictiveEngine.ts` |
| **🌍 Riset Pasar Eksternal** | *"Bandingkan harga beli minyak kita dengan HET nasional"*<br>*"Prediksi harga beras bulan depan di pasaran"* | Sintesis data internal toko + data web real-time (PIHPS, Kemendag, berita komoditas). | Internal DB + `webSearchService.ts` |
| **💼 Bisnis & Marketing** | *"Barang apa yang modalnya mandek?"*<br>*"Ide paket promo sembako akhir pekan"* | Rekomendasi bisnis berbasis data, strategi bundling, promosi bernilai jual tinggi. | `products`, `app_settings` |
| **🎨 Content Creator** | *"Buat naskah video TikTok promo minyak"*<br>*"Tulis prompt gambar poster sembako"* | Naskah video (Hook 3s, Storytelling, CTA), prompt visual detail, copywriting persuasif. | Format Markdown siap pakai |
| **📘 SOP & Support** | *"Bagaimana cara retur penjualan kasir?"*<br>*"Alur scan OCR nota tulisan tangan"* | Panduan SOP kasir langkah demi langkah yang ramah dan solutif. | `USER_MANUAL.md` |
| **💻 Codebase (BaseMind)** | *"Fungsi mana yang memvalidasi duplikasi nota?"*<br>*"Jelaskan rute API di vibe.py"* | Cuplikan kode sumber presisi, penelusuran AST, rute REST API, riwayat changelog. | BaseMind AST, `CHANGELOG.md` |

---

## 4. Alur Kerja Permintaan Otomatis (Autonomous Request Lifecycle)

```mermaid
sequenceDiagram
    autonumber
    actor User as Pengguna (Owner / Kasir / Dev / Creator)
    participant UI as Chat UI (Blonjo / Vibes)
    participant Router as Intent & Domain Classifier
    participant Harvesters as Knowledge Harvesters (DB/Web/AST/Manual)
    participant LLM as Google Gemini Engine

    User->>UI: Mengetik pesan bebas di kotak chat tunggal
    UI->>Router: POST /api/v1/insights/chat (query + JWT auth)
    
    Router->>Router: 1. Deteksi Intent (Akuntansi / Chart / Proyeksi / Web / Bisnis / Content / Codebase)
    Router->>Router: 2. Silent RBAC & Entity Resolver (Tanggal, Komoditas, Akun)
    
    alt Butuh Data Eksternal (HET / Pasar)
        Router->>Harvesters: Jalankan Web Search (PIHPS / Pasar)
    end
    
    Router->>Harvesters: 3. Ambil data internal toko (DB) atau AST kode
    Harvesters-->>Router: Konteks Faktual Gabungan (Data Toko + Web + SOP + Kode)
    
    Router->>LLM: Injeksi System Instruction + Konteks Faktual + Riwayat Chat
    LLM-->>Router: Streaming Response (Markdown Tabel + Tag Chart JSON + Naskah + Prompt)
    
    Router->>Router: 4. Validasi Anti-Halusinasi & Mathematical Check
    Router-->>UI: Render hasil (Tabel, Grafik Interaktif, Naskah) secara instan
```

---

## 5. Rencana Tahapan Eksekusi (Roadmap)

```mermaid
gantt
    title Tahapan Eksekusi: Autonomous Multi-Expert AI Assistant
    dateFormat  YYYY-MM-DD
    section Fase 1: Harvesters & Web Intelligence
    Ingest Logbook, Manuals, & SOP ke PgVector    :a1, 2026-09-02, 2d
    Integrasi Web Search HET & Komoditas Pasar    :a2, after a1, 2d
    Buat BaseMind Codebase Bridge di MCP Server    :a3, after a2, 2d
    section Fase 2: Accounting, Charts & Projections
    Engine Laporan Akuntansi PSAK (CSV/PDF)       :b1, after a3, 3d
    Integrasi Auto-Chart Engine (Bar/Line/Pie)    :b2, after b1, 2d
    Forecasting Engine (Arus Kas & Habis Stok)    :b3, after b2, 2d
    section Fase 3: Multi-Expert Orchestration
    Enhance Multi-Expert Intent Classifier        :c1, after b3, 3d
    Guardrail Naskah Kreatif, Visual, & Math      :c2, after c1, 2d
    section Fase 4: Frontend UI & E2E Verification
    Penyempurnaan Seamless Chat UI di VibesChat   :d1, after c2, 2d
    Uji Coba E2E Seluruh Domain Keahlian          :d2, after d1, 2d
```

### Modul yang Akan Dibangun / Diintegrasikan:
1. **`mcp-server/src/tools/vibeCopilot.ts`**: Menyatukan seluruh pilar (Akuntansi, Chart, Proyeksi, Web Search, Bisnis, Content, SOP, Codebase) dalam satu orkestrator terpadu.
2. **`mcp-server/src/services/webSearchService.ts`**: Menarik data HET nasional, pergerakan komoditas pangan, dan tren pasar eksternal secara dinamis.
3. **`mcp-server/src/tools/predictiveEngine.ts`**: Menghitung proyeksi arus kas, tren omset, dan perkiraan titik habis persediaan barang.
4. **`mcp-server/src/tools/codebaseEngine.ts`**: Menghubungkan MCP Server dengan `basemind` tools untuk inspeksi kodingan.
5. **`blonjo/src/pages/insights/VibesChat.tsx`**: Antarmuka interaktif yang me-render tabel akuntansi, tombol ekspor CSV/PDF, grafik chart (Bar/Line/Pie), naskah video, dan diagram Mermaid secara instan.
