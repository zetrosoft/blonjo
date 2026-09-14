# Dokumen Analisa: Korelasi Changelog, Codebase, dan Rencana Integrasi Tools AGY pada Vibes Chat

Dokumen ini mendokumentasikan hasil audit forensik mendalam dengan temperatur 0.2 terhadap sistem **Vibes Chat (Sajen Intelligence)**. Dokumen ini membandingkan riwayat perencanaan di logbook changelog, kondisi implementasi teknis aktual di codebase, penyebab rusaknya kualitas jawaban AI, inventaris kode warisan (*dead code*) yang harus dibersihkan, serta integrasi resmi tools/skills platform AGY.

---

## 1. Bukti Changelog & Linimasa Degradasi Arsitektur

Berdasarkan pemeriksaan riwayat di repositori dokumentasi `~/kerjaan/logbook/src/content/posts/id/`, arsitektur cerdas dan adaptif ini **sudah pernah diplanningkan secara komprehensif**. Namun, terjadi degradasi (*architectural drift*) saat implementasi teknis demi mengejar optimasi latensi dan token secara terburu-buru.

| Versi Logbook | Tanggal | Apa yang Diplanningkan | Realita Implementasi di Codebase Saat Ini |
| :--- | :--- | :--- | :--- |
| **`mcp-v1-0-0-019`** | 08 Sep 2026 | **Compound ReAct Autonomous Agent (Level 4)**: AI merumuskan dynamic SQL mandiri, multi-step queries, dan zero-hallucination grounding dari PostgreSQL riil. | ReAct Engine ditulis di `reactEngine.ts`, namun **sering tidak dieksekusi** karena dipotong jalur pintas (*fast-path*) atau terhenti prematur. |
| **`mcp-v1-0-0-024`** | 08 Sep 2026 | **Smart Early Stop**: Menghentikan iterasi ReAct begitu data esensial didapat agar latensi turun dari 19.5s ke ~5s. | Logika `break` dipicu begitu query SQL mengembalikan baris apa pun (bahkan agregat tipis), memotong ReAct sebelum sempat menarik mutasi transaksi item-level. |
| **`mcp-v1-0-0-026`** | 09 Sep 2026 | **Basemind Local Semantic Router & Fast-Path Zero-Token**: Menggantikan LLM router eksternal dengan classifier lokal agar hemat token. | Alih-alih classifier semantik cerdas, implementasi di `basemindTool.ts` terdegradasi menjadi **5 baris Regex kaku**. Jika cocok regex (misal: "kas", "saldo", "aturan"), ReAct dimatikan total, hanya menyajikan ringkasan 5 saldo statis. |
| **`mcp-v1-0-0-028`** | 12 Sep 2026 | **Zero-Loss Data Grounding & Natural Persona**: Serialisasi Compact Pipe Table dan relaksasi format output agar tidak kaku. | Format tabel padat berhasil diterapkan, tetapi karena data yang masuk dari hulu (*upstream*) terlanjur dipotong oleh Fast-Path & Early-Stop, AI tetap kelaparan data transaksi riil. |

---

## 2. Forensik Akar Masalah: Mengapa Output Vibes Chat Rusak? (What, Why, How)

### A. Miskin Data (*Data-Starved*) & Memicu Halusinasi
- **Gejala (What)**: Tanggapan AI sering kali mengatakan tidak ada data, atau mengarang nama produk dan angka penjualan fiktif.
- **Penyebab (Why)**: Regex di `BasemindToolService.classifyIntentLocally` mendeteksi kata kunci seperti *"kas"*, *"saldo"*, atau *"keuangan"*, lalu langsung menetapkan `fast_path: 'LEDGER_BALANCES'`.
- **Mekanisme Kerusakan (How)**:
  Di `vibeCopilot.ts`:
  ```typescript
  if (localRoute.fast_path === 'LEDGER_BALANCES') {
    const balancesRes = await getLedgerBalancesTool(tenantId);
    // Hanya mengambil 5 angka total saldo akun (Kas, Bank, Piutang, Utang, Persediaan)
    factualSynthesisContext = BasemindToolService.serializeToCompactTable(balancesRes.data);
  }
  
  // ReAct loop DIMATIKAN TOTAL jika factualSynthesisContext sudah terisi:
  if (!factualSynthesisContext) {
    const reactResult = await runReActReasoningLoop(...);
  }
  ```
  AI sama sekali tidak menerima data mutasi harian, nama kontak/supplier, rincian barang, ataupun histori nota. Ketika pengguna bertanya hal spesifik (misalnya: *"minggu ini kas keluar buat beli apa saja?"*), LLM tidak memiliki data faktual untuk menjawab, sehingga terjadi halusinasi.

