# Rancangan Optimalisasi MCP Server — Ekosistem Samkarsa
*(Status: Final Blueprint — Living Document | Rev 3.0 — Verified from Production)*

> [!IMPORTANT]
> **Vibe Orchestrator** dikecualikan dari scope aktif dokumen ini.
> **Versi ini diverifikasi langsung dari kondisi production VPS** — bukan asumsi.

---

## 1. Kondisi Infrastruktur Aktual (Verified Production)

### Spesifikasi VPS

| Resource | Total | Terpakai | Sisa | Status |
|---|---|---|---|---|
| **RAM** | 3.8 GB | 2.0 GB (aktif) | 1.8 GB available | ⚠️ Tight |
| **Swap** | 4.0 GB | 573 MB | — | ⚠️ Aktif → pernah OOM |
| **Disk** | 48 GB | 38 GB | 10 GB | 🔴 79% — Kritis |
| **CPU** | 1 vCPU | Load avg 0.03 | — | ✅ Sangat ringan |

### 16 Container Berjalan di 1 VPS

```
GRUP SAJEN & BLONJO (316 MB RAM):
  sajen_backend_api      → 173 MB | port :8005  | FastAPI + uvicorn
  sajen_agentic_worker   → 143 MB | no port     | Celery worker
  blonjo_frontend        →   3 MB | port :7500  | Nginx (React build)

GRUP MCP (sudah production! — 32 MB RAM):
  mcp-backend-prod       →  17 MB | port :3000  | Node.js MCP Hub API (Up 2 days)
  mcp-frontend-prod      →  15 MB | port :7700  | Vite/UI (Up 2 days)

GRUP BIZETO & N8N (218 MB RAM):
  bizeto_n8n             → 205 MB | port :5700  | 🔴 Terbesar! n8n workflows
  bizeto_backend         →  12 MB | port :3400  | Backend WA
  bizeto_frontend        →   1 MB | port :3320  | Nginx

GRUP BIJEXA INFRA (41 MB RAM):
  bijexa-haproxy         →   2 MB | port 80/443 | Entry point semua traffic
  bijexa-traefik         →  26 MB | port 80     | Reverse proxy internal
  bijexa-dashboard       →   1 MB |             | Dashboard monitoring
  bijexa-relay           →  13 MB | port 4321   | Relay service

GRUP INFRA BERSAMA (69 MB RAM):
  jkk-infra-postgres-1   →  44 MB | port :55432 | pgvector/pg16 (healthy)
  jkk-infra-redis-1      →   7 MB | port 6379   | Redis 7 (healthy, CPU 0.5%)
  portainer              →  19 MB | port :9000  | Docker management UI
  web-senaca-1           →   1 MB | port 80     | Nginx senaca
```

### Penyebab Disk 79% (38 GB dari 48 GB)

```
Docker Images (penyumbang terbesar):
  jualan-sajen-worker  → 2.66 GB  ← 🔴 Raksasa! (Python + semua deps)
  jualan-sajen-api     → 2.66 GB  ← 🔴 Raksasa! (shared layers dengan worker)
  n8n                  → 2.30 GB  ← Besar
  mcp-backend          → 298  MB
  mcp-frontend         → 269  MB
  pgvector/pg16        → 621  MB
  --------------------------------
  Estimasi total images: ~9+ GB

Docker Volumes:
  anonymous vol (n8n data)  → 233 MB
  jkk-quantum postgres      → 131 MB
  lain-lain                 → ~150 MB
```

> [!WARNING]
> **Image `jualan-sajen-worker` dan `jualan-sajen-api` masing-masing 2.66 GB** adalah
> penyebab utama disk besar. Ini karena base image Python + semua library AI (kemungkinan
> include PyTesseract, OpenCV, atau ML libs). Perlu multi-stage build untuk dikecilkan.

---

## 2. Temuan Kritis: MCP Server Sudah Production-Ready

> [!IMPORTANT]
> **MCP Server sudah berjalan di production** — bukan perlu dibangun dari nol.
> `mcp-backend-prod` sudah implement MCP Protocol SDK resmi dengan SSE transport.

### Tools yang Sudah Ada di MCP Server

```
server.tool("get_rag_context")
  → Mengambil konteks statis (SOP/FAQ) dan merakit instruksi Guardrail untuk LLM

server.tool("parse_transaction")
  → Mengekstrak teks natural transaksi menjadi JSON terstruktur (items, qty, price, total)

server.tool("parse_pricing_rule")
  → Mengekstrak deskripsi natural aturan harga menjadi JSON terstruktur (tiered/bundle)

server.tool("vibe_orchestrator")   ← skip untuk saat ini
  → Agentic router Server-Driven UI
```

