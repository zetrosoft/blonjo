# Checklist Tugas: Redesign Arsitektur Hybrid OCR-LLM Pipeline dengan PyTesseract

Berikut adalah daftar tugas terperinci untuk mengimplementasikan dan mengintegrasikan arsitektur **The Hybrid OCR-LLM Pipeline** menggunakan **PyTesseract (Tesseract OCR lokal)** pada aplikasi **Blonjo & Sajen**:

- `[x]` Tahap 1: Pembaruan Dockerfile & Dependensi Worker
  - `[x]` Perbarui `sajen/Dockerfile` untuk memasang dependensi sistem Tesseract OCR: `tesseract-ocr`, `tesseract-ocr-ind`, `tesseract-ocr-eng`.
  - `[x]` Perbarui `sajen/pyproject.toml` untuk menyertakan dependensi `pytesseract`, `opencv-python-headless`, `shapely`, dan `pgvector`.
  - `[x]` Jalankan build ulang kontainer `sajen-api` and `sajen-worker` dengan `docker compose up --build -d`.

- `[x]` Tahap 2: Konfigurasi Variabel Lingkungan & Model
  - `[x]` Tambahkan parameter `OLLAMA_LLM_MODEL` dengan nilai default `"qwen2.5:3b"` pada `sajen/app/core/config.py`.

- `[x]` Tahap 3: Pemrograman Worker Asinkron Hybrid Pipeline
  - `[x]` Perbarui `sajen/app/workers/ocr_worker.py` dengan logika Tesseract OCR menggunakan `pytesseract`.
  - `[x]` Integrasikan rekayasa prompt struktur akuntansi JSON baru sesuai instruksi pengguna pada temperature `0.25`.
  - `[x]` Hubungkan teks mentah hasil OCR dengan dynamic few-shot learning (umpan balik `ocr_feedback` di database).
  - `[x]` Buat sistem pembersihan tangguh (`clean_json`) untuk memotong tag markdown JSON atau pemikiran reasoning (`<think>`).

- `[x]` Tahap 4: Skema Adaptor & Kompatibilitas Backend API
  - `[x]` Implementasikan fungsi mapper `_map_rich_schema_to_frontend` di `sajen/app/api/v1/ocr.py` untuk kompatibilitas mundur.
  - `[x]` Sesuaikan API endpoint `GET /tasks` and `POST /tasks/{task_id}/correct` agar memproses payload baru secara transparan tanpa merusak UI React Blonjo.

- `[x]` Tahap 5: Pengujian & Laporan Walkthrough Akhir
  - `[x]` Buat skrip uji asinkron `sajen/test_tesseract_pipeline.py` untuk memvalidasi performa OCR dan LLM di dalam kontainer Docker.
  - `[x]` Lakukan pengujian manual pengunggahan nota, monitoring terminal log, dan verifikasi pipeline.
  - `[x]` Susun dokumen laporan walkthrough akhir di `docs/walkthrough.md`.
