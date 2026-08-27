---
title: "Dashboard Bento Cards Redesign & Financial Trend Timeframe Filter"
date: "2026-08-10"
author: "Antigravity Agent"
tags: ["dashboard", "bento-cards", "financial-trend", "ytd", "mtd", "last-month"]
---

# Changelog: Dashboard Bento Cards Redesign & Financial Trend Timeframe Filter

## Summary
Perbaikan menyeluruh pada tampilan Dashboard `blonjo.samkarsa.com`:
1. Menghilangkan angka desimal pada format mata uang Bento Cards (`formatRp`).
2. Menampilkan informasi 3 layer pada Bento Cards Revenue & Expenses:
   - Atas (kecil): `YTD: Rp ...`
   - Tengah (besar & bold): `Bulan Ini: Rp ...`
   - Bawah (kecil): `Bulan Lalu: Rp ...`
3. Memperbaiki visualisasi Financial Trend Chart dengan kurva halus (*Smooth Area Line Chart* / `tension: 0.45` & `fill: origin`).
4. Mencegah pemanggilan ulang Toast Notifikasi Tagihan (`upcoming_debts`) saat berpindah filter timeframe chart.

## Detailed Changes

### 1. Backend (`sajen`)
- **`app/schemas/accounting.py`**:
  - Menambahkan field `total_revenue_last_month` dan `total_expense_last_month` pada `DashboardSummaryResponse`.
- **`app/services/accounting.py`**:
  - Menambahkan kalkulasi `total_revenue_last_month` dan `total_expense_last_month` pada fungsi `get_dashboard_summary`.

### 2. Frontend (`blonjo`)
- **`src/lib/utils.ts`**:
  - Mengubah opsi `maximumFractionDigits` pada `formatRp` menjadi `0` secara default sehingga angka ditampilkan tanpa desimal.
- **`src/pages/Dashboard.tsx`**:
  - Menambahkan baris info "Bulan Lalu" di bagian bawah Bento Cards Total Revenue dan Total Expense.
  - Memperbarui konfig Chart.js (`cubicInterpolationMode: 'monotone'`, `tension: 0.45`, `fill: origin`, soft background fill).
  - Menggunakan `notifiedDebtsRef` (`useRef`) agar pengingat tagihan hanya muncul 1x saat buka halaman.

## Verification
- Compilation check: `npx tsc --noEmit` passed with 0 errors.
- Deployment target: `./deploy.sh sajen-api blonjo-ui` executed.