### Services yang Sudah Diimplementasi

```
aiProviderService.js  → Failover: Ollama Local → Ollama ngrok → Gemini Flash
ingestionService.js   → Pipeline ingestion data ke vector store
settingsService.js    → Manajemen konfigurasi per tenant
vectorService.js      → pgvector similarity search (HNSW)
```

### AI Provider Hierarchy di MCP (Sudah Berjalan)

```
Priority 1: Ollama Local  (qwen2.5:3b, qwen2.5-coder:3b)  — gratis, privat
Priority 2: Ollama ngrok  (sama model, via ngrok tunnel)    — fallback Ollama
Priority 3: Gemini Flash  (gemini-3.1-flash-lite-preview)  — fallback cloud
Embedding : nomic-embed-text (Ollama) atau gemini-embedding-2
```

---

## 3. Gap Analysis: Apa yang Belum Terhubung

Meski MCP Server sudah ada dan kaya fitur, **Sajen API belum memanggil MCP sama sekali**.

```
KONDISI SEKARANG:
  Sajen API → langsung panggil Gemini/Ollama → hasil AI → simpan DB

TARGET:
  Sajen API → [classify] → [minimal context] → MCP Server → AI → hasil → Sajen → DB

GAP yang harus diisi:
  1. ❌ Sajen tidak punya MCPClient — belum ada kode penghubung
  2. ❌ Sajen tidak classify tipe transaksi — semua dapat full context
  3. ❌ Sajen selalu eager-load seluruh COA + pricing rules ke prompt
  4. ❌ OCR di Celery Worker masih lokal, belum delegasi ke MCP
  5. ❌ Bizeto WA tidak lewat MCP untuk respons natural (langsung ke Sajen API)
```

---

## 4. Masalah Nyata: Bukti dari Log Produksi

```
[LOG AKTUAL 2026-07-01 16:01:28]
MODEL  : GEMINI-3.1-FLASH-LITE
INPUT  : "Selisih uang Tunai 230500"        ← transaksi kas global, non-barang
TOKENS : IN: 143 | OUT: 16
PAYLOAD: Seluruh pricing rules Ketumbar,
         Beras Siip, dll ikut terbawa       ← TIDAK RELEVAN
RESULT : { items: [] }                      ← AI tidak pakai satu pun rule itu

KALKULASI PEMBOROSAN:
  Token relevan yang seharusnya: ~15-20 token (tanggal, nominal, tipe kas)
  Token terkirim: 143 token
  Token terbuang: ~120 token = ~84% overhead
  Biaya nyata: 8x lebih mahal dari seharusnya
```

---

## 5. Arsitektur Target: Integrasi Sajen ↔ MCP

```
+-----------------------------------------------------------------------+
|                    EKOSISTEM SAMKARSA (1 VPS)                         |
|                                                                       |
|  BLONJO (UI)                                                          |
|  port :7500 ─────────────────────────────────────────────────┐       |
|                                                               │       |
|  SAJEN API (FastAPI)                    MCP SERVER            │       |
|  port :8005                             port :3000            │       |
|  ┌─────────────────────┐               ┌──────────────────┐  │       |
|  │ Level 1: Rule-based │               │ Tools:           │  │       |
|  │ (0ms, 0 token)      │               │ parse_transaction│  │       |
|  │                     │ ──callTool──▶ │ parse_pricing    │  │       |
|  │ Level 2: Classify   │               │ get_rag_context  │  │       |
|  │ + minimal context   │ ◀──result──── │ ocr_receipt (new)│  │       |
|  │                     │               │ check_stock_wa   │  │       |
|  │ Level 3: MCPClient  │               │  (new)           │  │       |
|  └─────────────────────┘               └──────────────────┘  │       |
|           │                                    │              │       |
|           ▼                                    ▼              │       |
|  ┌─────────────────────────────────────────────────────────┐  │       |
|  │            PostgreSQL + pgvector + Redis                │  │       |
|  │            (shared, diakses Sajen & MCP)               │  │       |
|  └─────────────────────────────────────────────────────────┘  │       |
|                                                               │       |
|  BIZETO WA ────────────────────────────────────────────── ───┘       |
|  port :3400 (via MCP check_stock_wa → Sajen public API)               |
|                                                                       |
|  OLLAMA (Eksternal, di luar VPS — via ngrok atau direct)              |
+-----------------------------------------------------------------------+
```

### Tabel Pembagian Tanggung Jawab (Final)

