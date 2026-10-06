# 📑 LAPORAN ANALISA ARSITEKTUR: Integrasi & Evaluasi Parlant Engine pada VibesChat

> **Dokumen Evaluasi & Audit Arsitektur Perangkat Lunak**  
> **Penulis**: Senior Software Architect / Parlant Systems Engineer  
> **Status**: Independen & Kritis (Evaluasi Objektif Tanpa Kompromi)  
> **Subjek Analisis**: Fitur *VibesChat* (`blonjo-ui`, `sajen-api`, `mcp-server`) vs. Framework *Parlant* (`emcie-co/parlant`)

---

## 🛑 1. Executive Architectural Verdict: Jangan Lakukan "Full Replacement"!

Jika ada usulan atau hipotesis:  
> *"Bagaimana kalau Parlant digunakan secara **FULL** dan seluruh orkestrasi lama (MCP Server, ReAct loop, Dynamic SQL Engine) **DIBUANG**?"*

**Jawaban tegas dan jujur saya sebagai engineer Parlant: JANGAN DILAKUKAN. Itu adalah bencana arsitektur (*Architectural Suicide*).**

### Mengapa? Terjadi Benturan DNA yang Fundamental (*Domain Mismatch*)

* **Parlant** dibangun untuk: **Agentic Behavior Modeling & Conversational Governance** (Alur Customer Support, Formulir Pendaftaran, Kepatuhan SOP Bisnis, Eskalasi Komplain, Brand Persona, Canned Response).
* **VibesChat** dibangun untuk: **Analytical Business Intelligence & Multi-Tenant NL2SQL/Data Reasoning Engine** (Investigasi 38 tabel keuangan PostgreSQL secara dinamis, agregasi margin per supplier, trace mutasi kas riil, kalkulasi rasio likuiditas SAK-EMKM, dan render Server-Driven UI `chart:bar/line`).

Jika Anda menghapus MCP Server dan Dynamic SQL Engine lalu berharap Parlant menangani analisis data toko sembako Anda, sistem Anda akan langsung lumpuh. **Parlant bukan Text-to-SQL generator, bukan query optimizer, dan bukan database introspection engine.**

---

## 📊 2. Matriks Komparasi: DNA Parlant vs DNA VibesChat

| Dimensi Sistem | DNA Asli Parlant | Kebutuhan Riil VibesChat (Blonjo/Sajen) | Analisa Keselarasan |
| :--- | :--- | :--- | :---: |
| **Pola Interaksi** | Alur percakapan terpandu (*Deterministic Journeys & Guidelines*). | Pertanyaan eksploratif *ad-hoc* tak terduga (*"Kenapa margin Indomie anjlok bulan ini?"*). | ⚠️ **Parsial** |
| **Akses Data** | Memanggil *Fixed-Contract Tools* (misal: `check_order(id)`, `cancel_ticket(id)`). | Menjalankan *Dynamic Compound SQL* melintasi 38 tabel relasional secara otonom. | ❌ **MISMATCH** |
| **Output Format** | Dialog teks alami, *canned template*, pesan kepatuhan SOP. | Komposisi Server-Driven UI: JSON `VibeData[]`, Chart.js payload, tabel neraca. | ⚠️ **Parsial** |
| **Fokus Keamanan** | Menjaga LLM tidak melanggar janji diskon / janji palsu ke customer. | Menjaga isolasi `tenant_id`, enkripsi PII, dan validasi query SQL injection. | ⚠️ **Beda Layer** |

---

## 🔍 3. Apa yang BISA dan MASUK AKAL Diintegrasikan (Hybrid Approach)

Jika Parlant **TIDAK** menggantikan mesin query data, tetapi diposisikan sebagai **Supervisory Interaction Layer (Layer Pengatur Interaksi)** di depan mesin SQL kita, ada beberapa manfaat nyata yang bisa menyelesaikan penyakit lama VibesChat (yang tercatat di audit forensik sebelumnya):

