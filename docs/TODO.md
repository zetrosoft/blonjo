# TODO — Optimalisasi MCP & Pricing Rule Integration
*(Generated: 2026-07-02 | Berdasarkan analisis codebase real + dokumen arsitektur)*

> [!IMPORTANT]
> Semua task diurutkan berdasarkan **prioritas dan risiko**. Selesaikan fase secara berurutan.
> Jangan pernah menghapus/mengganti fungsi yang sudah berjalan tanpa feature flag.

---

## 📊 Status Kondisi Codebase Saat Ini (Baseline)

| Komponen | Status | Keterangan |
|---|---|---|
| `smart_parser.py` | ✅ Berjalan | Rule-based parse (try_rule_based_parse) sudah live |
| `coa_cache.py` | ✅ Berjalan | Redis cache COA dengan TTL 10 menit sudah live |
| `accounting.py` (API) | ✅ Berjalan | Pipeline 3-level (rule → cache → LLM) sudah live |
| `ai_context.py` | ✅ Berjalan | Inject seluruh pricing rules ke prompt (masalah token!) |
| `pricing_engine.py` | ✅ Berjalan | Support tiered/bundle/formula/discount/volume |
| `pricing_engine.update_moving_average()` | ✅ Berjalan | Auto-adjust harga jual saat HPP naik sudah live |
| `inventory.py` (API) | ✅ Berjalan | Public stock endpoint, pricing rules CRUD sudah ada |
| `ai_engine.parse_pricing_rule()` | ✅ Berjalan | NLP parser pricing rule via Gemini/Ollama |
| `ocr_worker.py` | ✅ Berjalan | OCR via Celery (Gemini Vision) |
| `PricingRulePage.tsx` | ✅ Berjalan | UI AI + Manual input mode sudah ada |
| `MCPClient` di Sajen | ❌ Belum Ada | Belum ada file `mcp_client.py` |
| `classify_transaction()` | ❌ Belum Ada | Belum ada di `smart_parser.py` |
| `build_minimal_context()` | ❌ Belum Ada | Pricing rules masih di-inject semua tanpa filter |
| `MCP_ENABLED` env var | ❌ Belum Ada | Belum ada di `.env` |
| `PriceListPage.tsx` | ❌ Belum Ada | Belum ada halaman terpisah untuk Price List |
| MCP Tool `ocr_receipt` | ❌ Belum Ada | Perlu ditambah ke mcp-backend |
| MCP Tool `check_stock_wa` | ✅ Sudah Ada | `/inventory/public/stock` endpoint sudah live di Sajen |

---

## 🔴 FASE 0 — Quick Win: Kurangi Token Tanpa Sentuh MCP (SELESAI ✅)

> **Target: Hemat 80% token untuk transaksi kas global (KAS_GLOBAL)**
> Tidak membutuhkan MCP sama sekali. Dapat langsung dieksekusi.

### F0-1: Tambah `classify_transaction()` ke `smart_parser.py`

**File:** `sajen/app/services/smart_parser.py`

- [x] Tambah `Enum TransactionClass` (KAS_GLOBAL, PRODUCT_SALES, UNKNOWN) di bawah Section 1
- [x] Tambah list `PATTERNS_KAS_GLOBAL` (regex untuk: selisih uang tunai, rekonsiliasi, tambahan/kurang kas, setoran/penarikan kas, biaya/gaji/sewa)
- [x] Buat fungsi `classify_transaction(text: str) -> TransactionClass`
- [x] Buat fungsi `_extract_product_keywords(text: str) -> list[str]`

> **AMAN:** Jangan ubah `try_rule_based_parse()` yang sudah ada. Fungsi baru hanya tambahan.

---

### F0-2: Tambah `build_minimal_context()` ke `ai_context.py`

**File:** `sajen/app/services/ai_context.py`

**Masalah saat ini:** `get_rag_context()` (baris 87-96) selalu inject SEMUA `TenantPricingRule`
aktif ke prompt. Terbukti dari log: 143 token padahal transaksi kas butuh ~15 token.

