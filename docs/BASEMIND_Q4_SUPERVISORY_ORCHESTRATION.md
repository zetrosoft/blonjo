# 🧠 Supervisory Multi-Agent Cognitive Architecture: BaseMind Q4 Enterprise Standard

## 🌟 1. Prinsip Utama (The Core Doctrine)
Kunci utama dari kualitas, presisi, dan akurasi intent pada arsitektur AI bukan terletak pada bagaimana sistem terhubung (API), melainkan pada **bagaimana konteks dibatasi dan difilter secara deterministik sebelum masuk ke LLM**.

Sistem menerapkan arsitektur **Supervisory Multi-Agent Orchestration**:
1. **Supervisory Agent (Router)**: Tidak bertugas menjawab pertanyaan. Tugas tunggalnya adalah mengekstraksi *intent*, entitas, dan mendelegasikan tugas ke Domain Worker yang tepat dalam format JSON murni.
2. **Precision Micro-Context (<350 tokens)**: Setiap domain worker hanya menerima skema, parameter, dan data yang 100% relevan dengan tugasnya (isolasi domain total).
3. **Deterministic Tool Execution**: AI tidak pernah melakukan kalkulasi/aritmatika. Perhitungan formula, saldo buku besar, dan agregasi data murni dieksekusi oleh backend (PostgreSQL / Python), lalu AI menyusunnya menjadi bahasa natural.
4. **Persistent System Memory**: Mandat *direct-to-point*, format tabel Markdown, dan aturan scannable ditanamkan pada lapisan memori statis server (`system_instruction`).

---

## 🏗️ 2. Diagram Alur Orkestrasi Multi-Agent

```mermaid
flowchart TD
    UserQuery["Query Pengguna (Bebas / Multi-Topik)"] --> Supervisor["1. SUPERVISORY AGENT (Intent & Entity Extractor)"]
    
    subgraph SupervisorOutput ["Format JSON Routing Deterministik"]
        JSON["{ domain: 'FINANCE_LEDGER', sub_intent: 'CASH_BALANCE', entities: ['kas', 'bank'], confidence: 0.98 }"]
    end

    Supervisor --> SupervisorOutput

    subgraph DomainWorkers ["2. SPECIALIZED DOMAIN WORKERS (Precision Micro-Context <350 Tokens)"]
        FinanceWorker["A. Finance & Ledger Worker (Hanya Context Akun Kas/Bank & Rumus PSAK)"]
        POSWorker["B. Inventory & POS Worker (Hanya Context Tabel contacts & master_items)"]
        SOPWorker["C. SOP & Knowledge Worker (Hanya Micro-Chunks knowledge_vectors)"]
        TechWorker["D. BaseMind Technical Worker (Hanya AST Symbols & Route Map)"]
        MarketWorker["E. Market Intelligence Worker (Hanya Tren Komoditas Pasar Luar)"]
    end

    SupervisorOutput -->|Route to Worker| FinanceWorker
    SupervisorOutput -->|Route to Worker| POSWorker
    SupervisorOutput -->|Route to Worker| SOPWorker
    SupervisorOutput -->|Route to Worker| TechWorker
    SupervisorOutput -->|Route to Worker| MarketWorker

    subgraph BackendEngine ["3. DETERMINISTIC EXECUTION (PostgreSQL blonjo_db)"]
        LedgerCalc["Kalkulasi Akumulasi Jurnal (COALESCE(SUM(debit - credit), 0))"]
        SQLAgg["Agregasi SQL Transaksi POSTED"]
    end

    FinanceWorker --> LedgerCalc
    POSWorker --> SQLAgg

    subgraph SynthesizerLayer ["4. FINAL SYNTHESIZER & OBSERVABILITY"]
        Synthesizer["Scannable Markdown Assembler + Prompt Inspector (< />)"]
    end

    FinanceWorker --> Synthesizer
    POSWorker --> Synthesizer
    SOPWorker --> Synthesizer
    TechWorker --> Synthesizer
    MarketWorker --> Synthesizer

    Synthesizer --> FinalUI["Output Bersih, Direct-to-Point, Akurat 100% (<1 Detik)"]
```

---

## 🎯 3. Spesifikasi Teknis Modul

### 1. Supervisory Agent (`supervisoryRouter.ts`)
- **Tugas**: Ekstraksi intent tanpa menjawab query.
- **Skema Output JSON**:
```json
{
  "domain": "FINANCE_LEDGER" | "INVENTORY_POS" | "SOP_KNOWLEDGE" | "TECHNICAL_AST" | "MARKET_INTEL",
  "sub_intent": "CASH_BALANCE_INQUIRY",
  "entities": {
    "account_codes": ["1-1101", "1-1102"],
    "date_range": { "start": "2026-09-05", "end": "2026-09-05" },
    "item_keywords": []
  },
  "confidence": 0.98
}
```

### 2. Domain Workers & Precision Micro-Context
- **Finance Worker**: Injeksi saldo akun kas/bank, utang, piutang, dan net cash flow periodik.
- **Inventory & POS Worker**: Injeksi master item, supplier, dan kuantitas stok tanpa menyertakan aturan suara atau kodingan.
- **SOP & Knowledge Worker**: Mengambil top 2-3 chunk dokumen dari `knowledge_vectors` (pgvector).
- **Technical Worker**: Mengambil simbol AST dari BaseMind Engine.
- **Market Worker**: Mengambil data komoditas pasar luar terkurasi.

### 3. Synthesizer & Observability
- Menyatukan data mentah menjadi jawaban scannable berstandar tinggi:
  - Baris pertama: Langsung data inti / nominal tebal.
  - Baris kedua: Tabel Markdown dengan perataan kolom presisi.
  - Bagian akhir: `<!-- ACTIONS -->` dan `<!-- SUGGESTIONS -->`.
- Menampilkan modal diagnostik `< /> Inspect Prompt` untuk transparansi penuh.

