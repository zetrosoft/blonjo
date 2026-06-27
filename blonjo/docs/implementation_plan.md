# Implementasi Menu Sidebar dan i18n

## Goal Description
Menambahkan struktur menu baru pada aplikasi Blonjo:
- Memindahkan halaman transaksi ke submenu **Input Transaksi** di bawah menu **Transaksi**.
- Menambahkan submenu **Daftar Input** untuk menampilkan riwayat transaksi dari berbagai sumber.
- Membuat menu **Master Data** dengan submenu **Item**, **Supplier**, **Customer**, **UoM**.
- Mengintegrasikan dukungan i18n (bahasa Indonesia & Inggris) untuk semua label menu baru.

## User Review Required
> [!IMPORTANT] Pastikan label menu menggunakan terjemahan yang tepat dan konsisten dengan file i18n yang ada. Jika ada konflik nama, konfirmasikan.

## Open Questions
- Apakah ikon khusus diperlukan untuk tiap submenu? (Jika ya, deskripsikan ikon yang diinginkan.)
- Apakah halaman **Daftar Input** akan menampilkan data yang sudah ada atau memerlukan endpoint API baru? (Asumsikan data sudah tersedia di store.)

## Proposed Changes
---
### Component: Sidebar / Navigation
#### [MODIFY] [Sidebar.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/components/layout/Sidebar.tsx)
- Tambahkan struktur menu baru dengan nested items.
- Gunakan komponen **NavItem** atau **NavGroup** yang sudah ada.
- Pastikan state `active` menyesuaikan route baru (e.g., `/transaksi/input-transaksi`).
- Gunakan ikon tema finance yang konsisten dengan menu lain (misalnya `ChartBar` dari Heroicons).

#### [NEW] [InputTransaksiPage.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/transaction/input-transaksi.tsx)
- Buat halaman baru yang menampilkan form input transaksi (sudah ada) dan daftar riwayat.

#### [NEW] [DaftarInputPage.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/transaction/daftar-input.tsx)
- Tampilkan tabel atau list dari transaksi yang di‑import dari berbagai sumber.

#### [NEW] [MasterDataLayout.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/master-data/layout.tsx)
- Layout wrapper untuk submenu master data.

#### [NEW] [ItemPage.tsx, SupplierPage.tsx, CustomerPage.tsx, UomPage.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/master-data/)
- Placeholder halaman masing‑masing dengan tabel CRUD.

---
### i18n Integration
#### [MODIFY] [i18n.ts](file:///Users/user/kerjaan/jualan/blonjo/src/lib/i18n.ts)
- Tambahkan entri baru untuk label menu:
  ```json
  "menu": {
    "transaksi": "Transaksi",
    "inputTransaksi": "Input Transaksi",
    "daftarInput": "Daftar Input",
    "masterData": "Master Data",
    "item": "Item",
    "supplier": "Supplier",
    "customer": "Customer",
    "uom": "UoM"
  }
  ```
- Pastikan terjemahan bahasa Inggris juga ditambahkan.

#### [MODIFY] UI Components
- Ganti teks hard‑coded pada Sidebar dengan `t('menu.transaksi')`, `t('menu.inputTransaksi')`, dll.

## Verification Plan
### Automated Tests
- Jalankan `npm run test` untuk memastikan tidak ada regresi pada routing.
- Tambahkan unit test pada `Sidebar.test.tsx` untuk memeriksa render menu.

### Manual Verification
- Buka aplikasi di browser, pastikan menu baru muncul, dapat menavigasi ke halaman **Input Transaksi**, **Daftar Input**, dan submenu **Master Data**.
- Ubah bahasa menggunakan toggle yang ada, pastikan semua label berubah sesuai i18n.
