# **Panduan Lengkap Pemetaan Jurnal Otomatis (PSAK)**

Dokumen ini berisi referensi pemetaan jurnal otomatis (*GL Mapper*) berdasarkan standar PSAK (Pernyataan Standar Akuntansi Keuangan) untuk berbagai modul operasional dalam ekosistem ERP (Retail, Wholesale, Manufaktur, dan HR/Payroll).

Pemetaan ini mendefinisikan *event trigger* (dokumen sumber) beserta konfigurasi akun Debit dan Kredit yang terdampak, mulai dari *single pair* (2 akun) hingga *multi-pair* (compound entry).

## **1\. Siklus Pembelian & Hutang (Procure-to-Pay)**

Siklus ini mencakup pengadaan barang (baik untuk dijual kembali maupun untuk produksi) hingga pelunasan tagihan ke *supplier*.

### **1.1. Penerimaan Barang Gudang (*Purchase Receipt*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Barang fisik telah masuk ke gudang, namun *invoice* dari *supplier* belum diterima. Sistem harus mencatat aset fisik dan liabilitas sementara.

* **Debit:** Persediaan Barang (Aset) \- *Senilai harga modal barang masuk.*  
* **Kredit:** Hutang Belum Ditagih / Hutang Penerimaan Barang (Liabilitas)

### **1.2. Penerimaan Tagihan *Supplier* (*Purchase Invoice*)**

**Tipe:** *Multi Pair* (Compound)

**Konteks:** *Invoice* resmi dari *supplier* diterima. Jika sebelumnya ada *Purchase Receipt*, akun "Hutang Belum Ditagih" akan dibalik. Contoh ini mengasumsikan adanya PPN Masukan.

* **Debit:** Hutang Belum Ditagih (Liabilitas) \- *Membalik jurnal penerimaan barang.*  
* **Debit:** PPN Masukan (Aset / Pajak Dibayar di Muka) \- *Senilai pajak dari supplier.*  
* **Kredit:** Hutang Usaha (Liabilitas) \- *Total nilai yang harus dibayar (Barang \+ PPN).*

*(Catatan: Jika dokumen Purchase Receipt dan Purchase Invoice digabung, jurnalnya langsung Debit: Persediaan, Debit: PPN, Kredit: Hutang Usaha).*

### **1.3. Pembayaran Hutang (*Payment Entry / Outgoing*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Eksekusi transfer bank atau kas keluar untuk melunasi tagihan *supplier*.

* **Debit:** Hutang Usaha (Liabilitas) \- *Berkurangnya beban hutang.*  
* **Kredit:** Kas / Bank (Aset) \- *Keluarnya dana dari perusahaan.*

### **1.4. Retur Pembelian (*Purchase Return / Debit Note*)**

**Tipe:** *Multi Pair* (Compound)

**Konteks:** Barang dikembalikan ke *supplier* karena rusak/tidak sesuai. Tagihan hutang otomatis berkurang.

* **Debit:** Hutang Usaha (Liabilitas) \- *Hutang berkurang karena retur.*  
* **Kredit:** Persediaan Barang (Aset) \- *Stok keluar gudang (dikembalikan).*  
* **Kredit:** PPN Masukan (Aset) \- *Penyesuaian nilai pajak atas retur.*

## **2\. Siklus Penjualan & Piutang (Order-to-Cash)**

Menggunakan metode **Perpetual**, sehingga nilai HPP (*Cost of Goods Sold*) dan pengurangan persediaan langsung dicatat pada saat transaksi penjualan terjadi.

### **2.1. Penjualan Tunai / POS Kasir (*Cash Sales*)**

**Tipe:** *Multi Pair* (Compound)

**Konteks:** Transaksi harian kasir (B2C) di mana uang langsung diterima.

* **Debit:** Kas / Bank (Aset) \- *Penerimaan uang masuk (Nilai Jual).*  
* **Debit:** Harga Pokok Penjualan (Beban) \- *Nilai modal barang yang terjual.*  
* **Kredit:** Pendapatan Penjualan (Pendapatan) \- *Pengakuan omzet dasar.*  
* **Kredit:** Persediaan Barang (Aset) \- *Pengurangan nilai aset di gudang.*  
  *(Jika ada PPN, tambahkan Kredit: PPN Keluaran).*

### **2.2. Faktur Penjualan Tempo (*Sales Invoice \- B2B*)**

**Tipe:** *Multi Pair* (Compound)

**Konteks:** Penjualan ke pihak lain dengan skema hutang piutang (kredit).

* **Debit:** Piutang Usaha (Aset) \- *Nilai tagihan utuh kepada customer (Barang \+ PPN).*  
* **Debit:** Harga Pokok Penjualan (Beban) \- *Nilai modal.*  
* **Kredit:** Pendapatan Penjualan (Pendapatan) \- *Omzet dasar.*  
* **Kredit:** PPN Keluaran (Liabilitas) \- *Pajak yang dipungut dari customer.*  
* **Kredit:** Persediaan Barang (Aset) \- *Stok keluar.*

### **2.3. Penerimaan Pembayaran (*Payment Receipt / Incoming*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** *Customer* mentransfer uang untuk melunasi piutang.

* **Debit:** Kas / Bank (Aset)  
* **Kredit:** Piutang Usaha (Aset)

