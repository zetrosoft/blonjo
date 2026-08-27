# Trial Balance Implementation Plan

> **For Antigravity:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Trial Balance (Neraca Percobaan) report page with PDF preview and full i18n support in both backend (Sajen) and frontend (Blonjo).

**Architecture:**
- **Backend Service**: Fetch all accounts with their cumulative debit/credit transaction totals up to `end_date`, determine net debit/credit balances, generate PDF with dynamic language translations.
- **Backend API Router**: Expose JSON and PDF endpoints under `/reports/trial-balance` and `/reports/trial-balance/pdf`.
- **Frontend Page**: Implement `TrialBalanceReport.tsx` with a date filter bar and PDF preview using `A4Paper`.
- **Frontend Navigation & i18n**: Register the route in `App.tsx` and add links under Accounting report menus.

**Tech Stack:**
- Python (FastAPI, SQLAlchemy, FPDF)
- TypeScript (React, i18next, Tailwind CSS)

---

### Task 1: Backend Calculation & PDF Generator

**Files:**
- Modify: `sajen/app/services/reports.py`

**Steps:**
1. Implement `get_trial_balance(db: Session, tenant_id: int, start_date: date, end_date: date) -> dict`.
2. Add translation strings for `"trial_balance"` to `PDF_TRANSLATIONS`.
3. Add PDF layout rendering in `generate_report_pdf` when `report_type == "trial_balance"`.

---

### Task 2: Backend API Router

**Files:**
- Modify: `sajen/app/api/v1/reports.py`

**Steps:**
1. Register GET `/reports/trial-balance` endpoint.
2. Register GET `/reports/trial-balance/pdf` endpoint returning the FPDF byte content as `Response(media_type="application/pdf")`.

---

### Task 3: Frontend Report Component

**Files:**
- Create: `blonjo/src/pages/reports/TrialBalanceReport.tsx`

**Steps:**
1. Design the `TrialBalanceReport` component utilizing the `A4Paper` component, date selectors, and the localized `/reports/trial-balance/pdf` endpoint.

---

### Task 4: Routing & Navigation

**Files:**
- Modify: `blonjo/src/App.tsx`
- Modify: `blonjo/src/pages/Reports.tsx`
- Modify: `blonjo/src/pages/reports/ReportsHub.tsx`
- Modify: `blonjo/src/lib/i18n.ts`

**Steps:**
1. Register route `/reports/trial-balance` in `App.tsx` mapping to `TrialBalanceReport`.
2. Add Trial Balance to the report lists and hubs.
3. Update i18n translation maps in `i18n.ts` for labels like `menu_trial_balance`.
