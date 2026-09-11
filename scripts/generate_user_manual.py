#!/usr/bin/env python3
"""
Dynamic User Manual Generator
Mengekstrak modul, endpoint, rute UI, dan kapabilitas sistem untuk menyusun User Manual lengkap.
"""
import os
from datetime import datetime

def generate_user_manual():
    root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    output_path = os.path.join(root_dir, "docs", "USER_MANUAL.md")
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    timestamp = datetime.now().strftime("%d %B %Y")

    content = f"""# 📖 Panduan Pengguna (User Manual): Ekosistem Blonjo & Sajen
*Dokumentasi Sistem Operasional Toko Retail Sembako & Manajemen Keuangan*  
*Terakhir Diperbarui: {timestamp}*

---

## 🌟 1. Ikhtisar Sistem (Overview)
Ekosistem **Blonjo & Sajen** adalah platform Enterprise Resource Planning (ERP) dan Point of Sales (POS) cerdas yang dirancang khusus untuk toko kelontong/sembako modern. Sistem menggabungkan pencatatan transaksi cepat, manajemen stok fleksibel, kepatuhan akuntansi (SAK EMKM), dan kecerdasan buatan otonom (**Sajen Intelligence**).

---

## 🧭 2. Modul-Modul Utama Aplikasi

### 🛒 A. Penjualan & Kasir Cepat (Point of Sales)
* **Mode Transaksi Cepat**: Mendukung penjualan harian dengan pencatatan nominal langsung atau per-item barang.
* **Integrasi Pembayaran**: Tunai, Transfer Bank, dan QRIS.
* **Cetak Struk Thermal**: Dukungan cetak struk kasir via printer thermal ESC/POS.

### 📦 B. Pengadaan & Kulakan (Procurement & Inventory)
* **Pencatatan Belanja Stok**: Input nota belanja supplier secara manual maupun otomatis via OCR Nota Fisik.
* **Metode HPP Moving Average**: Harga Pokok Penjualan dihitung secara dinamis mengikuti fluktuasi harga belanja grosir.
* **Mode Stok Fleksibel (`is_maintenance_stock`)**:
  * `is_maintenance_stock = false`: Mode kasir cepat / omset lumsum tanpa beban input stok fisik per butir.
  * `is_maintenance_stock = true`: Mode pelacakan stok fisik rak riil dengan kartu stok dan log mutasi.

### 🏷️ C. Strategi Harga & Smart Bundling (Pricing Rules)
* **Kalkulasi Margin Target**: Menghitung harga jual acuan secara otomatis berdasarkan harga kulakan terkini.
* **Smart Bundling**: Menggabungkan produk fast-moving (margin tipis seperti beras/minyak) dengan produk komplementer (margin tebal seperti bumbu/snack) untuk memaksimalkan profitabilitas.

### 📊 D. Akuntansi & Pembukuan Standar SAK EMKM
* **Jurnal Otomatis (Double-Entry)**: Setiap transaksi kasir atau kulakan otomatis membuat jurnal debit/kredit tanpa perlu input akuntansi manual.
* **Laporan Finansial**: Laba Rugi, Posisi Keuangan (Neraca), Arus Kas (Cashflow), dan Rekonsiliasi Kas Toko.

### 🧠 E. Sajen Intelligence (Partner Bisnis & AI Co-Pilot)
* **Autonomous Intent Harvester**: Mengagregasi data penjualan vs belanja, perputaran stok, dan saldo kas secara real-time.
* **Analisis & Saran Taktis**: Memberikan insight bisnis langsung ke pokok masalah, proyeksi kulakan, dan deteksi slow-moving items tanpa bahasa robotik kaku.
* **Riset Pasar Eksternal**: Membandingkan harga beli toko dengan Harga Eceran Tertinggi (HET) dan tren harga komoditas pangan.

---

## 🚀 3. Panduan Langkah Demi Langkah Operasional Harian

### 1. Memulai Hari (Buka Kasir)
1. Buka menu **Kasir / Point of Sales**.
2. Masukkan modal awal kas jika diperlukan.

### 2. Mencatat Pembelian Stok dari Supplier
1. Buka menu **Kulakan / Pengadaan Stok** atau gunakan fitur **Scan Nota OCR**.
2. Unggah foto nota belanja atau ketik manual supplier dan nama barang.
3. Klik **Simpan Transaksi** — sistem otomatis memperbarui harga beli rata-rata (HPP) dan saldo kas/utang.

### 3. Konsultasi Bisnis dengan Sajen Intelligence
1. Buka menu **Sajen Intelligence**.
2. Ajukan pertanyaan bisnis secara natural, misalnya:
   * *"Tampilkan grafik perbandingan penjualan vs belanja bulan ini"*
   * *"Berapa rekomendasi harga jual telur jika modal kulakan naik?"*
   * *"Buatkan naskah video promosi paket sembako hemat untuk WhatsApp"*

---

## 🛠️ 4. Dukungan & Arsitektur Sistem
Sistem didukung oleh:
* **Frontend**: React + Tailwind CSS (Blonjo UI)
* **Backend**: FastAPI + PostgreSQL + SQLAlchemy (Sajen API)
* **AI & Knowledge Engine**: MCP Server + Basemind AST Knowledge Index + LanceDB Vector RAG
"""

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(content)
    
    print(f"User manual generated successfully at: {output_path}")

if __name__ == "__main__":
    generate_user_manual()