### **2.4. Retur Penjualan (*Sales Return / Credit Note*)**

**Tipe:** *Multi Pair* (Compound)

**Konteks:** Pelanggan mengembalikan barang. Piutang dan omzet harus dikoreksi.

* **Debit:** Retur Penjualan (Pendapatan Kontra) \- *Atau potong langsung Pendapatan Penjualan.*  
* **Debit:** PPN Keluaran (Liabilitas) \- *Koreksi pajak.*  
* **Debit:** Persediaan Barang (Aset) \- *Barang kembali masuk ke gudang.*  
* **Kredit:** Piutang Usaha / Kas (Aset / Liabilitas) \- *Mengurangi tagihan atau refund uang.*  
* **Kredit:** Harga Pokok Penjualan (Beban) \- *Membalik nilai HPP.*

## **3\. Siklus Persediaan & Produksi (Manufaktur / Assembling)**

Siklus ini melacak transformasi aset (dari bahan mentah ke barang jadi).

### **3.1. Pemakaian Bahan Baku (*Material Issue / Stock Entry \- Manufacture*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Memindahkan bahan mentah (*Raw Material*) ke area produksi (*Work in Progress* / WIP).

* **Debit:** Persediaan Barang Dalam Proses / WIP (Aset)  
* **Kredit:** Persediaan Bahan Baku (Aset)

### **3.2. Pencatatan Biaya Produksi Langsung (*Direct Cost Application*)**

**Tipe:** *Multi Pair* (Compound)

**Konteks:** Mengalokasikan gaji buruh harian dan biaya utilitas (*overhead*) pabrik ke dalam nilai barang proses (WIP).

* **Debit:** Persediaan Barang Dalam Proses / WIP (Aset)  
* **Kredit:** Biaya Tenaga Kerja Langsung (Beban / Liabilitas Gaji)  
* **Kredit:** Biaya Overhead Pabrik yang Dibebankan (Beban Kontra)

### **3.3. Penyelesaian Produksi (*Finished Goods Receipt*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Proses produksi selesai, nilai seluruh WIP dipindahkan menjadi Barang Jadi siap jual.

* **Debit:** Persediaan Barang Jadi (Aset)  
* **Kredit:** Persediaan Barang Dalam Proses / WIP (Aset)

### **3.4. Penyesuaian / Selisih Stok Gudang (*Stock Reconciliation*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Hasil *Stock Opname* menunjukkan ada selisih kurang antara sistem vs fisik (contoh: barang hilang/rusak).

* **Debit:** Beban Selisih/Kerusakan Persediaan (Beban)  
* **Kredit:** Persediaan Barang (Aset)  
  *(Catatan: Jika fisik lebih banyak dari sistem, jurnalnya dibalik).*

## **4\. Siklus HR, Payroll & Jurnal Umum (General Ledger)**

Transaksi rutin non-operasional harian yang umumnya diproses akhir bulan.

### **4.1. Pengakuan Gaji Akhir Bulan (*Payroll Accrual*)**

**Tipe:** *Multi Pair* (Compound)

**Konteks:** Menjelang *payday* (misal tanggal 28), bagian *Finance* mengakui total beban *payroll* perusahaan beserta potongan-potongannya, sebelum transfer bank dilakukan.

* **Debit:** Beban Gaji & Upah (Beban) \- *Total Gaji Pokok.*  
* **Debit:** Beban Tunjangan (Beban) \- *Tunjangan makan, transport, dll.*  
* **Kredit:** Hutang PPh 21 (Liabilitas) \- *Pajak pegawai yang dipotong perusahaan.*  
* **Kredit:** Hutang BPJS Tenaga Kerja & Kesehatan (Liabilitas) \- *Potongan premi BPJS.*  
* **Kredit:** Hutang Gaji / Gaji yang Masih Harus Dibayar (Liabilitas) \- *Total nilai bersih (Take Home Pay).*

### **4.2. Pencairan Gaji (*Payroll Payment*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** *Finance* mengeksekusi transfer bank masal (misal tanggal 1).

* **Debit:** Hutang Gaji (Liabilitas)  
* **Kredit:** Kas / Bank (Aset)

### **4.3. Penyusutan Aset Tetap (*Depreciation Entry*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Jurnal otomatis bulanan untuk menyusutkan nilai kendaraan, bangunan, mesin, atau komputer (Aset Tetap).

* **Debit:** Beban Penyusutan (Beban)  
* **Kredit:** Akumulasi Penyusutan Aset Tetap (Aset Kontra)

### **4.4. Transaksi Kas Kasir / Kas Bon (*Petty Cash Advance*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Karyawan meminjam kas kecil untuk keperluan mendesak (belum ada struk belanja definitif).

* **Debit:** Piutang Karyawan / Uang Muka Operasional (Aset)  
* **Kredit:** Kas Kecil (Aset)

### **4.5. Pertanggungjawaban Kas Bon (*Expense Claim / Settlement*)**

**Tipe:** *Single Pair* (1 Debit, 1 Kredit)

**Konteks:** Karyawan menyerahkan struk belanja untuk melunasi kas bon.

* **Debit:** Beban Operasional / ATK (Beban)  
* **Kredit:** Piutang Karyawan / Uang Muka Operasional (Aset)