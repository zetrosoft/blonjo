# Plan: Penanganan Jurnal Pengembalian / Penarikan Modal Pemilik (Prive)

## 📋 Ringkasan Masalah
Saat pengguna memasukkan transaksi **Pengembalian Penyertaan Modal / Penarikan Modal Pemilik (Prive)**, aplikasi `blonjo` dan `sajen` saat ini secara *default* menjurnal transaksi tersebut sebagai **Injeksi / Tambah Modal**:
- **Kas**: Debet
- **Modal Pemilik**: Kredit

Padahal untuk transaksi **Pengembalian Modal / Penarikan Modal Tunai**, uang kas bertambah keluar sehingga posisi jurnal yang akurat adalah:
- **Modal Pemilik / Prive**: Debet (Ekuitas Berkurang)
- **Kas / Bank**: Kredit (Aset Berkurang)

---

## 🎯 Target Perubahan

### 1. Frontend (`blonjo`)
- **`src/lib/smartParser.ts`**:
  - Tambahkan pengenalan kata kunci penarikan/pengembalian modal: `"pengembalian modal"`, `"penarikan modal"`, `"tarik modal"`, `"prive"`, `"ambil modal"`, `"withdraw modal"`.
  - Atur deskripsi default transaksi jika terdeteksi penarikan modal menjadi `"Pengembalian Modal Pemilik"` / `"Penarikan Modal (Prive)"`.
- **`src/pages/transaction/hooks/useSmartConfirm.ts`**:
  - Perbarui fungsi `buildDefaultEntries`: Jika transaksi tipe `capital` mengandung indikator penarikan modal (withdrawal), balik posisi jurnal otomatis:
    - **Debet**: Modal Pemilik / Prive (`['prive', 'modal']`)
    - **Kredit**: Kas / Bank (`['kas', 'bank']`)

### 2. Backend (`sajen`)
- **`app/services/accounting.py`**:
  - Perbarui fungsi `generate_suggested_entries` pada penanganan `TransactionType.CAPITAL`.
  - Cek jika `description` atau `text` mengandung kata kunci penarikan modal (`"tarik"`, `"pengembalian"`, `"penarikan"`, `"prive"`, `"withdraw"`).
  - Jika ya, balik entri suggested journal:
    - **Debet**: Account `3-1101` (Modal Pemilik) atau `3-1401` (Prive / Dividen)
    - **Kredit**: Account `1-1101` (Kas) atau `1-1102` (Bank)
- **`app/services/smart_parser.py`**:
  - Tambahkan kata kunci penarikan/pengembalian modal ke `KEYWORDS_CAPITAL` serta aturan di prompt LLM agar mengenali konteks arah arus kas modal (Setoran vs Penarikan).

---

## 🧪 Rencana Pengujian
1. Memasukkan teks smart note: `"Pengembalian penyertaan modal usaha 1.000.000 tunai"`
2. Memverifikasi entri jurnal otomatis di modal konfirmasi:
   - Debet: Modal Pemilik (Rp1.000.000)
   - Kredit: Kas (Rp1.000.000)
3. Memasukkan teks smart note setoran modal: `"Setor modal toko 2.000.000 via kas"`
4. Memverifikasi entri jurnal setoran modal tetap normal:
   - Debet: Kas (Rp2.000.000)
   - Kredit: Modal Pemilik (Rp2.000.000)

---

## 🚀 Deployment Plan
1. Re-build dan Deploy UI frontend: `./deploy.sh blonjo-ui`
2. Deploy backend service API: `./deploy.sh sajen`

---

## 📝 Changelog

### 2026-08-17 - Penanganan Jurnal Pengembalian / Penarikan Modal (Prive)
- **Frontend (`blonjo`)**:
  - `src/lib/smartParser.ts`: Menambahkan pengenalan kata kunci penarikan/pengembalian modal (`"pengembalian modal"`, `"penarikan modal"`, `"tarik modal"`, `"prive"`, `"withdraw modal"`, dll.) serta mengatur prefix deskripsi otomatis `"Pengembalian Modal Pemilik"`.
  - `src/pages/transaction/hooks/useSmartConfirm.ts`: Memperbarui `buildDefaultEntries` dan `open` agar membalik entri jurnal menjadi **Debet: Modal Pemilik / Prive** dan **Kredit: Kas / Bank** jika transaksi modal terdeteksi sebagai pengembalian/penarikan.
- **Backend (`sajen`)**:
  - `app/services/accounting.py`: Memperbarui fungsi `generate_suggested_entries` untuk `TransactionType.CAPITAL` agar mengecek arah transaksi. Jika penarikan modal, menggunakan akun `3-1401` (Prive / Dividen) atau `3-1101` di Debet dan Kas/Bank di Kredit.
  - `app/services/smart_parser.py`: Memperbarui `KEYWORDS_CAPITAL` agar mencakup variasi kata kunci penarikan/pengembalian modal.