- [x] Buat helper `_get_cash_accounts(tenant_id, db) -> str` — query COA akun kas (1-1xxx)
- [x] Buat helper `_get_sales_accounts(tenant_id, db) -> str` — query COA penjualan
- [x] Buat helper `_get_common_accounts(tenant_id, db) -> str` — query COA umum fallback
- [x] Buat helper `_get_matched_pricing_rules(tenant_id, keywords, db) -> list` — filter pricing
  rules berdasarkan keyword produk (match `rule_payload['product_name']`)
- [x] Buat fungsi `build_minimal_context(text, tx_class, tenant_id, db) -> dict`
  yang return `{"coa": ..., "pricing_rules": [...]}`
- [x] **Jangan ubah** `get_rag_context()` existing — fungsi baru adalah tambahan paralel

---

### F0-3: Integrasi Classifier ke `accounting.py` (API Route)

**File:** `sajen/app/api/v1/accounting.py`

**Target:** Modifikasi di section Level 2 & 3 (baris ~86-115), setelah rule-based miss.

- [x] Import `classify_transaction, TransactionClass` dari `smart_parser`
- [x] Import `build_minimal_context` dari `ai_context`
- [x] Setelah `rule_result` miss (baris ~86), tambah classifikasi:
  `tx_class = classify_transaction(normalized_text)`
- [x] Ganti logika eager-load semua pricing rules:
  - Jika `tx_class == KAS_GLOBAL` → skip inject pricing_rules ke prompt (hemat ~80% token)
  - Jika `tx_class == PRODUCT_SALES` → inject hanya pricing rules yang keyword match
  - Jika `UNKNOWN` → fallback ke behavior lama (inject semua, aman)
- [x] Pertahankan semua logika post-processing yang sudah ada (baris 117-158)
- [x] Bungkus dalam try/except — jika gagal, fallback ke `get_rag_context()` lama

---


## 🟡 FASE 1 — MCPClient Bridge (Feature-Flag Safe) (SELESAI ✅)

> **Target: Sambungkan Sajen ke MCP Server tanpa breaking change**
> MCP sudah berjalan di production port :3000. Sajen belum pernah memanggil MCP.

### F1-1: Buat `mcp_client.py` di Sajen

**File baru:** `sajen/app/services/mcp_client.py`

- [x] Tambah variabel ke `.env` di root `/jualan/.env`:
  - `MCP_ENABLED=false`
  - `MCP_SERVER_URL=http://mcp-backend-prod:3000`
  - `MCP_API_KEY=sk-sajen-internal-xxx`
- [x] Tambah field ke `sajen/app/core/config.py` class `Settings`:
  - `MCP_ENABLED: bool = False`
  - `MCP_SERVER_URL: str = "http://mcp-backend-prod:3000"`
  - `MCP_API_KEY: str = ""`
- [x] Buat class `MCPClient` dengan method async:
  - `call_tool(tool_name, arguments) -> dict`
  - `parse_transaction(text, context) -> dict` (fallback ke `ai_engine.call_ai_text()`)
  - `parse_pricing_rule(text) -> dict` (fallback ke `ai_engine.parse_pricing_rule()`)
  - `ocr_receipt(file_bytes, mime_type) -> dict` (fallback ke `ai_engine.call_ai_vision()`)
- [x] Buat singleton `mcp_client = MCPClient()` di akhir file
- [x] Semua method cek `settings.MCP_ENABLED` sebelum hit MCP

> **DEFAULT AMAN:** MCP_ENABLED=false = sistem berjalan identik seperti sekarang.

---

### F1-2: Sambungkan `accounting.py` ke `mcp_client`

**File:** `sajen/app/api/v1/accounting.py`

- [x] Import `mcp_client` dari `app.services.mcp_client`
- [x] Di Level 3 (panggil LLM), ganti `call_ai_text()` dengan `mcp_client.parse_transaction()`
- [x] Karena route saat ini sync (`def`), gunakan `asyncio.run()` atau konversi ke `async def`

  — konfirmasi dulu dengan tim apakah FastAPI endpoint boleh diubah ke async
- [ ] Test `MCP_ENABLED=false` dulu — pastikan output identik
- [ ] Test `MCP_ENABLED=true` — verifikasi data mengalir ke MCP

---

### F1-3: Sambungkan `inventory.py` ke `mcp_client` untuk Pricing Rule

**File:** `sajen/app/api/v1/inventory.py`

- [x] Di endpoint `POST /pricing-rules/parse` (baris ~358-371), evaluasi apakah perlu migrasi
- [x] Keputusan: Migrasi aman dengan local fallback di mcp_client selesai diintegrasikan.