| Proses | Lokasi | Alasan |
|---|---|---|
| **Rule-Based Regex** | Sajen API Level 1 | 0ms, 0 token |
| **Classify tipe transaksi** | Sajen API Level 2 | sebelum kirim ke MCP |
| **Dynamic context build** | Sajen API Level 2 | filter COA & rule relevan saja |
| **Parse Transaction NLP** | MCP `parse_transaction` | ✅ sudah ada, tinggal dipakai |
| **Parse Pricing Rule** | MCP `parse_pricing_rule` | ✅ sudah ada, tinggal dipakai |
| **RAG / FAQ context** | MCP `get_rag_context` | ✅ sudah ada |
| **OCR Receipt / Vision** | MCP `ocr_receipt` (baru) | perlu ditambah ke MCP |
| **WA Stock & Price** | MCP `check_stock_wa` (baru) | perlu ditambah ke MCP |
| **Core Business Logic** | Sajen (permanen) | double-entry, HPP, PSAK EMKM |
| **Data Penyimpanan** | PostgreSQL lokal (permanen) | kedaulatan data |

---

## 6. Rancangan Implementasi

### A. Sajen: Dynamic Context Classifier
**(Prioritas TINGGI — Langsung hemat 80% token, tidak butuh MCP dulu)**

```python
# sajen/app/services/smart_parser.py — TAMBAHKAN

import re
from enum import Enum

class TransactionClass(str, Enum):
    KAS_GLOBAL = "KAS_GLOBAL"       # Kas, rekonsiliasi, selisih — SKIP pricing rules
    PRODUCT_SALES = "PRODUCT_SALES" # Jual beli barang — butuh pricing rules
    UNKNOWN = "UNKNOWN"             # Fallback — bawa context minimal

PATTERNS_KAS_GLOBAL = [
    r'(?i)(selisih|rekonsiliasi)\s+(uang\s+)?tunai\s*([\d.,]+)',
    r'(?i)(tambahan|kurang)\s+(uang\s+)?(tunai|kas)\s*([\d.,]+)',
    r'(?i)(pendapatan|pengeluaran)\s+(tambahan|lain[- ]?lain)\s*([\d.,]+)',
    r'(?i)(setoran|penarikan)\s+(kas|tunai)\s*([\d.,]+)',
    r'(?i)^(biaya|bayar)\s+\w+[\s\d.,]+$',
    r'(?i)(modal|gaji|upah|sewa)\s+[\d.,]+',
]

def classify_transaction(text: str) -> TransactionClass:
    normalized = text.lower().strip()
    for pattern in PATTERNS_KAS_GLOBAL:
        if re.search(pattern, normalized):
            return TransactionClass.KAS_GLOBAL
    product_signals = [
        'kg', 'gram', 'gr', 'pcs', 'btl', 'ctn', 'pack', 'ons',
        'liter', 'beli', 'belanja', 'jual', 'jualan', '@', 'per '
    ]
    if any(kw in normalized for kw in product_signals):
        return TransactionClass.PRODUCT_SALES
    return TransactionClass.UNKNOWN


def build_minimal_context(
    text: str,
    tx_class: TransactionClass,
    tenant_id: int,
    db: Session
) -> dict:
    """
    Bangun context seringkas mungkin sesuai tipe transaksi.
    KAS_GLOBAL  → hanya COA kas, pricing_rules kosong
    PRODUCT_SALES → COA penjualan + pricing rules keyword match saja
    UNKNOWN     → COA umum, pricing rules kosong (fallback aman)
    """
    if tx_class == TransactionClass.KAS_GLOBAL:
        return {
            "coa": _get_cash_accounts(tenant_id, db),
            "pricing_rules": []
        }
    elif tx_class == TransactionClass.PRODUCT_SALES:
        keywords = _extract_product_keywords(text)
        return {
            "coa": _get_sales_accounts(tenant_id, db),
            "pricing_rules": _get_matched_pricing_rules(tenant_id, keywords, db)
        }
    else:
        return {
            "coa": _get_common_accounts(tenant_id, db),
            "pricing_rules": []
        }
```

### B. Sajen: MCPClient Wrapper dengan Feature Flag
**(Di `sajen/app/services/mcp_client.py` — BUAT BARU)**