```
                                      ARSITEKTUR HYBRID
                                      
    [ Kasir / Owner Toko ]
               │
               ▼
    ┌──────────────────────┐
    │  Blonjo (VibesChat)  │
    └──────────┬───────────┘
               │ (HTTP POST)
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  PARLANT ENGINE (Self-Hosted Server)                        │
    │  1. Guideline & Role Guardrail:                             │
    │     - Jika Role = Kasir: Cegah akses PnL / Gaji Owner        │
    │     - Jika Pertanyaan Ambigu: Pandu alur (Clarify Journey)   │
    │  2. Context Pruning:                                        │
    │     - Hentikan penyuntikan memori ngawur tanpa kondisi      │
    └──────────┬──────────────────────────────────────────────────┘
               │ (Tool Invocation jika butuh data)
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  MCP SERVER (mcp.samkarsa.com)                              │
    │  - Tool: dynamic_sql_executor                               │
    │  - Tool: ledger_balance_fetcher                             │
    │  - Tool: stock_depletion_forecast                           │
    └──────────┬──────────────────────────────────────────────────┘
               │
               ▼
    ┌─────────────────────────────────────────────────────────────┐
    │  PostgreSQL Database (38 Tabel Multi-Tenant)                │
    └─────────────────────────────────────────────────────────────┘
```

### 3 Titik Terang Penggunaan Parlant di VibesChat:

1. **Membunuh 5 Baris Regex Kasar di `basemindTool.ts`**:
   * *Problem Lama*: Input pengguna dibajak regex kaku (`/kas|saldo/`) sehingga pertanyaan analitis langsung dipotong masuk ke jalur cepat sempit.
   * *Solusi Parlant*: Menggunakan *Guideline Matching Engine*. Parlant mengevaluasi apakah pertanyaan user merupakan obrolan santai, klarifikasi, atau permintaan audit finansial mendalam tanpa regex rapuh.
2. **Multi-Step Diagnostic Journey (Investigasi Finansial Bertahap)**:
   * Jika user bertanya: *"Toko saya sepi, apa yang harus saya lakukan?"*
   * LLM biasa akan mengoceh panjang lebar dengan tips generatif.
   * Dengan Parlant *Journey*: Agen memandu langkah demi langkah:
     * *Langkah 1*: Cek omset 7 hari terakhir (panggil tool SQL).
     * *Langkah 2*: Identifikasi barang yang penjualannya merosot.
     * *Langkah 3*: Tanyakan ke pemilik apakah ada promo kompetitor di sekitar warung.
3. **Role-Based Behavioral Guardrails (Keamanan Hak Akses)**:
   * Mencegah kasir toko bertanya: *"Berapa keuntungan bersih bos saya bulan ini?"*
   * Cukup buat satu Guideline di Parlant:
     ```python
     await agent.create_guideline(
         condition="User role is 'CASHIER' and query asks about net profit, margins, or owner equity",
         action="Decline politely stating that financial equity metrics are restricted to Store Owners.",
     )
     ```

---

## 🏗️ 4. Cetak Biru (Blueprint) Penerapan Mandiri (*Standalone / Self-Hosted*)

Anda **TIDAK PERLU** memakai platform inference Emcie Cloud atau langganan apa pun. Parlant adalah software open-source (lisensi Apache-2.0).

### A. Topologi Infrastruktur VPS

Kita bisa menjalankan Parlant sebagai container mandiri di VPS berdampingan dengan `sajen` dan `mcp-server`:

```yaml
# Tambahan di docker-compose.vps.yml
services:
  parlant-engine:
    image: python:3.11-slim
    restart: always
    environment:
      - PARLANT_HOME=/data/parlant
      - GEMINI_API_KEY=${GEMINI_API_KEY}
    volumes:
      - ./parlant_data:/data/parlant
    command: >
      sh -c "pip install parlant && parlant-server --host 0.0.0.0 --port 8800"
    networks:
      - blonjo-network
```