### B. Pola Jawaban Sangat Kaku & Monoton (*Templating*)
- **Gejala (What)**: Komposisi jawaban selalu memiliki struktur yang seragam, dan selalu menyelipkan nasihat tentang batas utang supplier serta kulakan beras.
- **Penyebab (Why)**: Fungsi `retrieveMemories` di `memoryService.ts` sama sekali mengabaikan isi query pengguna:
  ```typescript
  export async function retrieveMemories(tenantId: string | number, queryText?: string, limit: number = 4) {
    const res = await pool.query(
      `SELECT id, tenant_id, memory_type, content, importance_score 
       FROM vibes_memory 
       WHERE tenant_id = $1 
       ORDER BY importance_score DESC, id DESC 
       LIMIT $2`,
      [tenantId, limit]
    );
    return res.rows;
  }
  ```
- **Mekanisme Kerusakan (How)**:
  Tabel `vibes_memory` di database menyimpan catatan kebijakan toko: *"Batas utang supplier maksimal 50%"* dan *"SOP Kulakan beras minimal margin 8%"*. Karena tidak ada filter semantik, **keempat baris ini disuntikkan ke SETIAP sesi chat**, apapun topiknya (bahkan saat bertanya saldo kasir atau stok sabun). LLM dipaksa membaca preferensi ini di System Prompt dan selalu memuntahkan nasihat yang sama berulang-ulang.

### C. Ketidaksesuaian dengan Intensi Pengguna (*Lack of Intent Relevance*)
- **Gejala (What)**: Pertanyaan bisnis yang dinamis dijawab dengan definisi teoritis atau data yang tidak diminta.
- **Penyebab (Why)**: Klasifikasi intensi hanya mengandalkan pola regex primitif yang tidak mampu menangkap nuansa bahasa percakapan sehari-hari pemilik toko di Indonesia.
- **Mekanisme Kerusakan (How)**:
  Kalimat seperti *"gimana perputaran uang dan kulakan minggu ini?"* secara keliru diklasifikasikan ke rute sempit, melewatkan eksplorasi data yang dibutuhkan untuk analisis perputaran kas.

---

## 3. Inventaris Pembersihan Kode Warisan (Dead / Legacy Code)

Pembersihan menyeluruh wajib dilakukan terhadap file-file yatim piatu (*orphan*) dan sisa arsitektur lama agar pipeline Vibes Chat menjadi ramping, mudah diuji, dan deterministik:

| File yang Akan Dibersihkan | Kategori | Alasan & Dampak Pembersihan |
| :--- | :--- | :--- |
| `mcp-server/src/tools/vibeOrchestrator.ts` | **Legacy Code** | Berisi prompt monolitik lama dari era Agustus 2026 sebelum ReAct. Masih tersisa impor di `index.ts` pada endpoint usang `parse_accounting_intent` dan `vibe_orchestrate`. Dibersihkan dan digantikan handler tunggal terstandarisasi. |
| `mcp-server/src/tools/intentClassifier.ts` | **Dead Code (Orphan)** | File sebesar 11 KB berisi 9-role router yang tidak pernah diimpor oleh modul manapun. Menimbulkan kebingungan pemeliharaan kode. Dihapus permanen. |
| `mcp-server/src/services/supervisoryRouter.ts` | **Dead Code (Orphan)** | Router eksperimental yang tidak terhubung ke `vibeCopilot.ts` maupun `index.ts`. Dihapus permanen. |
| `mcp-server/src/tools/predictiveEngine.ts` | **Dead Code (Orphan)** | Sisa kode eksperimental prediksi stok lama tanpa pemanggil aktif. Dihapus permanen. |
| `mcp-server/src/tools/dataGraph.ts` | **Dead Code (Orphan)** | Sisa kode knowledge graph lokal yang tidak terintegrasi. Dihapus permanen. |

### Jaminan Keamanan Fitur Non-Vibes (Core Protection)
Pembersihan ini **100% terlokalisir** pada modul Vibes Chat. Modul-modul operasional berikut **TIDAK AKAN DISENTUH SAMA SEKALI**:
- Core POS & Kasir Kas/Bank
- Modul Akuntansi: Jurnal Otomatis, Buku Besar, Neraca Saldo, Laba Rugi
- Master Data & Pricing Rules Multi-Item
- Modul OCR Faktur (`ocrTool.ts`)
- Smart Transaction Parser (`transactionParser.ts`)
- UOM Multiplier & Konversi Satuan

---

## 4. Integrasi Resmi Tools & Skills Platform AGY ke dalam Arsitektur

Tools dan skills platform AGY yang sebelumnya belum diintegrasikan ke dalam rancangan kini dijadikan pilar utama dalam alur eksekusi Vibes Chat:

