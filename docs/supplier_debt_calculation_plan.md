# Rencana Kerja (Plan): Perhitungan Dinamis Sisa Utang Supplier dari Transaksi Tempo/Hutang

Dokumen ini berisi rencana perbaikan untuk menghitung sisa utang secara dinamis di kolom "Sisa Hutang" master data supplier berdasarkan transaksi pembelian tempo/hutang yang belum lunas.

---

## 🛠️ Masalah & Solusi yang Diusulkan

### 1. Perhitungan Kolom Sisa Hutang Supplier
* **Masalah**: Kolom sisa hutang pada tabel supplier saat ini membaca nilai statis `current_balance` dari tabel `contacts`, yang tidak tersinkronisasi otomatis dengan riwayat transaksi pembelian tempo/hutang.
* **Solusi**: 
  - Di backend pada endpoint `GET /contacts` (`sajen/app/api/v1/inventory.py`), jika tipe kontaknya adalah `supplier`, hitung nilai `current_balance` secara dinamis dari database.
  - Jumlahkan nominal (`total_amount`) dari semua transaksi pembelian (`Transaction.transaction_type == TransactionType.PURCHASE`) yang memiliki hubungan log inventaris (`InventoryLog.contact_id == supplier.id`), di mana metode pembayaran (`payment_method`) adalah belum lunas (seperti `tempo`, `hutang`, `utang`, `kredit`, `credit`, `invoice`, dll. dan bukan `lunas` atau `cash`).
  - Set nilai `current_balance` dinamis ini ke dalam objek respons kontak sebelum dikembalikan ke frontend.

---

## 📅 Peta Eksekusi

1. **Langkah 1**: Edit endpoint `get_contacts` di `sajen/app/api/v1/inventory.py` untuk mengkueri dan menjumlahkan sisa utang secara dinamis bagi kontak bertipe supplier.
2. **Langkah 2**: Deploy pembaruan backend ke VPS.
3. **Langkah 3**: Verifikasi tampilan sisa hutang di halaman master data supplier Blonjo.

---
*Silakan berikan konfirmasi "Setuju" agar saya langsung memproses perbaikan ini.*

---

## ✅ Status Implementasi — 2026-08-03

**Implementasi selesai** dengan 3 perbaikan (sesi pertama) + 1 perbaikan kritis (sesi kedua):

| Fix | File | Detail |
|-----|------|--------|
| #1 — Endpoint Fresh | `sajen/app/api/v1/inventory.py` | Tambah `GET /contacts/{contact_id}` — menghitung saldo utang fresh saat endpoint dipanggil |
| #2 — Filter log_type | `sajen/app/api/v1/inventory.py` | Tambah `InventoryLog.log_type == 'in'` pada subquery kalkulasi utang agar hanya transaksi pembelian yang masuk hitungan (bukan retur/dll) |
| #3 — Frontend refresh | `blonjo/src/pages/master-data/SupplierPage.tsx` | `handleOpenProfile` kini fetch `GET /contacts/{id}` sebelum tampilkan dialog, saldo selalu real-time |
| **#4 — Bug Kritis: Pelunasan tidak terdeteksi** | `sajen/app/api/v1/inventory.py` | Transaksi pelunasan (`pay_tx`) dibuat sebagai `EXPENSE` **tanpa InventoryLog** — contact_id = NULL. Subquery via `InventoryLog.contact_id` tidak pernah menangkap tx pelunasan, sehingga debit 2-1101 tidak dikurangi dari total utang. Fix: strategi 2-query — (1) kredit dari tx pembelian, (2) debit dari tx pelunasan yang ditemukan via `description CONTAINS ref_no` pembelian. |

**Root Cause utama (final):** Transaksi pelunasan hutang tidak memiliki `InventoryLog`, sehingga tidak bisa diidentifikasi via `contact_id`. Solusinya: lacak via `reference_no` nota pembelian yang tercantum di `description` transaksi pelunasan (`"Pelunasan Utang untuk Nota {ref_no}"`).