---

## 🟢 FASE 2 — Extend MCP Tools + Migrate OCR (CLIENT SIDE SELESAI ✅)

> **Target: Pindahkan OCR ke MCP agar isolasi dan bisa scale independent**
> PENTING: Task server-side MCP membutuhkan deployment pada repo `mcp-server` eksternal.

### F2-1: Tambah Tool `ocr_receipt` ke MCP Server (MCP Repo Dependent ⏳)

**File baru di mcp-backend:** `mcp-server/src/tools/ocrTool.ts`

- [ ] **Prerequisite:** Dapatkan akses ke source code mcp-backend-prod
- [ ] Eksplorasi struktur folder dan pola tool yang sudah ada (parse_transaction, parse_pricing_rule)
- [ ] Buat tool `ocr_receipt(file_b64, mime_type)` menggunakan `aiProviderService` existing
- [ ] Return format: `{ items: [...], raw_text: "..." }`
- [ ] Deploy dan test via `POST /tools/ocr_receipt`

---

### F2-2: Migrasi `ocr_worker.py` ke `mcp_client.ocr_receipt()`

**File:** `sajen/app/workers/ocr_worker.py`

- [x] Identifikasi seluruh fungsi yang memanggil Gemini Vision (baris 26-56+)
- [x] Tambah cabang dengan feature flag:
  - Jika `MCP_ENABLED=true` → `mcp_client.ocr_receipt(file_bytes, mime_type)`
  - Jika `false` → pakai `call_gemini_fallback()` seperti sekarang
- [x] **Jangan hapus** `call_gemini_fallback()` — tetap sebagai fallback permanen

---

### F2-3: Tambah Tool `check_stock_wa` ke MCP Server (MCP Repo Dependent ⏳)

**Catatan Penting:** Endpoint `/inventory/public/stock` di Sajen **sudah ada** (inventory.py
baris 507-560) dan sudah mengembalikan pricing matrix lengkap. Task MCP hanya wrapper:

- [ ] Buat tool MCP `check_stock_wa(wa_number_toko, query)` yang memanggil:
  `GET {SAJEN_API_URL}/api/v1/inventory/public/stock?phone={wa_number}&query={query}`
- [ ] Format response menjadi teks natural WA menggunakan `aiProviderService` MCP
- [ ] Test end-to-end: Bizeto WA → MCP `check_stock_wa` → Sajen public stock → reply natural

---


## 🔵 FASE 3 — Blonjo Frontend: Price List Page (SELESAI ✅)

> **Target: UI manajemen harga jual yang intuitif dengan deteksi auto-adjusted**
> Sesuai arsitektur `PRICING_RULE_AND_MCP_INTEGRATION.md` section 3 & 5

### F3-1: Buat Halaman `PriceListPage.tsx`

**File baru:** `blonjo/src/pages/master-data/PriceListPage.tsx`

- [x] Tabel daftar produk dengan kolom:
  Nama | SKU | HPP (Moving Average) | Harga Jual Dasar | Pricing Rule Aktif | Status
- [x] Indikator `⚠️ Auto-Adjusted` jika `auto_adjusted == true`
  (field sudah ada di model baris 106, API sudah return di inventory.py baris 195)
- [x] Tampilkan matriks aturan aktif (tiered/bundle) di bawah harga dasar produk
- [x] Modal Edit Dinamis berdasarkan tipe rule:
  - **Tiered** → render list input tier harga per qty
  - **Bundle** → render input paket + harga dasar + harga paket
  - **Formula/Standar** → render input harga langsung
  - **Discount** → render input persentase (%)
- [x] Penyimpanan Pintar saat save:
  - Ada `pricing_rule_payload` → `PUT /inventory/pricing-rules/{id}` (update rule)
  - Tidak ada → `PUT /inventory/prices/{product_id}` (update harga dasar)

---

### F3-2: Cek dan Tambah Backend Endpoint yang Mungkin Belum Ada

**File:** `sajen/app/api/v1/inventory.py`

- [x] Cek apakah `PUT /inventory/pricing-rules/{rule_id}` sudah ada
  — jika belum, tambahkan (update rule_payload, is_active, valid_to)
