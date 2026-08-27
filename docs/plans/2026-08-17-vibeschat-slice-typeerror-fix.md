# Plan: QC & Perbaikan Total Defensive Null Safety pada VibesChat.tsx

## 📋 Ringkasan Masalah
Terjadi `TypeError: Cannot read properties of undefined (reading 'slice')` di `VibesChat.tsx` saat membaca `widgets.top_selling.slice(0, 3)`.

Setelah dilakukan Quality Control (QC) menyeluruh pada `VibesChat.tsx`, ditemukan beberapa akses properti lain yang belum defensif terhadap data `undefined`/`null` dari backend:
1. `widgets.top_selling.slice(0, 3)` (Crash jika `top_selling` `undefined`)
2. `widgets.top_selling.length` (Crash jika `top_selling` `undefined`)
3. `widgets.forecast_depletion.maintenance_stock` (Crash jika `forecast_depletion` `undefined`)
4. `widgets.forecast_depletion.items.map(...)` (Crash jika `items` `undefined`)
5. `widgets.macro_news.map(...)` (Crash jika `macro_news` `undefined`)

---

## 🎯 Target Perubahan

### Frontend (`blonjo`)
- **`src/pages/insights/VibesChat.tsx`**:
  - Buat variabel pembantu defensif (*safe getters*) di tingkat teratas komponen:
    ```typescript
    const topSelling = widgets?.top_selling ?? [];
    const forecastDepletion = widgets?.forecast_depletion;
    const forecastItems = forecastDepletion?.items ?? [];
    const macroNews = widgets?.macro_news ?? [];
    ```
  - Ganti seluruh akses properti UI agar mengacu pada variabel aman tersebut (`topSelling.slice(0, 3)`, `forecastItems.map(...)`, `macroNews.map(...)`).
  - Lakukan verifikasi kompilasi lokal (`pnpm run build` / `tsc`) untuk memastikan 0 type error dan 0 warning sebelum melakukan deployment.

---

## 🧪 Rencana QC & Pengujian
1. Jalankan `tsc -b` / `npm run build` secara lokal untuk memverifikasi tidak ada error sintaks/tipe.
2. Buka halaman VibesChat AI Assistant di browser.
3. Pastikan landing state dan sidebar widget dirender dengan lancar tanpa crash meskipun sebagian data dari API bernilai `null` atau `undefined`.

---

## 🚀 Deployment Plan
1. Re-build dan Deploy UI frontend: `./deploy.sh blonjo-ui`
