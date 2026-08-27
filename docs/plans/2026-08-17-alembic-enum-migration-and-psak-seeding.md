# Plan: Migration Alembic Postgres Enum & Seeding Mapping Jurnal Dinamis

## 📋 Ringkasan Masalah & Bukti Log Database
Saat mengeksekusi penyemaian data pemetaan jurnal dinamis di database server:
```text
psycopg2.errors.InvalidTextRepresentation: invalid input value for enum transactiontype: "CAPITAL_WITHDRAWAL"
```
Penyebab:
Tipe ENUM `transactiontype` pada PostgreSQL database di server VPS belum memiliki nilai enum baru (`CUSTOMER_WITHDRAWAL`, `CUSTOMER_DEPOSIT`, `CAPITAL_RECLASSIFICATION`, `CAPITAL_WITHDRAWAL`, `PURCHASE_RETURN`, `SALES_RETURN`).

---

## 🎯 Target Perubahan

### Backend (`sajen`)
1. **Alembic Migration Script (`sajen/migrations/versions/e8492040fbc9_add_all_enum_values_to_transactiontype.py`)**:
   - Buat file migrasi baru untuk mengeksekusi `ALTER TYPE transactiontype ADD VALUE` secara aman (autocommit block) untuk seluruh nilai enum baru:
     - `CAPITAL_WITHDRAWAL`
     - `CAPITAL_RECLASSIFICATION`
     - `CUSTOMER_DEPOSIT`
     - `CUSTOMER_WITHDRAWAL`
     - `PURCHASE_RETURN`
     - `SALES_RETURN`

2. **Database Seeding di VPS Server**:
   - Setelah deployment & migrasi Alembic berhasil, jalankan `python -m app.seed_psak_complete` di container VPS server untuk menyemai seluruh aturan jurnal dinamis ke dalam tabel `journal_mappings` & `journal_mapping_lines`.

---

## 🧪 Rencana Pengujian
1. Deploy backend API: `./deploy.sh sajen`.
2. Verifikasi migrasi Alembic berjalan sukses saat container up.
3. Jalankan penyemaian di VPS: `ssh vps-server "cd ~/jualan && docker compose --env-file .env.production -f docker-compose.prod.yml -p jualan exec -T sajen-api python -m app.seed_psak_complete"`.
4. Tes input Smart Note `"Penarikan Tabungan palanggan Nana sebanyak 1.000.000 secara tunai"` dan pastikan usulan jurnal otomatis 100% dibaca dari database.

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
2. Eksekusi `seed_psak_complete` via SSH pada VPS
