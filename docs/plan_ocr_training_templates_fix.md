# Rencana Kerja: Perbaikan Error 500 pada RAG/OCR Training Templates

Dokumen ini menjelaskan rencana perbaikan untuk mengatasi error `500 Internal Server Error` saat memanggil API `/ocr/training-templates`.

---

## 🔍 Analisis Penyebab Utama (Root Cause)

Error disebabkan oleh adanya **ketidakcocokan arsitektur data** pasca migrasi data RAG ke MCP Server:
1. **Pemisahan Database**: Data RAG kini dipusatkan di tabel `knowledge_vectors` milik database **MCP Server (`mcp_hub_db`)**, sedangkan API Sajen terhubung ke database **`blonjo_db`**.
2. **Kueri SQL Langsung**: Beberapa route di `sajen/app/api/v1/ocr.py` (untuk `GET`, `PUT`, dan `DELETE` template) masih berupaya mengeksekusi kueri SQL langsung ke tabel `knowledge_vectors` menggunakan session database lokal Sajen (`blonjo_db`). Karena tabel tersebut tidak ada di `blonjo_db`, kueri mengalami kegagalan (`relation "knowledge_vectors" does not exist`).
3. **Ketiadaan API Endpoint di MCP**: MCP Server saat ini hanya menyediakan endpoint `POST /ingest` dan `POST /search`. Belum ada endpoint untuk me-list (`GET`), memperbarui (`PUT`), atau menghapus (`DELETE`) data RAG secara spesifik berbasis UUID.

---

## 🛠️ Langkah Perbaikan (Action Plan)

Perbaikan akan dilakukan secara bertahap pada 3 repositori (MCP Server, Sajen Backend, dan Blonjo Frontend) dengan pendekatan *Stateless Client*:

### Fase 1: Pembaruan API pada MCP Server (`mcp-server`)
Menambahkan endpoint manajemen RAG baru di `/Users/user/kerjaan/mcp-server/src/index.ts`:
1. **`GET /api/v1/rag/templates`**:
   * Menerima query parameter `tenant_id`.
   * Mengambil template dari `knowledge_vectors` dengan filter `metadata->>'app_context' = 'sajen_ocr'` dan `tenant_id` terkait (atau `null` untuk global).
2. **`PUT /api/v1/rag/templates/:id`**:
   * Melakukan pembaruan field `content`, `metadata`, dan kalkulasi ulang `embedding` menggunakan AI Provider (Gemini/Ollama) untuk baris berbasis UUID.
3. **`DELETE /api/v1/rag/templates/:id`**:
   * Menghapus baris template berbasis UUID.

### Fase 2: Refaktorisasi Backend Sajen (`sajen`)
Memperbarui berkas `sajen/app/api/v1/ocr.py` agar tidak melakukan kueri database lokal, melainkan melakukan panggilan HTTP ke MCP Server:
1. **Modifikasi Skema**: Mengubah tipe data `id` pada `AILearningTemplateResponse` di `sajen/app/schemas/ocr.py` menjadi `str` agar bisa menampung format UUID.
2. **Refaktor `GET /ocr/training-templates`**: Memanggil `GET {MCP_SERVER_URL}/api/v1/rag/templates?tenant_id={tenant_id}`.
3. **Refaktor `PUT /ocr/training-templates/{template_id}`**: Memanggil `PUT {MCP_SERVER_URL}/api/v1/rag/templates/{template_id}`.
4. **Refaktor `DELETE /ocr/training-templates/{template_id}`**: Memanggil `DELETE {MCP_SERVER_URL}/api/v1/rag/templates/{template_id}`.

### Fase 3: Pembaruan Frontend Blonjo (`blonjo`)
Memperbarui tipe state `editingId` dan `deleteTargetId` di `/Users/user/kerjaan/jualan/blonjo/src/pages/settings/AITrainingSettings.tsx` agar dapat menampung tipe data `string` (UUID) selain `number`.

### Fase 4: Pengujian & Deployment
1. Menjalankan deployment mcp-server: `./deploy.sh` di folder `mcp-server`.
2. Menjalankan deployment jualan: `./deploy.sh sajen-api sajen-worker blonjo-ui` di folder `jualan`.
3. Verifikasi halaman **AI Training Settings** di frontend.
