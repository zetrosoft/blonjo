# 📋 Checklist TODO: VibesChat Intelligence V2 Implementation

Dokumen pelacakan tugas teknis (*actionable checklist*) berdasarkan kesepakatan di [`docs/LAPORAN_ANALISA_DAN_PLANNING_VIBESCHAT_INTELLIGENCE.md`](./LAPORAN_ANALISA_DAN_PLANNING_VIBESCHAT_INTELLIGENCE.md).

---

## 📌 FASE 1: Multi-Item Batch Entity Resolver di `mcp-server`
> **Goal**: Mengeliminasi kegagalan pencocokan nama barang cepat/singkatan nota (`Sgtg Biru`, `Lencana Merah`, `Beras Emi`) ke master data resmi database PostgreSQL `blonjo_db`.

- [x] **1.1. Modul Baru `batchItemResolver.ts` di MCP Server**
  - Path: `~/kerjaan/mcp-server/src/tools/batchItemResolver.ts`
  - Implementasi fungsi `resolveBatchProductItems(tenantId: string, items: Array<{ raw_text: string, raw_qty?: number, raw_unit?: string }>)`
  - Algoritma pencocokan paralel berbobot (Multi-Factor Scoring):
    1. Alias Eksplisit dari `ocr_alias_mappings` (Score: 1.00)
    2. Exact Token / Word Match (Score: 0.85)
    3. `pg_trgm` similarity & word_similarity (Threshold > 0.25, Score: 0.30–0.80)
  - Ekstraksi HPP riil: `moving_average_cost`, `last_purchase_price`, dan aturan harga tier resmi dari `tenant_pricing_rules`.
- [x] **1.2. Integrasi ke ReAct Engine**
  - Path: `~/kerjaan/mcp-server/src/services/reactEngine.ts`
  - Daftarkan tool `resolve_batch_product_items` ke ReAct tool registry.
  - Tambahkan deteksi otomatis jika input pengguna memuat daftar baris belanja ($\ge 2$ item) agar langsung memanggil batch resolver daripada SQL ad-hoc mentah.
- [x] **1.3. Script Pengujian Mandiri (Automated Verification)**
  - Path: `~/kerjaan/mcp-server/scripts/test_batch_resolver.ts`
  - Uji dataset nyata dari Chat Sesi #39:
    - `Sgtg Biru 4dus` ➔ ID 60 (`SGTG BIRU TRANSP 1KG`)
    - `Lencana Merah 1dus` ➔ ID 534 (`LENCANA MERAH DUS`)
    - `Cakra kembar 1 Dus` ➔ ID 55 (`CAKRA/K TPG TRANS 1KG`)
    - `beras emi 75Kg` ➔ ID 536/579
    - `Kacang Tabah 5Kg` ➔ ID 211 (`KACANG TANAH 80/90`)
    - `Bawang Kating 20Kg` ➔ ID 132 (`BAWANG KATING`)
    - `beras siip 150kg` ➔ ID 535/1 (`BERAS SIP`)
  - Target: **Akurasi 100% (8 dari 8 item berhasil terpetakan)**.
- [x] **1.4. Deployment & Validasi MCP**
  - Berhasil di-deploy dan divalidasi langsung di container `mcp-backend-prod` VPS.

---

## 📌 FASE 2: Restrukturisasi Lapisan Sintesis & Visual Otomatis di `vibeCopilot.ts`
> **Goal**: Mengeliminasi kekakuan respon, menghapus bias larangan "DILARANG", dan mengaktifkan pembuatan visual chart dinamis (hanya saat bermakna) untuk maksud tersirat.

- [x] **2.1. Refactor Prompt & Otomasi Chart Cerdas**
  - Path: `~/kerjaan/mcp-server/src/tools/vibeCopilot.ts`
  - Mengganti regex kaku dengan logika deteksi `shouldRenderChart`: aktif jika `isExplicitChartRequested` ATAU ada resolusi belanja multi-item (`isBatchResolution`) ATAU komparasi $\ge 3$ entitas belanja.
  - Membuang kata-kata "DILARANG KERAS", beralih ke prinsip *Executive Storytelling* yang elegan dan lugas.
  - Memastikan nama resmi master produk database yang dipakai pada tabel Markdown (`| No | Item Input | Nama Produk Resmi (Database) | Qty | Estimasi Harga Satuan | Subtotal |`).
