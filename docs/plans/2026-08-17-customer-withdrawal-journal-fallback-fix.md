# Plan: Automatic Code Fallback & Seeding untuk Customer Withdrawal Journal

## 📋 Ringkasan Masalah
Saat memasukkan kalimat Smart Note:
`"Penarikan Tabungan palanggan Nana sebanyak 1.000.000 secara tunai"`
Hasil ekstraksi parser mengidentifikasi transaksi sebagai `customer_withdrawal` secara tepat, namun entri usulan jurnal tidak muncul (`suggested_entries = []`).

Penyebab:
Fungsi `get_auto_journal_entries` di `sajen/app/services/accounting.py` saat ini belum memiliki *code fallback handler* untuk tipe transaksi `CUSTOMER_WITHDRAWAL`, `CUSTOMER_DEPOSIT`, dan `CAPITAL_RECLASSIFICATION` jika baris pemetaan di tabel DB `journal_mappings` belum ada/terbentuk di tenant aktif.

---

## 🎯 Target Perubahan

### Backend (`sajen`)
1. **`sajen/app/services/accounting.py`**:
   - Tambahkan *Code Fallback Handler* pada `get_auto_journal_entries`:
     - **`CUSTOMER_WITHDRAWAL`**: Debet `2-1206` (Simpanan / Titipan Dana Pelanggan), Kredit `1-1101` (Kas) / `1-1102` (Bank).
     - **`CUSTOMER_DEPOSIT`**: Debet `1-1101` (Kas) / `1-1102` (Bank), Kredit `2-1206` (Simpanan / Titipan Dana Pelanggan).
     - **`CAPITAL_RECLASSIFICATION`**: Debet `3-1101` (Modal Pemilik), Kredit `2-1206` (Simpanan / Titipan Dana Pelanggan).

2. **`sajen/app/seed_psak_complete.py`**:
   - Update `seed_psak_complete` agar mempopulasikan mapping `CUSTOMER_WITHDRAWAL`, `CUSTOMER_DEPOSIT`, dan `CAPITAL_RECLASSIFICATION` secara komprehensif baik untuk `tenant_id = 1` maupun global fallback (`tenant_id = None`).

---

## 🧪 Rencana Pengujian
1. Update kode `accounting.py` & `seed_psak_complete.py`.
2. Deploy backend: `./deploy.sh sajen`.
3. Jalankan seed database di VPS via SSH: `ssh vps-server "cd ~/jualan && docker compose --env-file .env.production -f docker-compose.prod.yml -p jualan exec -T sajen-api python app/seed_psak_complete.py"`.
4. Tes input Smart Note `"Penarikan Tabungan palanggan Nana sebanyak 1.000.000 secara tunai"` dan verifikasi usulan jurnal otomatis (Debet 2-1206 1.000.000, Kredit 1-1101 1.000.000) langsung muncul dengan sempurna.

---

## 🚀 Deployment Plan
1. Deploy backend API: `./deploy.sh sajen`
2. Jalankan seed DB di VPS
