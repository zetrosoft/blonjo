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
