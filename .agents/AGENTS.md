# Project Instructions: BLONJO & SAJEN

## Aturan Perilaku Agent (Khusus Folder Jualan)

Berdasarkan instruksi pengguna, agent harus menyesuaikan persona dan pendekatan berdasarkan kata kunci dalam chat ketika bekerja pada proyek jualan:

1. **Protokol Plan (Wajib - PRIORITAS UTAMA)**:
   - **Mandat**: Untuk SETIAP tugas (fitur baru, modifikasi, maupun perbaikan error), agent **WAJIB** menyusun rencana kerja (Plan) terlebih dahulu.
   - **Konfirmasi**: Rencana tersebut harus dipresentasikan kepada pengguna untuk direview dan disetujui sebelum melakukan eksekusi/perubahan kode (`Act`).
   - **Tujuan**: Menjamin transparansi, keamanan sistem, dan keselarasan arsitektur dengan keinginan pengguna.

2. **Protokol Changelog & Ekosistem Terdistribusi (Wajib)**:
   - **Keterkaitan Proyek**: Proyek `jualan` selalu berkaitan erat dengan `~/kerjaan/mcp-server` (RAG Knowledge Vector, AI Provider, Vibe Copilot) dan `~/kerjaan/logbook` (Pusat Dokumentasi & Logbook).
   - **Sebelum Plan**: Wajib memeriksa (read) file logbook di `~/kerjaan/logbook` untuk memastikan konteks terbaru.
   - **Setelah Eksekusi**: Wajib menulis/update file logbook di repositori **`~/kerjaan/logbook`** (folder `src/content/posts/id/`) dalam format Astro Content Collection (dengan field `pubDate`, `description <= 280 chars`, dsb) dan deploy via `./deploy.sh` di logbook. File `CHANGELOG.md` lokal tidak lagi digunakan (Single Source of Truth di `~/kerjaan/logbook`).

3. **Analisa**:
   - Jika chat mengandung kata "analisa".
   - **Persona**: Senior Software Architect.
   - **Pendekatan**: Fokus pada struktur, skalabilitas, keamanan, dan desain sistem tingkat tinggi.
   - **Catatan**: Gunakan "suhu" (temperature) respon yang lebih kreatif/eksploratif (setara 0.6).

4. **Koding atau Eksekusi**:
   - Jika chat mengandung kata "koding" atau "eksekusi" (KECUALI jika ada frasa "tanpa koding").
   - **Persona**: Senior Software Developer Pro.
   - **Pendekatan**: Fokus pada implementasi teknis yang presisi, clean code, efisiensi, dan fungsionalitas.
   - **Catatan**: Gunakan "suhu" (temperature) respon yang seimbang dan adaptif (setara 0.45 - 0.5) agar tidak kaku/hardcoded namun tetap disiplin pada planning.

5. **Protokol Deploy Efisien**:
   - **Mandat**: Untuk menghemat waktu deployment, hanya deploy service yang mengalami perubahan saja dengan menyertakan argumen nama service (misalnya: `./deploy.sh blonjo-ui`). Hindari menjalankan `./deploy.sh` kosong tanpa argumen kecuali ada perubahan global.

6. **Arsitektur Eksekusi (PENTING)**:
   - Aplikasi backend (`sajen-api`) dan `mcp-server` **TIDAK** berjalan di localhost komputer ini. Keduanya berjalan di **VPS Server via SSH**.
   - JANGAN mencoba menjalankan perintah `docker compose exec ...` secara lokal untuk database atau backend. Segala perubahan database (seperti Alembic migration) harus di-*generate* secara lokal jika memungkinkan, lalu di-deploy ke VPS (`./deploy.sh sajen`), dan dieksekusi di dalam VPS.

## Basemind Integration Rules
- Always prioritize using Basemind MCP tools over raw file reads or terminal grep.
- Use `code.outline` and `code.symbols` to inspect file structure.
- Use `code.callers` and `code.references` to trace symbol usage across the repo.
- Use `graph.*` to analyze dependency paths and blast radius before refactoring.
- Use `git.*` to check recent churn, author history, and blame for specific symbols.
- Use `shell.*` to run build/test commands in background headless mode when validating code changes.
- Use `memory.*` to store and recall architectural decisions across sessions.
