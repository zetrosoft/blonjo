# 📋 Daftar Rencana Kerja (TODO): Autonomous Multi-Agent Intelligence Platform
### *Rencana Implementasi: Agentic AI Adaptation (Cheap, Lightweight & Efficient), Tepat, Cermat, Cepat, Sumber Adopsi, Penyelarasan is_maintenance_stock & Studio Omnichannel*

Dokumen ini mendokumentasikan rincian tugas teknis atomik beserta **sumber adopsi pola kerja open-source kelas dunia**, **paradigma Agentic AI Adaptation (Zetrosoft / Bijak Techno)**, **penyelarasan aturan bisnis `is_maintenance_stock`**, dan **metodologi marketing konversi nyata** untuk membangun **Autonomous Multi-Agent Intelligence Platform** secara terstruktur, teruji, dan siap produksi.

---

## ⚡ Paradigma Agentic AI Adaptation (Cheap, Lightweight & Efficient)

1. **"Training/Optimizing Tools Beats Training Agents"**: Model Google Gemini dibiarkan sebagai *Frozen Planner*, sementara logika komputasi data, validasi rumus, dan penelusuran AST dijalankan oleh *Specialized Lightweight Tools* lokal untuk menghemat token hingga 80% dan memangkas latensi.
2. **Execution Feedback Loop (A1 Paradigm)**: Perkakas mengembalikan sinyal status eksekusi; jika terjadi anomali (misal: data kosong), sistem secara otonom melakukan *auto-repair* sebelum merespon pengguna.
3. **Supervised Tool Adaptation (T2 Paradigm)**: Pembelajaran umpan balik (*Continuous Learning*) melalui penyaringan aturan ringkas (*Distilled Rules*) ke tabel `supplier_parsing_rules` dan `vibes_memory`.

---

## ⚙️ Prinsip Penyelarasan Fitur `is_maintenance_stock` (Wajib Dipatuhi)

1. **Saat `is_maintenance_stock = false` (Mode Pencatatan Omset Lumsum / Kasir Cepat)**:
   - Larangan keras mengarang angka sisa kuantitas stok fisik fiktif.
   - Nalar dialihkan ke **frekuensi & volume kulakan belanja modal ke supplier** (`inventory_logs` log_type='in' / transaksi `PURCHASE`) serta perputaran kas.
2. **Saat `is_maintenance_stock = true` (Mode Manajemen Stok Fisik Penuh)**:
   - Pembacaan kuantitas fisik riil `products.current_stock`, perhitungan titik habis barang (*stockout prediction*), dan evaluasi modal mati (*dead stock*).

---

## 📦 Paket 1: Lapisan Data Terdistribusi & Engine Eksekusi Paralel (Lightweight Tools)

