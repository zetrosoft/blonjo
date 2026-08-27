# Plan: Penggunaan Akun "Modal Pemilik" Khusus Pengembalian Modal Tunai

## 📋 Ringkasan Permintaan
Pengguna menginstruksikan untuk menggunakan akun **Modal Pemilik** (`3-1101` / `"Modal Pemilik"`) secara langsung untuk transaksi **Pengembalian Modal Tunai**, tanpa mengarahkan/menggunakan akun Prive (`3-1401`).

Efek Jurnal Pengembalian Modal Tunai:
- **Debet**: Modal Pemilik (Akun `3-1101`)
- **Kredit**: Kas / Bank (Akun `1-1101` / `1-1102`)

---

## 🎯 Target Perubahan

### 1. Backend (`sajen`)
- **`app/services/accounting.py`**:
  - Pada penanganan `TransactionType.CAPITAL` saat `is_withdrawal = True`, langsung ambil akun **`3-1101` (Modal Pemilik)** tanpa mencari `3-1401` terlebih dahulu.

### 2. Frontend (`blonjo`)
- **`src/pages/transaction/hooks/useSmartConfirm.ts`**:
  - Pada `buildDefaultEntries`, sesuaikan `capitalDebit` saat `isCapitalWithdrawal = True` untuk memprioritaskan kata kunci `['modal']` (Modal Pemilik).

---

## 🧪 Rencana Pengujian
1. Input transaksi Smart Note: `"Pengembalian penyertaan modal usaha 1.000.000 tunai"`.
2. Verifikasi entri jurnal:
   - **Debet**: Modal Pemilik (Rp1.000.000)
   - **Kredit**: Kas (Rp1.000.000)

---

## 🚀 Deployment Plan
1. Re-build dan Deploy UI frontend: `./deploy.sh blonjo-ui`
2. Deploy backend service API: `./deploy.sh sajen`

---

## 📝 Changelog

### 2026-08-17 - Penggunaan Akun "Modal Pemilik" (3-1101) Langsung untuk Pengembalian Modal Tunai
- **Frontend (`blonjo`)**:
  - `src/pages/transaction/hooks/useSmartConfirm.ts`: Memperbarui `capitalDebit` agar memprioritaskan kata kunci `"modal pemilik"` (`3-1101`) secara langsung untuk pengembalian modal tunai.
- **Backend (`sajen`)**:
  - `app/services/accounting.py`: Memperbarui fungsi `generate_suggested_entries` pada transaksi `CAPITAL` penarikan modal (`is_withdrawal`) agar langsung menetapkan akun **`3-1101` (Modal Pemilik)** di posisi **Debet**.