```python
import httpx
import base64
from app.core.config import settings

class MCPClient:
    """
    Abstraksi koneksi ke MCP Server (mcp.samkarsa.com port :3000).
    MCP_ENABLED=false → fallback ke AI engine lokal (zero breaking change).
    Swap ke MCP cukup set env variable, tanpa ubah kode accounting.py.
    """
    BASE_URL = settings.MCP_SERVER_URL  # http://mcp-backend-prod:3000

    async def call_tool(self, tool_name: str, arguments: dict) -> dict:
        """Generic MCP tool caller via HTTP (bukan SSE untuk server-to-server)."""
        if not settings.MCP_ENABLED:
            raise RuntimeError("MCP_ENABLED=false, gunakan fallback AI lokal")
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{self.BASE_URL}/tools/{tool_name}",
                json=arguments,
                headers={"Authorization": f"Bearer {settings.MCP_API_KEY}"}
            )
            resp.raise_for_status()
            return resp.json()

    async def parse_transaction(self, text: str, context: dict) -> dict:
        if settings.MCP_ENABLED:
            return await self.call_tool("parse_transaction", {
                "text": text, "context": context
            })
        # Fallback: panggil ai_engine lokal langsung
        from app.services.ai_engine import call_ai_text
        return await call_ai_text(text, context)

    async def parse_pricing_rule(self, text: str) -> dict:
        if settings.MCP_ENABLED:
            return await self.call_tool("parse_pricing_rule", {"text": text})
        from app.services.ai_engine import call_ai_text_pricing
        return await call_ai_text_pricing(text)

    async def ocr_receipt(self, file_data: bytes, mime_type: str) -> dict:
        if settings.MCP_ENABLED:
            return await self.call_tool("ocr_receipt", {
                "file_b64": base64.b64encode(file_data).decode(),
                "mime_type": mime_type
            })
        from app.services.ai_engine import call_ai_vision
        return await call_ai_vision(file_data, mime_type)

mcp_client = MCPClient()  # Singleton, import di mana perlu
```

### C. MCP Server: Tambah 2 Tools Baru
**(Di `mcp-server/src/tools/` — EXTEND yang sudah ada)**

```typescript
// mcp-server/src/tools/ocrTool.ts — BARU
server.tool("ocr_receipt", "Ekstraksi teks & item dari gambar struk atau PDF", {
  file_b64: z.string().describe("File encoded dalam Base64"),
  mime_type: z.enum(["image/jpeg", "image/png", "application/pdf"])
}, async ({ file_b64, mime_type }) => {
  const buffer = Buffer.from(file_b64, "base64");
  // Gunakan aiProviderService yang sudah ada (Gemini Vision / Ollama)
  const result = await AIProviderService.generateVision(buffer, mime_type);
  return { content: [{ type: "text", text: JSON.stringify(result) }] };
});

// mcp-server/src/tools/stockTool.ts — BARU
server.tool("check_stock_wa", "Cek stok & harga produk untuk balasan WA natural", {
  wa_number_toko: z.string().describe("Nomor WA toko terdaftar"),
  query: z.string().describe("Nama produk yang dicari")
}, async ({ wa_number_toko, query }) => {
  // Panggil Sajen Public API
  const sajenResp = await axios.get(
    `${SAJEN_API_URL}/api/v1/inventory/public/stock`,
    { params: { phone: wa_number_toko, query } }
  );
  // Format jadi jawaban natural
  const answer = await AIProviderService.generateText(
    `Format data stok ini menjadi jawaban WhatsApp natural dan singkat: ${JSON.stringify(sajenResp.data)}`,
    "Kamu adalah asisten toko yang ramah dan profesional."
  );
  return { content: [{ type: "text", text: answer }] };
});
```

---

## 7. Environment Variables

```bash
# Sajen API (.env)
MCP_ENABLED=false              # false = AI lokal langsung (sekarang)
                               # true  = lewat MCP server (setelah integrasi)
MCP_SERVER_URL=http://mcp-backend-prod:3000   # Docker internal network
MCP_API_KEY=sk-sajen-internal-xxx

# MCP Server (.env) — sudah ada, verifikasi saja
GEMINI_GEN_MODELS=gemini-3.1-flash-lite-preview,gemini-3-flash-preview,gemini-2.5-flash
OLLAMA_GEN_MODELS=qwen2.5:3b,qwen2.5-coder:3b,qwen2.5-coder
OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_LOCAL_URL=http://172.17.0.1:11434
OLLAMA_NGROK_URL=https://[ngrok-url].ngrok-free.dev
DATABASE_URL=postgresql://sajen_user:[pass]@jkk-infra-postgres-1:5432/mcp_hub_db
AI_DIMENSIONS=3072
```

---

## 8. Rekomendasi Tambahan: Masalah Non-MCP

Berdasarkan audit production, ada 2 masalah di luar scope MCP yang lebih mendesak:

