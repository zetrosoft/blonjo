# Plan: Purchase Plan Partial Execution & Item Marking (Opsi B)

## 1. Perubahan Basis Data & Model (Migration)
*   **Kolom Baru**: Menambahkan kolom `is_purchased` (`Boolean`, default `false`, `nullable=False`) ke tabel `purchase_plan_items`.
*   **Alembic Migration**: Membuat file migrasi baru untuk menambahkan kolom tersebut ke database VPS.

## 2. Perubahan Backend (Sajen API)
*   **Model**:
    *   [sajen/app/models/inventory.py](file:///Users/user/kerjaan/jualan/sajen/app/models/inventory.py): Tambahkan `is_purchased = Column(Boolean, default=False, nullable=False)` di kelas `PurchasePlanItem`.
*   **Schema**:
    *   [sajen/app/schemas/material_control.py](file:///Users/user/kerjaan/jualan/sajen/app/schemas/material_control.py): Tambahkan `is_purchased: bool` ke `PurchasePlanItemResponse` dan `PurchasePlanItemCreate` (opsional, default `False`).
    *   Buat schema request untuk eksekusi plan:
        ```python
        class PurchasePlanExecuteRequest(BaseModel):
            purchased_item_ids: List[int]
            complete_plan: bool = False
        ```
*   **Service**:
    *   [sajen/app/services/material_control.py](file:///Users/user/kerjaan/jualan/sajen/app/services/material_control.py): Tambahkan fungsi `execute_purchase_plan_items` untuk menandai item terbelanja dan meng-update status `PurchasePlan` menjadi `COMPLETED` jika semua item telah dibeli atau jika `complete_plan=True`.
*   **API Endpoint**:
    *   [sajen/app/api/v1/material_control.py](file:///Users/user/kerjaan/jualan/sajen/app/api/v1/material_control.py): Tambahkan route `POST /purchase-plans/{plan_id}/execute`.

## 3. Perubahan Frontend (Blonjo UI)
*   **Dialog Detail Rencana Belanja**:
    *   [blonjo/src/pages/material-control/RecommendedPurchase.tsx](file:///Users/user/kerjaan/jualan/blonjo/src/pages/material-control/RecommendedPurchase.tsx): Di dalam dialog detail item (`selectedPlan` modal), tampilkan checkbox di sebelah nama barang jika status rencana adalah `APPROVED`.
    *   Checkbox akan tercentang dan dinonaktifkan (disabled) jika item tersebut memang sudah dibeli (`is_purchased === true`).
    *   Pengguna dapat mencentang item baru yang dibeli, lalu mengklik tombol **"Eksekusi Belanja"**.
    *   Tampilkan juga opsi tombol **"Selesaikan Rencana"** untuk langsung menutup dan menandai rencana tersebut sebagai `COMPLETED` (sehingga terhapus dari proyeksi cashflow).

---

## 4. Alur Kerja Implementasi & Deploy
1.  Jalankan perintah pembuatan migrasi database lokal di VPS.
2.  Terapkan perubahan backend Python.
3.  Terapkan perubahan frontend React/TypeScript.
4.  Lakukan deploy `./deploy.sh sajen-api sajen-worker blonjo-ui` ke VPS.
