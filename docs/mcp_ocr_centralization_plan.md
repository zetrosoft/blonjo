# Rencana Kerja: Sentralisasi Kecerdasan OCR pada MCP Server (Rev 3.0)

Rencana ini bertujuan memusatkan alur pengolahan OCR pada **MCP Server** agar dapat digunakan secara terpusat oleh aplikasi lain dalam ekosistem Bizeto/Samkarsa, serta mengatasi kendala payload HTTP 413 (*Payload Too Large*) dan rute HTTP 404 (*Not Found*) yang terjadi saat ini.

---

## 1. Posisi Roadmap & Keselarasan Arsitektur
Tugas ini merupakan bagian dari **Fase 2 (Extend MCP Tools)** dari rencana induk Samkarsa.
* **Protokol REST Bridge**: Komunikasi antara `sajen` dan `mcp-server` menggunakan *REST HTTP Bridge* pada port `3000` (bukan SSE transport). Maka, tool baru wajib didaftarkan di dalam rute Express `/tools/:toolName` sekaligus di objek `McpServer` SDK.
* **Analisis Kesesuaian Model**:
  - **`qwen2.5-coder:3b`** tetap digunakan untuk tugas *Text Generation* (ekstraksi JSON transaksi/harga) karena ringan, presisi pada JSON, dan cepat di GPU 1050 Ti.
  - **`llava:latest`** digunakan **HANYA** untuk tugas *Vision* (OCR Gambar) sebagai fallback lokal. Model ini **tidak cocok** untuk *Text Generation* karena lambat dan kurang akurat dalam penalaran teks murni.

---

## 2. Strategi Auto-Switch Gemini Free Tier
Untuk mengoptimalkan biaya dan ketersediaan API, metode `generateVision` pada MCP Server wajib mengikuti alur pertahanan kuota berikut:

```
[Mulai OCR]
    │
    ▼
1. Coba gemini-2.5-flash (Free Tier) ───[Sukses]───► [Selesai]
    │ (Jika 429 / Quota Limit)
    ▼
2. Coba gemini-2.0-flash (Free Tier) ───[Sukses]───► [Selesai]
    │ (Jika 429 / Quota Limit)
    ▼
3. Coba gemini-1.5-flash (Free Tier) ───[Sukses]───► [Selesai]
    │ (Jika semua Gemini gagal/habis kuota)
    ▼
4. Fallback Provider: Ollama Local (llava:latest) ───► [Selesai]
```

---

## 3. Cakupan Kerja (Scope)

- **Masuk (In)**:
  - Mengonfigurasi limit ukuran JSON body pada router Express di MCP Server agar mendukung payload gambar Base64 hingga `50mb` di endpoint `/messages` dan `/tools/:toolName` (Solusi HTTP 413).
  - Menambahkan metode `generateVision` pada `AiProviderService` di MCP Server dengan dukungan API Gemini Vision (menggunakan konfigurasi `GOOGLE_API_KEY` eksis) dengan **rotasi 3 tingkatan model Gemini Free-tier** sebelum beralih ke provider Ollama lokal (`llava:latest`).
  - Membuat tool `ocr_receipt` di `/tools/ocrTool.ts` dan mendaftarkannya pada objek `McpServer` SDK.
  - Memetakan tool `ocr_receipt` ke dalam *REST Bridge handler* di berkas [index.ts](file:///Users/user/kerjaan/mcp-server/src/index.ts).
- **Keluar (Out)**:
  - Mengubah logika parser akuntansi (`accounting.py`) di backend `sajen`.
  - Menggunakan `llava:latest` untuk kebutuhan teks (tetap menggunakan `qwen2.5-coder` untuk efisiensi).

---

## 4. Langkah-Langkah Aksi (Action Items)

### Fase 1: Konfigurasi Muatan Express & Penyiapan Layanan Vision di MCP Server
- [ ] **Configure Express Limits**: Modifikasi middleware parser JSON di berkas [/Users/user/kerjaan/mcp-server/src/index.ts](file:///Users/user/kerjaan/mcp-server/src/index.ts) pada endpoint `/messages` dan `/tools/:toolName` agar menerima muatan sampai `50mb` (menggantikan default `100kb`).
- [ ] **Add generateVision Method**: Tambahkan metode static `generateVision` pada kelas `AiProviderService` di berkas [/Users/user/kerjaan/mcp-server/src/services/aiProviderService.ts](file:///Users/user/kerjaan/mcp-server/src/services/aiProviderService.ts) untuk memproses data gambar menggunakan Gemini Vision API (rotasi prioritas model) dan fallback ke Ollama `llava:latest` jika semua kuota Gemini habis.

### Fase 2: Pendaftaran Tool OCR Baru di MCP Server
- [ ] **Create OCR Tool Handler**: Buat berkas tool baru di `/Users/user/kerjaan/mcp-server/src/tools/ocrTool.ts` yang mendefinisikan skema input (`file_b64`, `mime_type`) sesuai dengan panggilan `mcp_client.py` dari `sajen` dan memanggil `AiProviderService.generateVision`.
- [ ] **Register OCR Tool to SDK**: Daftarkan tool `ocr_receipt` di dalam berkas utama [/Users/user/kerjaan/mcp-server/src/index.ts](file:///Users/user/kerjaan/mcp-server/src/index.ts) menggunakan `server.tool(...)`.
- [ ] **Register OCR Tool to REST Bridge**: Tambahkan blok percabangan `if (toolName === "ocr_receipt")` di dalam route handler `app.post("/tools/:toolName")` di [index.ts](file:///Users/user/kerjaan/mcp-server/src/index.ts) agar request dari `sajen` tidak terkena status 404.

### Fase 3: Validasi & Uji Coba Integrasi (Zero Downtime)
- [ ] **Build and Restart MCP Server**: Lakukan kompilasi ulang (build) pada proyek `mcp-server` dan restart service `mcp-backend-prod` di VPS.
- [ ] **Verify OCR Flow**: Jalankan uji coba upload nota baru dari frontend Blonjo untuk memastikan bahwa log backend Sajen berhasil memanggil `ocr_receipt` di MCP Server secara sukses (tanpa error 413 atau 404) dan mengembalikan data teks terstruktur.