### 🔴 Disk 79% — Tindakan Segera

```bash
# 1. Hapus dangling images & build cache
docker image prune -a --filter "until=72h"
docker builder prune -a

# 2. Kompres sajen image dengan multi-stage build
#    Target: dari 2.66 GB → < 500 MB
#    Pisahkan: build-stage (full Python) vs runtime-stage (slim Python)

# 3. Setup log rotation di nginx & docker
# /etc/docker/daemon.json:
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" }
}
```

### ⚠️ n8n 205 MB — Evaluasi Penggunaan

`bizeto_n8n` adalah container terbesar (205 MB RAM, 2.3 GB image). Jika digunakan
aktif untuk workflow Bizeto, pertahankan. Jika bisa digantikan dengan kode langsung,
pertimbangkan untuk remove.

### ⚠️ SSE Log MCP — Klien Belum Persistent

```
Log: "Koneksi SSE ditutup oleh klien" (berulang)
```
MCP Server menunggu klien SSE yang terputus terus-menerus. Ini normal jika frontend
MCP masih dalam tahap development/testing. Tidak mengganggu fungsionalitas tool HTTP.

---

## 9. Roadmap Implementasi (Phased)

```mermaid
gantt
    title Roadmap Optimalisasi — Ekosistem Samkarsa
    dateFormat YYYY-MM-DD
    section Fase 0 - Quick Win (Zero MCP, ROI Langsung)
    Tambah classifier + regex KAS_GLOBAL      :crit, f0a, 2026-07-02, 1d
    Implementasi build_minimal_context()      :crit, f0b, after f0a, 1d
    Integrasi ke accounting.py (replace eager-load) :f0c, after f0b, 1d
    section Fase 1 - MCPClient Bridge
    Buat mcp_client.py + feature flag         :f1a, after f0c, 1d
    Connect accounting.py ke mcp_client       :f1b, after f1a, 1d
    Test parse_transaction via MCP (MCP_ENABLED=true) :f1c, after f1b, 1d
    section Fase 2 - Extend MCP Tools
    Tambah tool ocr_receipt ke MCP server     :f2a, after f1c, 2d
    Migrate ocr_worker.py ke mcp_client.ocr_receipt :f2b, after f2a, 1d
    Tambah tool check_stock_wa ke MCP server  :f2c, after f2b, 2d
    Test Bizeto WA → MCP → Sajen end-to-end  :f2d, after f2c, 1d
    section Fase 3 - Infra Cleanup
    Multi-stage build sajen image (2.66GB→<500MB) :f3a, 2026-07-10, 3d
    Docker log rotation setup                 :f3b, after f3a, 1d
    Disk monitoring & alert setup             :f3c, after f3b, 1d
    section Fase 4 - Scale-Out (Saat Butuh)
    Pindahkan MCP ke VPS terpisah            :f4a, 2026-08-01, 3d
    Aktifkan MCP_SERVER_URL ke remote        :f4b, after f4a, 1d
```

---

## 10. Metrik Keberhasilan

| Metrik | Sekarang | Fase 0 Target | Fase 2 Target |
|---|---|---|---|
| Token input kas global | ~143 | **~15-20 (-87%)** | ~10-15 |
| Token input product sales | ~143 | ~60-80 (-50%) | ~40-60 |
| OCR load di worker utama | Tinggi | Sama | **Terisolasi di MCP** |
| Waktu update model AI | Redeploy semua | Sama | **Ubah 1 file MCP saja** |
| Disk usage | 79% (kritis) | — | **< 60% setelah image cleanup** |
| Kesiapan scale-out MCP | 0% | Partial | **100%** (MCP sudah ada!) |

---

## 11. Risiko & Mitigasi

| Risiko | Peluang | Mitigasi |
|---|---|---|
| MCP down → AI Sajen down | Menengah | `MCP_ENABLED=false` → fallback ke AI lokal |
| Disk penuh → container crash | **TINGGI** | Jalankan `docker image prune` segera |
| SSE client disconnect spam log | Rendah | Implementasi reconnect atau disable SSE log di non-debug |
| OCR base64 payload besar | Menengah | Kompres gambar sebelum encode, atau gunakan URL referensi |
| n8n OOM saat traffic tinggi | Menengah | Set memory limit: `--memory=256m` di docker-compose |

---

*Dokumen ini diverifikasi langsung dari `docker stats`, `docker inspect`, dan `docker logs` production VPS.*
*Dibuat: 2026-07-02 | Rev 3.0 — Production Verified | Review: SA + SD + SH*
