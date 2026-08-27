---
title: "Release v1.3.2 - Vibes Chat Markdown Rendering, Multi-turn Memory & In-Memory Caching"
date: "2026-08-26"
version: "1.3.2"
description: "Penyempurnaan tampilan Vibes Chat dengan ReactMarkdown & GFM (custom styled tables, badges, blockquotes, code block), memori percakapan multi-turn, dan in-memory TTL caching untuk endpoint widget."
---

# CHANGELOG - BLONJO & SAJEN

Semua perubahan penting pada proyek **BLONJO** (Frontend POS) dan **SAJEN** (Backend API & AI Worker) dicatat dalam dokumen ini.

---

## [v1.3.2] - 2026-08-26

### 💬 Vibes Chat & AI Co-Pilot Enhancement (MCP-Centric Architecture)
- **Centralized Grounding & Semantic RAG di MCP Server (`mcp-server`)**:
  - Mengembangkan tool baru `vibe_copilot` pada MCP Server (`mcp-server/src/tools/vibeCopilot.ts`).
  - Menjalankan *Autonomous SQL Grounding* langsung via database pool (Neraca, Kas, Utang AP, Piutang AR, Jurnal Hari Ini & 7 Hari).
  - Mengintegrasikan *pgvector semantic search* untuk panduan/SOP toko dan *AiProviderService* dengan auto-fallback (Gemini / Ollama).
  - Menetapkan *Strict Temporal Anchoring* dan *Accounting First-Principles* bebas dari template hardcode.
- **Simplifikasi Backend Gateway (`sajen-api`)**:
  - Menyederhanakan `POST /insights/chat` menjadi *clean proxy* ke tool `vibe_copilot` di MCP Server dengan fail-safe local fallback.
- **Rich Markdown Rendering (`blonjo-ui`)**:
  - Mengintegrasikan `ReactMarkdown` dan `remarkGfm` pada [`VibesChat.tsx`](file:///Users/user/kerjaan/jualan/blonjo/src/pages/insights/VibesChat.tsx).
  - Menyediakan *custom components* untuk tabel finansial bergaris halus, badge angka nominal uang, styled blockquotes, dan block code monospace.
  - Memperbarui layout *Glassmorphism 2.0* dengan typing indicator dinamis dan tombol *Refresh Data*.
- **In-Memory TTL Caching (`sajen-api`)**:
  - Menambahkan *in-memory cache* 60 detik pada `GET /insights/widgets` untuk mereduksi beban I/O query agregasi database dan mempercepat navigasi halaman (<50ms).

---

## [v1.3.1] - 2026-08-24

### 🖼️ Deteksi Duplikasi & Modal Pratinjau Foto Nota Asli
- **Pemeriksaan Transaksi Aktif Terintegrasi (`sajen-api`)**:
  - Mengubah logika pengecekan duplikasi pada `POST /ocr/upload` (`sajen/app/api/v1/ocr.py`).
  - Jika transaksi dari nota tersebut telah **DIHAPUS** oleh pengguna di jurnal (`Transaction`), sistem secara otomatis mengabaikan task duplikat lama dan **memicu Pemindaian AI Vision Segar (Fresh Scan)**.
- **Endpoint Gambar Publik (`/api/v1/ocr/tasks/{task_id}/image`)**:
  - Menyajikan berkas foto nota fisik asli tanpa terhalang autentikasi `401` pada elemen HTML `<img>`.
- **Komponen Popup Modal Dialog (`DuplicateWarningDialog.tsx`)**:
  - Memindahkan pratinjau duplikasi dari section halaman ke **Popup Modal Dialog Melayang** di tengah layar.
  - Menyajikan **Foto Struk Nota Fisik Asli dari Server** secara presisi.
  - Menyediakan tombol **"Close"** yang secara otomatis melakukan *reload/refresh* halaman transaksi saat ditutup agar form kembali bersih.

---

## [v1.2.0] - 2026-08-24

### 🤖 Fitur AI & Engine Deteksi Duplikasi
- **Visual Perceptual Hashing (dHash 64-bit)**:
  - Mengimplementasikan algoritma *Difference Hashing (dHash)* pada `sajen/app/services/vision_matcher.py`.
  - Menambahkan fungsi `hamming_distance` untuk mendeteksi kemiripan fisik foto nota ($\le 10$ bit perbedaan = $\ge 85\%$ visual similarity match) bahkan jika nama berkas diubah atau resolusi disesuaikan.
- **Database Migration (`image_hash`)**:
  - Menambahkan kolom `image_hash = Column(String, index=True)` pada tabel `OCRTask` (`sajen/app/models/ocr.py`).
  - Membuat & menjalankan migrasi Alembic `9a8b7c6d5e4f_add_image_hash_to_ocrtask.py`.
  - Mengkalkulasi dan mengisikan (*backfill*) nilai `image_hash` untuk **349 foto nota historis** di database server produksi.
- **Semantic AI Signature Validation**:
  - Menambahkan validasi kombinasi `(tenant_id, transaction_date, total_amount)` pada `parse_smart_input` (`accounting.py`) dan `process_receipt_ocr` (`ocr_worker.py`).
  - Mengembalikan `is_duplicate: True` dan banner `duplicate_warning` seketika saat transaksi terdeteksi sudah tercatat di database (`POSTED`).

### 🔌 Fixes & Peningkatan API (`sajen-api`)
- **Compatibility Router Trailing Slash**:
  - Menambahkan dekorator `@router.post("/upload/")` pada `sajen/app/api/v1/ocr.py` untuk mendukung *trailing slash* dan mencegah error `405 Method Not Allowed`.
- **Fix Logging Exception**:
  - Memperbaiki `NameError: name 'logger' is not defined` pada penanganan log informasi pencocokan Visual pHash.
- **Dukungan Propagasi Status Duplikat**:
  - Memperbarui `get_ocr_task_detail` (`GET /ocr/tasks/{id}`) untuk terus memeriksa `extracted_data.is_duplicate` maupun pencocokan pHash historis sehingga status `is_duplicate: True` tetap terjaga saat polling.

### 🎨 Pembaruan UI Frontend (`blonjo-ui`)
- **Banner Peringatan Duplikasi AI Merah**:
  - Menambahkan Alert Banner Merah Tegas pada `blonjo/src/components/ParsePreview.tsx` yang muncul di bagian atas modal preview saat nota duplikat terdeteksi.
- **Toast Close Button Manual**:
  - Mengaktifkan `closeButton` pada `<Toaster position="top-right" richColors closeButton />` di `blonjo/src/App.tsx`.
  - Seluruh notifikasi Toast kini memiliki tombol **Silang (X)** untuk ditutup secara manual kapan saja oleh pengguna.
- **Handling Error 409 Conflict**:
  - Menambahkan penanganan HTTP 409 Conflict pada `useSmartConfirm.ts` untuk memunculkan Toast Warning jika pengguna tetap menekan tombol simpan pada transaksi ganda.

---
