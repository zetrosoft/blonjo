# 📘 LAPORAN ANALISA LENGKAP & MASTER PLANNING: VIBESCHAT INTELLIGENCE V2
> **Dokumen Spesifikasi Teknis, Audit Forensik, dan Kontrak Implementasi Anti-Regresi**  
> **Target Sistem**: `blonjo-ui`, `sajen-api`, dan `mcp-server`  
> **Status**: Siap Konfirmasi & Eksekusi Bertahap

---

## 📑 BAGIAN 1: LAPORAN ANALISA FORENSIK LENGKAP

### 1.1 Akar Masalah: Mengapa Implementasi Selalu Kaku & Meleset dari Rancangan?
Berdasarkan investigasi menyeluruh pada riwayat logbook (v1.0.0-032 s/d v1.0.0-034), kode sumber aktual di `mcp-server`, dan audit data riil pada sesi percakapan #39 di PostgreSQL `blonjo_db`, ditemukan 5 penyakit kronis:

1. **Phantom Architecture (Kesenjangan Rancangan vs Kode Nyata)**:
   - Di logbook masa lalu diklaim telah dibuat modul modular (`intentClassifier.ts`, `predictiveEngine.ts`, dll).
   - **Realita**: Modul tersebut tidak pernah dibuat; developer sebelumnya menumpuk seluruh logika ke dalam satu file monolitik [`vibeCopilot.ts`](file:///Users/user/kerjaan/mcp-server/src/tools/vibeCopilot.ts) (389 baris) yang sulit di-maintain.
2. **Kamus Alias & `pg_trgm` Terisolasi (Single-Item Trap)**:
   - Fitur pencarian fuzzy dan `ocr_alias_mappings` di [`dynamicTools.ts`](file:///Users/user/kerjaan/mcp-server/src/tools/dynamicTools.ts) hanya menerima 1 keyword tunggal (`LIMIT 1`).
   - Ketika pengguna memasukkan daftar belanja multi-item, ReAct Engine beralih ke SQL ad-hoc mentah (`ILIKE %Sgtg Biru%`) yang mengabaikan kamus alias dan pg_trgm similarity. Akibatnya, barang-barang yang sebenarnya ADA di database (`ID 60: SGTG BIRU TRANSP 1KG`, `ID 534: LENCANA MERAH DUS`, `ID 579: BERAS MEDIUM C4 EMI`) dilaporkan "tidak ditemukan".
3. **Negation Bias & Overfitting pada Contoh**:
   - Prompt dijejali puluhan instruksi defensif *"DILARANG X, DILARANG Y"*. Model (Gemini) mengalami *Negation Attention Trap*, menghasilkan respon kaku, hambar, dan defensif.
4. **Trigger Chart Mati untuk Maksud Tersirat**:
   - Visualisasi grafik hanya aktif jika ada regex harfiah `/grafik|chart/i`. Ketika user meminta perbandingan atau rencana belanja komprehensif, chart tidak pernah keluar.
5. **Ketiadaan Jembatan Tindakan (Actionable CRUD Foundation)**:
   - AI hanya bertindak sebagai komentator pasif yang membaca data, bukan sebagai asisten operasional yang menyiapkan draf mutasi data (*Draft-First Mutation*).

---

## 🏛️ BAGIAN 2: MASTER PLANNING & KONTRAK IMPLEMENTASI TEKNIS

Untuk memastikan kodingan tidak meleset lagi, implementasi dibagi menjadi **4 Fase yang Terukur, Memiliki Script Validasi Mandiri, dan Mengunci Kontrak Kode**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                          ARSITEKTUR VIBESCHAT V2                       │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Multi-Item Entity Resolver (pg_trgm + ocr_alias_mappings)            │
│    -> Menormalkan ketikan cepat kasir ke Nama Resmi Produk di Database │
├────────────────────────────────────────────────────────────────────────┤
│ 2. Context & Gating (Basemind + SEGR)                                  │
│    -> Basemind hemat token; SEGR kunci memori per scope                │
├────────────────────────────────────────────────────────────────────────┤
│ 3. Unconstrained Persona Synthesis (Agency-Agents DNA)                 │
│    -> Hapus larangan kaku; ganti dengan JSON Envelope Terstruktur      │
├────────────────────────────────────────────────────────────────────────┤
│ 4. Server-Driven Visual & Actionable Card (Pondasi CRUD)               │
│    -> Chart otomatis + Kartu Konfirmasi Draf Pembelian / PO             │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 📍 FASE 1: Multi-Item Batch Entity Resolver di `mcp-server`
**Tujuan**: Menjamin seluruh penulisan cepat atau singkatan item belanja (seperti `Sgtg Biru`, `Lencana Merah`, `Beras Emi`) langsung terpetakan ke data resmi master produk di database `blonjo_db`.

* **Berkas yang Dimodifikasi/Dibuat**:
  1. `mcp-server/src/tools/batchItemResolver.ts` (Modul Baru).
  2. Integrasi ke `mcp-server/src/services/reactEngine.ts`.
* **Spesifikasi Teknis**:
  - Menerima array baris belanja: `Array<{ raw_text: string, raw_qty: number, raw_unit: string }>`.
  - Eksekusi kueri terpadu menggunakan bobot Harvest & Re-Rank:
    1. Cek `ocr_alias_mappings` (Bobot 1.00).
    2. Cek Exact Word Match (Bobot 0.85).
    3. Cek `similarity(p.name, raw_name)` & `word_similarity(raw_name, p.name)` via `pg_trgm` (Ambang batas > 0.25).
  - Mengembalikan objek kanonikal:
    ```typescript
    export interface ResolvedProductItem {
      raw_input: string;
      matched: boolean;
      product_id: number | null;
      official_name: string;
      base_unit: string;
      last_purchase_price: number;
      moving_average_cost: number;
      confidence_score: number;
    }
    ```
* **Kriteria Pengujian Mandiri**:
  - Script test `scripts/test_batch_resolver.ts` berhasil memetakan daftar belanja sesi #39 ke ID 60, ID 534, ID 55, ID 579, ID 211, ID 132, ID 1 dengan tingkat akurasi 100%.

---

### 📍 FASE 2: Restrukturisasi Lapisan Sintesis & Output JSON Envelope di `vibeCopilot.ts`
**Tujuan**: Menghilangkan kekakuan respon, menghapus bias larangan "DILARANG", dan mengaktifkan pembuatan visual chart secara otomatis berdasarkan maksud tersirat.

* **Berkas yang Dimodifikasi**:
  1. `mcp-server/src/tools/vibeCopilot.ts`.
* **Spesifikasi Teknis**:
  - Buat kontrak output terstruktur (JSON Envelope):
    ```json
    {
      "executive_summary": "Total estimasi kebutuhan modal belanja adalah Rp 4.376.960...",
      "resolved_items_table": [...],
      "dashboard_widget": {
        "type": "CHART_BAR",
        "title": "Alokasi Modal Belanja per Komoditas",
        "data": { ... }
      },
      "unresolved_items": [...],
      "action_proposal": {
        "action_type": "CREATE_PURCHASE_PLAN_DRAFT",
        "title": "Simpan sebagai Draf Pengadaan",
        "payload": { ... }
      },
      "next_suggestions": [...]
    }
    ```
  - **Aturan Otomasi Chart**: Jika data mengandung $\ge 3$ entitas komparasi atau distribusi biaya belanja $\to$ otomatis hasilkan spesifikasi chart (tanpa menunggu user mengetik kata 'grafik').

---

### 📍 FASE 3: Pondasi Keamanan & Kontrak Chat-Driven CRUD di `sajen-api`
**Tujuan**: Membuka jalan agar dari chat pengguna berwenang (Owner/Admin) dapat mengeksekusi mutasi data secara aman dengan prinsip *Human-in-the-Loop*.

* **Berkas yang Dimodifikasi/Dibuat**:
  1. `sajen/app/api/v1/insights.py` (Endpoint `/api/v1/insights/action/execute`).
  2. Skema Pydantic: `ActionExecutionRequest`, `ActionExecutionResponse`.
* **Spesifikasi Keamanan**:
  - **RBAC Gate**: Hanya `CurrentUser.role in [Role.OWNER, Role.ADMIN]` yang diizinkan memanggil endpoint eksekusi aksi.
  - **Draft-First Mutation**: Aksi yang didukung pada tahap awal:
    1. `CREATE_PURCHASE_PLAN_DRAFT`: Menyimpan daftar item ke tabel draf pembelian tanpa memotong saldo kas/stok langsung.
    2. `REGISTER_PRODUCT_ALIAS`: Menyimpan singkatan baru kasir ke `ocr_alias_mappings`.
  - **Dry-Run Validasi**: AI hanya membuat *proposal*, eksekusi mutasi final HANYA berjalan saat pengguna menekan tombol konfirmasi di UI.

---

### 📍 FASE 4: Visualisasi & Komponen Interaktif di Frontend `blonjo-ui`
**Tujuan**: Menampilkan chart dinamis yang estetik dan kartu aksi interaktif (*Interactive Action Card*) di ruang obrolan.

* **Berkas yang Dimodifikasi**:
  1. `blonjo/src/pages/insights/VibesChat.tsx`.
  2. `blonjo/src/pages/vibe/VibeRenderer.tsx`.
* **Spesifikasi Antarmuka**:
  - Render kartu proposal draf:
    - Menampilkan ringkasan item & total nominal modal.
    - Tombol `[Setujui & Simpan Draf]` (memanggil endpoint eksekusi).
    - Tombol `[Batalkan]`.
  - Chart otomatis ter-render menggunakan pustaka Chart.js / SVG yang sudah ada dengan gaya Glassmorphism.

---

## 🔒 3. PROTOKOL KONSISTENSI KODING (ANTI-MELENCENG)

Agar hasil koding tidak lagi meleset dari dokumen planning:
1. **Dilarang Menghapus Tools Yang Sudah Stabil**: Basemind token compressor dan SEGR cognitive memory tetap menjadi filter utama konteks.
2. **Setiap Fase Wajib Melalui Script Uji**: Tidak boleh menyatakan sebuah fase selesai di logbook sebelum script verifikasi mandiri dijalankan dan menghasilkan status *PASS*.
3. **Penyimpanan Dokumen Tunggal**: Dokumen ini disimpan di `docs/LAPORAN_ANALISA_DAN_PLANNING_VIBESCHAT_INTELLIGENCE.md` sebagai rujukan verifikasi hasil akhir.
