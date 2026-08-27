# Blueprint: Penyempurnaan Arsitektur RAG & MCP Server (Modul Transaksi)
**Architectural Recommendation** · `docs/plans/mcp_transaction_alignment.md`

---

> [!NOTE]
> Dokumen ini dirancang untuk menyelaraskan modul transaksi di **Sajen API** dengan **MCP Server Hub (`mcp.samkarsa.com`)** secara bertahap (*Zero-Breaking-Change*). Semua rekomendasi di bawah ini mempertahankan jalur *fallback* lokal yang sudah stabil.

---

## 1. Masalah Utama & Dampak

```
[Sajen API] ──(Kirim Context COA Mentah via JSON)──▶ [MCP Server (Stateless)]
    │                                                        │
    │ (Selalu parsing ulang & pop("type") manual)           │ (Hanya rakit prompt)
    ▼                                                        ▼
[DB PostgreSQL Sajen]                                  [Gemini / Ollama]
```

1. **API Contract Mismatch**: MCP mengembalikan field `"type"` sementara Sajen membutuhkan `"transaction_type"`. Hal ini memaksa backend Sajen melakukan re-mapping manual (`pop("type")`).
2. **Duplikasi Logika Context**: Logika perakitan string daftar akun (COA) masih diproses di internal Sajen, mengotori repositori API dengan urusan penulisan teks prompt.
3. **Bypass Database Vektor MCP**: Database `mcp_hub_db` (tabel `knowledge_vectors`) tidak diakses oleh tool `parse_transaction` di MCP.

---

## 2. Rekomendasi Solusi & Rencana Langkah (Step-by-Step)

### Langkah 1: Penyelarasan Skema Tool `parse_transaction` di MCP Server
**Lokasi Perubahan:** `mcp-server/src/tools/transactionParser.ts` & `index.ts`
- **Tindakan**: Tambahkan field `"transaction_type"` sebagai alias / pengganti `"type"` pada system prompt instruksi LLM dan output format contoh.
- **Dampak Aman**: LLM akan mengembalikan `"transaction_type"` secara langsung. Kode patch di Sajen (`final_parsed_data.pop("type")`) tetap dipertahankan sementara waktu sebagai jembatan kompatibilitas ke belakang (backward compatibility).

### Langkah 2: Migrasi Logika Klasifikasi COA ke MCP Server (Targeted RAG)
**Lokasi Perubahan:** `mcp-server/src/tools/transactionParser.ts`
- **Tindakan**: 
  1. Manfaatkan koneksi database `pool` PostgreSQL yang sudah ada di MCP Server (`pool.query`).
  2. Saat tool `parse_transaction` dipanggil, jika parameter `context.coa` kosong, MCP Server dapat melakukan query mandiri ke tabel `accounts` di database `mcp_hub_db` berdasarkan `tenant_id` untuk mendapatkan daftar COA terfilter.
- **Keuntungan**: Sajen API tidak perlu lagi mengirimkan teks string COA yang panjang lewat request payload HTTP. Cukup mengirimkan `tenant_id` lewat header/metadata, dan MCP akan merakit context COA secara mandiri menggunakan database.

### Langkah 3: Integrasi pgvector Search pada Pemrosesan Transaksi Kompleks
**Lokasi Perubahan:** `mcp-server/src/index.ts` (Tool `parse_transaction`)
- **Tindakan**:
  1. Jika teks input transaksi berukuran panjang (> 60 karakter), jalankan pencarian kemiripan vektor menggunakan service `searchVectorContext` yang sudah ada di MCP Server.
  2. Suntikkan hasil kemiripan dokumen SOP/FAQ dari `knowledge_vectors` ke prompt LLM sebelum parsing.
- **Keuntungan**: RAG benar-benar terpusat di MCP Server. Sajen tidak perlu lagi memanggil database vector lokal untuk urusan parsing teks.

