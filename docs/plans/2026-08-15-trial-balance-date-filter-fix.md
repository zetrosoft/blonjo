---
title: "Fix Trial Balance Report Period Date Filter"
date: "2026-08-15"
author: "Senior Software Developer Pro"
tags: ["reports", "trial-balance", "backend", "date-filter"]
---

# Changelog: Trial Balance Report Date Filter Fix

## Summary
Perbaikan pada fungsi laporan Neraca Percobaan (Trial Balance) di mana filter rentang tanggal `start_date` sampai `end_date` belum membatasi query pencatatan transaksi:
1. Memperbarui query akumulasi mutasi di `get_trial_balance` (`sajen/app/services/reports.py`) dengan menambahkan kondisi `Transaction.transaction_date >= start_date`.
2. Memastikan mutasi debit dan kredit disajikan secara presisi sesuai periode tanggal yang dipilih pengguna pada filter laporan.

## Detailed Changes

### Backend (`sajen`)
- **`app/services/reports.py`**:
  - Menambahkan filter `Transaction.transaction_date >= start_date` pada query `balances_query` dalam fungsi `get_trial_balance()`.

## Verification
- Deployed updated `sajen` service to production VPS server via `./deploy.sh sajen`.
