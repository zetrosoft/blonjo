# Rencana Kerja (Plan): Perbaikan Bug 500 Delete Contact & Crash Chat Insights (RAG MCP)

Dokumen ini berisi analisis dan rencana perbaikan untuk menyelesaikan crash pada penghapusan kontak, dropdown koreksi nama supplier di frontend, crash endpoint `/insights/chat`, dan ValidationError 500 pada response schema kontak.

---

## 🛠️ Masalah & Solusi yang Diusulkan

### 1. Pemberitahuan Elegan saat Kontak Memiliki Transaksi
* **Masalah**: Menghapus kontak yang telah terpakai di transaksi melempar 500 error karena Postgres memblokir Foreign Key.
* **Solusi**: Di backend `sajen/app/api/v1/inventory.py`, sebelum session.delete, periksa apakah kontak digunakan di `InventoryLog`, `PurchasePlanItem`, atau `Product`. Jika ya, kembalikan respons HTTP `400 Bad Request` dengan pesan ramah: *"Kontak tidak dapat dihapus karena telah digunakan dalam riwayat transaksi atau katalog produk."*

### 2. Fitur Koreksi Nama / Penggabungan Supplier via Dropdown (Frontend)
* **Masalah**: Di modal profil & riwayat pemasok, user ingin mengedit nama supplier berupa dropdown yang berisi nama-nama supplier terdekat/mirip untuk penggabungan atau koreksi.
* **Solusi**: 
  - Di `SupplierPage.tsx` pada modal profil, tambahkan section "Koreksi / Gabungkan Pemasok" dengan elemen UI `<select>` (dropdown) berisi daftar supplier aktif lainnya.
  - Saat dipilih dan disimpan, kirim request PUT untuk mengupdate nama supplier saat ini ke nama baru.

### 3. Integrasi RAG MCP & Solusi Crash Endpoint `/insights/chat`
* **Masalah**: 
  - Vibes Chat memanggil `call_ai_text` (JSON parser) untuk chat bebas sehingga melempar error JSON decode dan mengembalikan `NoneType`.
  - Sistem belum memanggil RAG dari MCP Server untuk memperkaya konteks chat.
* **Solusi**:
  - Ganti pemanggilan ke `call_ai_freetext` di `sajen/app/api/v1/insights.py` untuk mengembalikan teks bebas/markdown.
  - Impor dan panggil `get_rag_context(db, current_user.tenant_id, payload.message)` dari `app.services.ai_context` untuk **mengirimkan query RAG ke MCP Server** (mcp.samkarsa.com) dan melampirkan context tersebut ke system prompt LLM secara otomatis.

### 4. Perbaikan ValidationError 500 pada Response Schema Kontak
* **Masalah**: Endpoint `PUT /contacts/{contact_id}` (dan endpoint kontak lainnya) melempar error 500 karena response schema `ContactResponse` mewajibkan atribut `created_at` dan `updated_at`, sedangkan tabel database `contacts` tidak memuat kolom tersebut.
* **Solusi**: Ubah `created_at` dan `updated_at` di kelas `ContactResponse` dalam `sajen/app/schemas/inventory.py` menjadi `Optional[datetime] = None` agar FastAPI dapat menserialisasi objek dengan sukses tanpa error 500.

---

## 📅 Peta Eksekusi

1. **Langkah 1**: Perbaiki API backend `/contacts/{contact_id}` di `sajen/app/api/v1/inventory.py` untuk penanganan error FK.
2. **Langkah 2**: Perbaiki `ContactResponse` schema di `sajen/app/schemas/inventory.py` dengan menambahkan `Optional[datetime] = None`.
3. **Langkah 3**: Integrasikan `get_rag_context` RAG MCP dan `call_ai_freetext` di `/insights/chat` pada `sajen/app/api/v1/insights.py`.
4. **Langkah 4**: Perbarui modal profil di `blonjo/src/pages/master-data/SupplierPage.tsx` agar nama supplier bisa diedit/diperbarui menggunakan pilihan dropdown pemasok lainnya.
5. **Langkah 5**: Uji build, deploy ke VPS, dan verifikasi.

---
*Silakan tinjau rencana perbaikan ini. Jika Anda menyetujuinya, silakan konfirmasi "Setuju" agar saya langsung memproses perbaikan kodingnya.*