```
                  ┌─────────────────────────────────────────────────────────┐
                  │                 USER PROMPT / QUERY                     │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                      [Skill: systematic-debugging]
                      Validasi input schema & multi-turn history
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │         1. BASEMIND HYBRID INTENT ROUTER                │
                  │   Semantic vector matching + context-aware parser       │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                         Membutuhkan data multi-tabel / analitik
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │      2. AUTONOMOUS ReAct ENGINE (Full Depth)            │
                  │   Iterasi 1: Query Transaksi & Mutasi Buku Besar        │
                  │   Iterasi 2: Cross-check Stok, Kontak, & Log Barang     │
                  │                                                         │
                  │   [Skill: database & sql-optimization-patterns]         │
                  │   Panduan JOIN presisi (transactions + inventory_logs   │
                  │   + contacts + accounts) tanpa pemotongan data baris.   │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │     3. CONTEXT HARVESTER (Targeted & Dynamic)           │
                  │   - vibes_memory: HANYA yang cocok semantik query       │
                  │   - app_settings: parameter margin & stok riil          │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │   4. SYNTHESIS ENGINE (LLM Business Advisor)            │
                  │                                                         │
                  │   [Skill: data-storytelling]                            │
                  │   Merangkai angka faktual menjadi narasi bisnis yang    │
                  │   mengalir, taktis, natural, dan bebas template kaku.   │
                  └───────────────────────────┬─────────────────────────────┘
                                              │
                      [Skill: vibe-code-auditor & Basemind MCP]
                      Verifikasi linting, sanitasi output, & AST safety
                                              │
                                              ▼
                  ┌─────────────────────────────────────────────────────────┐
                  │              JAWABAN AKHIR CERDAS & AKTUAL              │
                  └─────────────────────────────────────────────────────────┘
```

1. **`systematic-debugging`**:
   - Memastikan tidak ada data yang hilang dalam pertukaran pesan antara `blonjo` (React), `sajen-api` (FastAPI), dan `mcp-server` (Node.js/Express).
   - Menyediakan logging terstruktur pada setiap tahapan (Route, Tool Exec, Synthesis).

2. **`database` & `sql-optimization-patterns`**:
   - Menghapus query SQL parsial/dangkal.
   - Menstandarisasi query SQL ReAct untuk menggunakan relasi eksplisit:
     `transactions` $\rightarrow$ `inventory_logs` $\rightarrow$ `products` $\rightarrow$ `contacts`.
   - Menggunakan indeks PostgreSQL (`idx_transactions_date_tenant`, `idx_inventory_logs_tenant_product`) untuk menjamin kecepatan query tetap di bawah 50ms.

3. **`data-storytelling`**:
   - Menggantikan aturan prompt kaku ("harus ada poin 1, 2, 3") dengan pendekatan naratif bisnis.
   - AI berperan sebagai Financial & Operational Advisor: menyajikan angka kunci, menjelaskan dinamika penyebabnya, dan memberikan kesimpulan/rekomendasi taktis secara mengalir.

4. **`vibe-code-auditor`**:
   - Memeriksa kebersihan penanganan Promise, async/await, dan manajemen koneksi pool PostgreSQL agar tidak terjadi kebocoran koneksi (*pool exhaustion*).

5. **`Basemind Code Intel MCP Tools` (`code.symbols`, `graph.*`)**:
   - Memvalidasi seluruh simbol dan dependensi sebelum dan sesudah refactoring untuk memastikan nol regresi teknis.

---

## 5. Rencana Aksi Eksekusi Bertahap (Action Plan)

Setelah konfirmasi disetujui, eksekusi akan dilakukan secara terukur dalam 5 langkah:

1. **Langkah 1: Pembersihan Dead Code & Refactor Index**:
   - Hapus `intentClassifier.ts`, `supervisoryRouter.ts`, `predictiveEngine.ts`, dan `dataGraph.ts`.
   - Bersihkan impor yang tidak terpakai pada `mcp-server/src/index.ts`.
2. **Langkah 2: Rekonstruksi Semantic Memory Harvester (`memoryService.ts`)**:
   - Pasang filter pencarian teks/semantik pada `retrieveMemories` agar hanya memori yang relevan dengan pertanyaan yang ditarik.
3. **Langkah 3: Perombakan Fast-Path & ReAct Engine (`basemindTool.ts` & `reactEngine.ts`)**:
   - Cabut bypass Fast-Path pada pertanyaan keuangan dan transaksi agar ReAct loop selalu berjalan secara otonom.
   - Perbaiki *Smart Early Stop* agar tidak memotong iterasi sebelum data detail transaksional terkumpul.
4. **Langkah 4: Redesain Prompt & Penerapan Data Storytelling (`vibeCopilot.ts`)**:
   - Terapkan instruksi naratif bisnis yang alami, percaya diri, tanpa template klise, dan 100% terikat pada fakta database riil.
5. **Langkah 5: Verifikasi, Build & Deploy**:
   - Uji simulasi query riil secara lokal.
   - Jalankan `pnpm run build` di `mcp-server`.
   - Deploy terarah ke VPS: `./deploy.sh mcp-backend`.
   - Dokumentasikan pembaruan di `~/kerjaan/logbook` dan deploy logbook.