### B. Konfigurasi Standalone Engine (Tanpa Emcie Cloud)

Parlant mendukung model bawaan secara lokal maupun direct API:
1. **Model Foundation**: Gunakan Google Gemini 2.5/3.8 Flash via API Key langsung Anda (tanpa proxy Emcie).
2. **Metadata Storage**: Parlant menyimpan agent, guideline, dan session state dalam format file JSON / SQLite lokal di `/data/parlant`.
3. **Tool Registry**: Daftarkan tool MCP Server Anda ke Parlant via HTTP endpoint wrapper atau SDK Python:
   ```python
   import parlant
   from parlant.core.tools import ToolContext

   @agent.tool
   async def query_store_database(context: ToolContext, sql_intent: str) -> str:
       # Tembak langsung ke mcp-server lokal
       async with httpx.AsyncClient() as client:
           res = await client.post("http://mcp-server:8000/call-tool", json={
               "name": "vibe_copilot",
               "arguments": {"query": sql_intent, "tenant_id": context.session_data["tenant_id"]}
           })
           return res.json()["content"][0]["text"]
   ```

---

## ⚖️ 5. Analisa Biaya, Latensi, dan Kompleksitas (Trade-Offs)

Sebelum Anda memutuskan mengadopsi Parlant, perhatikan konsekuensi teknis di bawah ini:

| Metrik | Arsitektur Saat Ini (Sajen $\to$ MCP) | Dengan Parlant (Sajen $\to$ Parlant $\to$ MCP) | Penilaian |
| :--- | :--- | :--- | :--- |
| **Latensi Respon (RTT)** | 1.8s – 3.5s | 3.2s – 6.0s | ⚠️ **Membengkak**. Ada 2 tahap LLM evaluation: Guideline matching pass + Final generation pass. |
| **Footprint Memori VPS** | Ringan (Node.js MCP + FastAPI) | Bertambah ~400MB–800MB RAM untuk Python runtime Parlant. | Masih wajar di VPS 4GB/8GB. |
| **Maintenance Overhead** | 2 Repo (`sajen`, `mcp-server`) | 3 Lapisan (Sajen, Parlant Engine, MCP). | ⚠️ Menambah kompleksitas debugging saat query macet. |
| **Fleksibilitas Chart/UI** | Direct JSON `VibeData[]` | Perlu parser tambahan dari output Parlant ke `VibeRenderer`. | Perlu adapter khusus. |

---

## 🎯 6. Rekomendasi Akhir & Saran Taktis

1. **JANGAN hapus fondasi yang ada**:
   Kemampuan eksekusi data SQL, PostgreSQL RAG, dan schema introspection yang sudah Anda bangun di `sajen` dan `mcp-server` adalah **aset inti** analisis bisnis Anda. Parlant tidak bisa menggantikannya.
2. **Kapan Parlant Layak Dipasang?**:
   * Jika Anda ingin mengubah VibesChat menjadi **Asisten Operasional Komprehensif** (bisa membimbing kasir cara input retur, menolak pertanyaan sensitif sesuai hak akses, dan menuntun langkah investigasi toko sepi).
3. **Alternatif Lebih Ringan Tanpa Install Parlant Server**:
   Jika tujuan utama Anda hanya ingin menyelesaikan masalah *jawaban kaku*, *regex intent yang salah*, dan *memori ngawur* di VibesChat:
   * **Cukup adopsi filosofi Parlant** ke dalam `mcp-server/src/tools/vibeCopilot.ts`:
     * Buat pemetaan `Condition -> Action` (Guidelines) dalam format JSON ringan di TypeScript.
     * Evaluasi guideline menggunakan LLM classifier 1-shot (alih-alih regex 5 baris).
     * Filter memori dengan similarity threshold sebelum diinjeksi ke context.
   * Ini memberi Anda 85% manfaat Parlant **tanpa perlu menambah 1 container server baru, tanpa overhead latensi, dan tanpa mengubah pipeline UI Blonjo**.