### Langkah 4: Delegasi Cek Bebas Pajak (PPN) Berbasis Vektor ke MCP Server
**Lokasi Perubahan:** `sajen/app/services/accounting.py` (`check_tax_exempt_via_vector`) & `mcp-server/src/tools/transactionParser.ts`
- **Tindakan**:
  1. Integrasikan model logika penentuan bebas pajak (exemption detection) ke dalam tool `parse_transaction` di MCP Server.
  2. MCP Server akan mengevaluasi nama item menggunakan database pgvector miliknya secara langsung dan mengembalikan properti Boolean `"is_tax_exempt"` di dalam JSON response.
- **Keuntungan**: Menghapus duplikasi komputasi embedding model lokal di Sajen API, sehingga menekan utilisasi CPU/RAM di VPS dan memangkas request latency.

### Langkah 5: Penjaminan Konsistensi `payment_method` untuk Interceptor Piutang/Hutang
**Lokasi Perubahan:** `mcp-server/src/tools/transactionParser.ts`
- **Tindakan**: Pastikan prompt LLM di MCP Server secara eksplisit dilatih untuk mengekstrak kata kunci metode pembayaran (`cash`, `transfer`, `qris`, `hutang`, `tempo`, `kredit`) ke dalam property `"payment_method"`.
- **Dampak Penting**: Nilai `"payment_method"` ini dibutuhkan oleh fungsi `get_auto_journal_entries` di Sajen untuk mengalihkan jurnal dari Kas/Bank ke Hutang Dagang (2-1101) atau Piutang Usaha (1-1201). Jika LLM gagal memparsing field ini, mapping jurnal tempo/kredit otomatis akan patah.

### Langkah 6: Sinkronisasi Feedback Koreksi OCR ke MCP Training Pipeline
**Lokasi Perubahan:** `blonjo/src/pages/transaction/hooks/useSmartConfirm.ts` (API call `/ocr/tasks/{id}/correct`)
- **Tindakan**: Di masa depan, endpoint koreksi struk ini harus mengirimkan data langsung ke MCP Server database untuk retraining template ekstraksi OCR, bukan hanya memperbarui status DB lokal Sajen.

---

## 3. Matriks Dampak Sistem (Impact Assessment)

| Modul / Komponen | Terpengaruh? | Dampak Potensial | Cara Mitigasi |
|---|---|---|---|
| **Sajen API (`accounting.py` & `services/accounting.py`)** | Ya | Fungsi `check_tax_exempt_via_vector` lokal akan dimatikan (deprecated) dan digantikan oleh flag `"is_tax_exempt"` kiriman MCP. | Pertahankan logika fallback lokal jika flag `"is_tax_exempt"` tidak ditemukan dalam response. |
| **Sajen Database** | Tidak | Tidak ada perubahan skema database PostgreSQL di sisi Sajen. | — |
| **MCP Server (`mcp-backend`)** | Ya | Penambahan tanggung jawab deteksi PPN dan standarisasi field JSON output. | Integrasikan pengecekan PPN ke prompt system instruction di `transactionParser.ts`. |
| **Blonjo UI (`Transactions.tsx`)** | Tidak | UI tetap menerima JSON terstruktur seperti biasa. | — |

---

## 4. Prioritas Eksekusi

1. **Prioritas 1 (Mendesak)**: 
   - Update system prompt `transactionParser.ts` di MCP Server agar menghasilkan properti `"transaction_type"` menggantikan `"type"`.
   - Latih LLM mengekstrak `"payment_method"` secara konsisten untuk mengamankan interceptor Hutang/Piutang.
2. **Prioritas 2 (Menengah)**: Delegasikan query COA tenant ke DB `mcp_hub_db` melalui `pool` koneksi internal MCP Server.
3. **Prioritas 3 (Jangka Panjang)**: 
   - Pindahkan logika deteksi bebas pajak PPN (`is_tax_exempt` vector similarity) ke MCP Server.
   - Pindahkan pemanggilan embedding vector RAG dari Sajen ke dalam internal handler tool di MCP Server.
   - Sambungkan API feedback OCR (`/correct`) ke pipeline parser MCP.