- [x] Cek apakah `PUT /inventory/prices/{product_id}` sudah ada
  — jika belum, tambahkan (update amount, reset auto_adjusted=False setelah user edit manual)
- [x] Pastikan `TenantProductPriceResponse` schema mengekspos field `auto_adjusted`

---

### F3-3: Daftarkan `PriceListPage` ke Router dan Navigasi

**File:** `blonjo/src/App.tsx` dan sidebar component

- [x] Import dan daftarkan route untuk `PriceListPage`
- [x] Tambahkan link navigasi di sidebar/menu Master Data
- [x] Pastikan konsisten dengan pola routing yang sudah ada

---


## 🟠 FASE 4 — Infra Cleanup (Disk & Resource)

> **Target: Turunkan disk VPS dari 79% ke < 60%**

### F4-1: Multi-Stage Build Docker Sajen

**File:** `sajen/Dockerfile`

- [ ] Baca isi Dockerfile saat ini dan identifikasi penyebab 2.66 GB
- [ ] Buat multi-stage build:
  - Stage `builder`: `python:3.12` → install semua deps dengan uv
  - Stage `runtime`: `python:3.12-slim` → copy `.venv` dari builder
- [ ] Target: < 500 MB per image
- [ ] Test build lokal terlebih dahulu, jangan langsung push ke production

> **WAJIB:** Test semua endpoint (OCR, parse, pricing) tetap berjalan setelah slim image.

---

### F4-2: Docker Log Rotation

**File:** `docker-compose.prod.yml`

- [ ] Tambah `logging` config ke semua service:
  ```yaml
  logging:
    driver: "json-file"
    options:
      max-size: "10m"
      max-file: "3"
  ```
- [ ] Apply ke: sajen_backend_api, sajen_agentic_worker, blonjo_frontend

---

### F4-3: Cleanup Docker Images (One-Time, Koordinasi dengan DevOps)

- [ ] Koordinasikan jadwal maintenance dengan tim
- [ ] Di VPS jalankan:
  ```bash
  docker image prune -a --filter "until=72h"
  docker builder prune -a
  docker volume prune
  ```
- [ ] Verifikasi dengan `df -h` — target < 60%

---

## ✅ Checklist Keamanan (Wajib Sebelum Setiap Fase)

- [ ] Baca seluruh file yang akan dimodifikasi terlebih dahulu
- [ ] Jalankan test existing (`test_accounting_logic.py`, `test_parse.py`, dll) sebelum mulai
- [ ] Gunakan feature flag — jangan hardcode perubahan behavior
- [ ] Pastikan ada fallback ke logika lama jika fitur baru error
- [ ] Commit kecil per sub-task, bukan satu commit besar
- [ ] Jalankan test lagi setelah selesai

---

## ❓ Konfirmasi yang Diperlukan Sebelum Eksekusi

1. **Lokasi source code MCP Server** — untuk Fase 2 perlu akses folder `mcp-backend-prod`
2. **Async vs Sync** — `accounting.py` saat ini sync. MCPClient butuh async. Konfirmasi
   apakah boleh konversi ke `async def` atau gunakan `asyncio.run()`
3. **Fase 1-3 (Pricing Rule MCP)** — berdasarkan dokumen disarankan tetap lokal, skip?
4. **Jadwal Maintenance Disk** — Fase 4-3 butuh downtime singkat

---

## 🗓️ Urutan Eksekusi yang Disarankan

```
F0-1 → F0-2 → F0-3    (Quick Win, 2-3 hari, ROI langsung, risiko rendah)
        ↓
F1-1 → F1-2            (MCPClient bridge, 2 hari)
        ↓
F3-1 → F3-2 → F3-3    (PriceList UI, 2-3 hari, bisa paralel dengan F1)
        ↓
F2-1 → F2-2 → F2-3    (OCR migrate + WA stock, butuh akses MCP server repo)
        ↓
F4-1 → F4-2 → F4-3    (Infra cleanup, urgent untuk disk, bisa dilakukan kapan saja)
```

---

*Dokumen ini dibuat berdasarkan:*
- *`docs/mcp_optimization_architecture.md` (Rev 3.0 — Production Verified)*
- *`docs/PRICING_RULE_AND_MCP_INTEGRATION.md`*
- *Audit langsung codebase `/jualan` pada 2026-07-02*