- [ ] **Tugas 1.1: BaseMind Codebase AST Engine Bridge (`mcp-server/src/tools/codebaseEngine.ts`)**
  * **Sumber Adopsi**: 
    - 🔗 [vitali87/code-graph-rag](https://github.com/vitali87/code-graph-rag) & 🔗 [deusdata/codebase-memory-mcp](https://github.com/deusdata/codebase-memory-mcp)
  * **Deskripsi**: Mengintegrasikan CLI/RPC BaseMind untuk mengekstrak AST *tree-sitter*, daftar simbol (`code.symbols`), outline berkas (`code.outline`), dan rantai pemanggilan dependensi (`code.callers`).

- [ ] **Tugas 1.2: Vektor Ingestion Logbook & SOP Kasir (`mcp-server/src/services/logbookIngestionService.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [langgenius/dify](https://github.com/langgenius/dify) & 🔗 [khoj-ai/khoj](https://github.com/khoj-ai/khoj)
  * **Deskripsi**: Mengindeks 95+ artikel dokumentasi di `~/kerjaan/logbook/src/content/posts/id/*.md` dan `USER_MANUAL.md` ke dalam basis data vektor.

- [ ] **Tugas 1.3: Asynchronous Web Market & HET Streamer (`mcp-server/src/services/webMarketService.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [OpenBB-finance/OpenBB](https://github.com/OpenBB-finance/OpenBB) & Portal PIHPS / Kemendag RI.
  * **Deskripsi**: Membangun modul penarik data harga pangan nasional dan acuan regulasi HET resmi dengan caching cerdas 12–24 jam.

- [ ] **Tugas 1.4: Parallel Query Execution Pool (`mcp-server/src/services/parallelDataPool.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [block/goose](https://github.com/block/goose) *(Asynchronous multi-tool concurrent execution model)*
  * **Deskripsi**: Mengorkestrasi pengambilan data paralel non-blocking antara kueri PostgreSQL toko (memperhatikan flag `is_maintenance_stock`), data pasar eksternal, indeks BaseMind, dan vektor dokumen.

---

## 📦 Paket 2: Kernel Nalar Adaptif & Guardrail Integritas (A1/T2 Feedback Loop)

- [ ] **Tugas 2.1: Multi-Dimensional Semantic Intent Resolver (`mcp-server/src/tools/intentClassifier.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [joaomdmoura/crewai](https://github.com/joaomdmoura/crewai)
  * **Deskripsi**: Klasifikasi intens sub-detik untuk membedakan kebutuhan analitik finansial, riset pasar, ritel, pemasaran, materi kreatif, dan kodingan + otorisasi *Silent JWT RBAC*.

- [ ] **Tugas 2.2: Fluid Multi-Agent Orchestrator (`mcp-server/src/tools/vibeCopilot.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [joaomdmoura/crewai](https://github.com/joaomdmoura/crewai) & 🔗 [All-Hands-AI/OpenHands](https://github.com/All-Hands-AI/OpenHands)
  * **Deskripsi**: Menyusun engine nalar kolaboratif lintas agen spesialis untuk merespon situasi bisnis kompleks secara simultan dengan adaptasi otomatis terhadap flag `is_maintenance_stock`.

- [ ] **Tugas 2.3: Strict Mathematical & Balance Sheet Guardrail (`mcp-server/src/utils/responseValidator.ts`)**
  * **Sumber Adopsi**:
    - Standar Akuntansi Keuangan Entitas Mikro, Kecil, dan Menengah (**SAK EMKM / PSAK**)
    - Deterministik formula verification $(Aset = Kewajiban + Ekuitas)$ & $(Qty \times Price) - Diskon = Subtotal$.
  * **Deskripsi**: Validator otomatis untuk menjamin akurasi mutlak angka finansial dan mencegah halusinasi data.

---

## 📦 Paket 3: Engine Finansial PSAK & Visualisasi Grafik Interaktif

- [ ] **Tugas 3.1: Generator Laporan Akuntansi Standar PSAK EMKM (`mcp-server/src/tools/financialEngine.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [Canner/WrenAI](https://github.com/Canner/WrenAI) *(Generative Business Intelligence)*
  * **Deskripsi**: Otomasi penyusunan Laba Rugi, Neraca, Arus Kas, dan Neraca Saldo (*Trial Balance*) berbasis data riil PostgreSQL + ekspor CSV/Excel & Cetak PDF.

- [ ] **Tugas 3.2: Interactive Visual Chart & Diagram Generator (`mcp-server/src/tools/chartGenerator.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [Canner/WrenAI](https://github.com/Canner/WrenAI) & Recharts/Mermaid.js integration.
  * **Deskripsi**: Otomasi penanaman tag grafik interaktif (`chart:bar`, `chart:line`, `chart:pie`) dan diagram alir `mermaid`.

- [ ] **Tugas 3.3: Forecasting Likuiditas & Analisis Restock Dinamis (`mcp-server/src/tools/predictiveEngine.ts`)**
  * **Sumber Adopsi**:
    - 🔗 [mindsdb/mindsdb](https://github.com/mindsdb/mindsdb) *(Predictive SQL time-series)*
  * **Deskripsi**: Proyeksi ketahanan kas 30–90 hari ke depan dan analisis restock: fisik aktual (jika `is_maintenance_stock = true`) atau perputaran frekuensi kulakan belanja (jika `is_maintenance_stock = false`).

---

## 📦 Paket 4: Studio Kreatif Omnichannel (Video, Visual, Blog, Review, Katalog)

- [ ] **Tugas 4.1: Generator Naskah Video & Copywriting Multi-Kanal (AIDA & PAS)** (`mcp-server/src/tools/creativeStudio.ts`)
  * **Deskripsi**: Penulisan naskah video pendek (Reels/TikTok) ber-hook 0–3 detik berbasis kerangka kerja AIDA & copywriting siaran WhatsApp pelanggan berbasis PAS.

- [ ] **Tugas 4.2: Hyper-Detailed Visual Prompt Engineering (`mcp-server/src/tools/creativeStudio.ts`)**
  * **Deskripsi**: Parameter prompt visual sinematik detail (*lighting, lens, mood*) untuk poster promosi toko.

- [ ] **Tugas 4.3: Engine Penerbitan Artikel Blog Edukatif & Ulasan Produk (`mcp-server/src/tools/creativeStudio.ts`)**
  * **Deskripsi**: Menghasilkan artikel blog edukatif ramah SEO dan ulasan perbandingan produk ritel yang objektif, bernilai jual, dan persuasif tanpa buzzword.

- [ ] **Tugas 4.4: Generator Lembar Katalog Digital & Daftar Harga (`mcp-server/src/tools/creativeStudio.ts`)**
  * **Deskripsi**: Otomasi penyusunan lembar katalog harga sembako mingguan/bulanan dari master data produk toko yang siap dibagikan ke WhatsApp pelanggan atau dicetak.

- [ ] **Tugas 4.5: Engine Strategi Ritel Gerilya & Price Anchoring (`mcp-server/src/tools/retailAdvisor.ts`)**
  * **Deskripsi**: Skema bundling cerdas dengan penetapan harga psikologis (*Price Anchoring / Decoy Effect*) dan rekomendasi kartu negosiasi taktis distributor.

---

## 📦 Paket 5: Antarmuka Percakapan Tunggal & Verifikasi Produksi

- [ ] **Tugas 5.1: Penyempurnaan Antarmuka Tunggal Seamless (`blonjo/src/pages/insights/VibesChat.tsx`)**
  * **Sumber Adopsi**:
    - 🔗 [cline/cline](https://github.com/cline/cline) & [langgenius/dify](https://github.com/langgenius/dify)
  * **Deskripsi**: Streaming respon cepat, render tabel ekspor, format artikel blog, ulasan produk, katalog harga, grafik Recharts, diagram Mermaid, dan indikator aktivitas BaseMind.

- [ ] **Tugas 5.2: Pengujian Integrasi End-to-End (E2E) & Verifikasi VPS**
  * **Deskripsi**: Pengujian seluruh domain skenario intens dengan variasi `is_maintenance_stock = true/false`, serta build/deploy service produksi terverifikasi (`sajen-api`, `sajen-worker`, `blonjo-ui`).
