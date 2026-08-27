---
title: "Support Customer Deposit Intent in AI Smart Parser and Automatic Journaling"
date: "2026-08-15"
author: "Senior Software Developer Pro"
tags: ["ai-parser", "customer-deposit", "smart-parser", "coa", "journal"]
---

# Changelog: AI Customer Deposit Intent Recognition & Journal Redirection

## Summary
Implementasi fitur pengenalan intent penerimaan **Uang Muka Penjualan (Customer Deposit / DP)** pada AI Smart Parser dan Sistem Jurnal Otomatis:
1. Menambahkan akun Kewajiban Lancar `2-1401` (**Uang Muka Penjualan**) pada Seed Chart of Accounts (`sajen/app/seed_coa.py`) serta dukungan terjemahan di laporan PDF.
2. Memperbarui System Prompt AI (`sajen/app/services/smart_parser.py` & `blonjo/src/lib/parsePrompt.ts`) untuk menangkap frasa kata kunci `"DP"`, `"Uang Muka"`, `"Deposit"`, `"Panjar"` dan mengeset `payment_method: "customer_deposit"`.
3. Memperbarui Automatic Journal Engine di `sajen/app/services/accounting.py` agar mengalihkan sisi Kredit dari Pendapatan Penjualan (`4-1101`) ke akun Kewajiban Uang Muka Penjualan (`2-1401` / `2-1101`) saat transaksi terdeteksi sebagai penerimaan DP Customer.

## Detailed Changes

### Backend (`sajen`)
- **`app/seed_coa.py`**:
  - Menambahkan akun `2-1401 (acc_customer_deposit)` pada grup Liabilities.
- **`app/services/reports.py`**:
  - Menambahkan terjemahan `acc_customer_deposit` ("Uang Muka Penjualan" / "Customer Deposit") pada kamus laporan PDF.
- **`app/services/smart_parser.py`**:
  - Menambahkan Aturan 11 (Customer Deposit Detection) pada `build_minimal_prompt()`.
- **`app/services/accounting.py`**:
  - Menambahkan interceptor pengalihan akun kredit penjualan ke `2-1401` bila `payment_method` bernilai `customer_deposit` atau mengandung kata DP.

### Frontend (`blonjo`)
- **`src/lib/parsePrompt.ts`**:
  - Menyelaraskan system prompt AI dengan menambahkan Aturan 16 (Customer Deposit Detection).

## Verification
- Project `blonjo` compile check: `npx tsc --noEmit` passed with 0 errors.
- Deployment target: `./deploy.sh sajen blonjo-ui` executed to production VPS.