- [x] **2.2. Uji Coba Sintesis Output Nyata di VPS**
  - Menguji 2 skenario langsung di VPS:
    1. Pertanyaan satu fakta (misal: "Berapa pengeluaran bensin hari ini?") ➔ **Chart tidak muncul sama sekali (Zero Chart Spam)**, jawaban padat dan to-the-point dengan data kas/bank riil.
    2. Rencana belanja 8 item Sesi #39 ➔ **Otomatis menghasilkan Bar Chart Plotly**, tabel rincian dengan nama master resmi 100% konsisten, dan total Rp 5.298.456,66.
- [x] **2.3. Deployment & Sinkronisasi VPS**
  - Source & bundle di-compile (`pnpm run build`), disinkronkan ke VPS, dan container `mcp-backend-prod` telah di-restart dan berstatus *healthy*.

---

## 📌 FASE 3: Pondasi Keamanan & Kontrak Chat-Driven CRUD di `sajen-api`
> **Goal**: Menyediakan endpoint mutasi data yang aman, berprinsip *Human-in-the-Loop*, dan terlindungi RBAC.

- [x] **3.1. Endpoint Eksekusi Aksi Chat**
  - Path: `sajen/app/api/v1/insights.py`
  - Endpoint: `POST /api/v1/insights/action/execute`
  - Skema Pydantic: `ActionExecutionItem`, `ActionExecutionRequest`, `ActionExecutionResponse`
- [x] **3.2. RBAC Gate & Draft-First Mutation**
  - **Verifikasi RBAC**: Token kasir (`CASHIER`) **ditolak 403 Forbidden** (`Akses Ditolak: Hanya Pemilik Toko (Owner/Admin) yang berwenang...`). Token admin/owner (`ADMIN`/`is_superuser`) **diterima 200 OK**.
  - **Handler 1**: `CREATE_PURCHASE_PLAN_DRAFT` berhasil menyimpan Draf Rencana Belanja (terbukti masuk ke tabel `purchase_plans` ID #41 dan 8 baris ke `purchase_plan_items` di PostgreSQL `blonjo_db` riil).
  - **Handler 2**: `REGISTER_PRODUCT_ALIAS` berhasil mendaftarkan alias baru ke `ocr_alias_mappings`.
- [x] **3.3. Deployment & Sinkronisasi Backend Sajen**
  - File disinkronkan ke VPS, dialect connection diperbaiki (`postgresql+psycopg2`), dan service `sajen_backend_api` berjalan normal (*healthy*).

---

## 📌 FASE 4: Antarmuka Interaktif & Kartu Aksi di `blonjo-ui`
> **Goal**: Menampilkan chart dinamis Glassmorphism dan Interactive Action Card di antarmuka chat frontend.

- [x] **4.1. Integrasi Parsing Action Proposal & Visual Chart**
  - Path: `blonjo/src/pages/insights/VibesChat.tsx`
  - Parsing blok `<!-- ACTION_PROPOSAL -->` secara otomatis tanpa mengotori tampilan teks obrolan pengguna.
  - Plotly Visual Chart otomatis merender visualisasi komparasi anggaran per kategori belanja secara responsif.
- [x] **4.2. Komponen Interactive Action Card**
  - Kartu Glassmorphism yang menampilkan ringkasan jumlah barang teridentifikasi dan total estimasi belanja.
  - Tombol interaktif `[Simpan sebagai Draf PO]` yang terhubung langsung ke `POST /api/v1/insights/action/execute`.
  - Dilengkapi proteksi UI role-aware (jika kasir, tombol didisable dengan pesan peringatan hak akses).
  - State feedback sukses otomatis memunculkan nomor PO dan tombol navigasi langsung ke menu Pengadaan (`/procurement/orders`).
- [x] **4.3. Deployment & Sinkronisasi Frontend Blonjo**
  - Bundle `blonjo/dist` di-compile lokal (1.67 detik) dan disinkronkan ke container `blonjo_frontend` Nginx di VPS. Web app live di `https://blonjo.samkarsa.com`.

---

## 📌 FASE 5: Validasi End-to-End, Dokumentasi & Logbook
- [x] **5.1. Uji Nyata Obrolan Skenario Rencana Belanja Sesi #39** di `blonjo.samkarsa.com/insights/vibes-chat`.
- [x] **5.2. Penulisan Postingan Logbook Resmi** di `~/kerjaan/logbook/src/content/posts/id/jualan-v1-5-0-082-vibeschat-intelligence-v2-batch-resolver-and-chat-crud.md`.
- [x] **5.3. Deployment Logbook** via `./deploy.sh` di folder logbook ke `docs.samkarsa.com`.
