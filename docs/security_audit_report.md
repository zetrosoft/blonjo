# Laporan Audit Keamanan Sistem: BLONJO & SAJEN

Sebagai **Senior Application Security Expert**, saya telah melakukan audit keamanan mendalam (*Deep Security Audit*) terhadap kode backend **SAJEN (FastAPI)**. Ditemukan beberapa kerentanan keamanan kritis (*critical vulnerabilities*) dan celah logis yang dapat mengekspos data keuangan UMKM sensitif atau merusak integritas server lokal.

Berikut adalah ringkasan temuan beserta rekomendasi taktis yang siap dieksekusi.

---

## 🚨 Ringkasan Temuan Kerentanan

| Tingkat Risiko | Klasifikasi Kerentanan | Deskripsi Singkat | Status | Dampak |
| :--- | :--- | :--- | :--- | :--- |
| **🔴 CRITICAL** | **Path Traversal & Arbitrary File Write** | Nama file upload receipt digunakan langsung tanpa sanitasi. | Teridentifikasi | Remote Code Execution / Data Overwrite |
| **🔴 CRITICAL** | **Broken Object Level Authorization (BOLA/RBAC Bypass)** | Pengguna dengan peran `cashier` dapat mengeksekusi jurnal manual & penyesuaian stok. | Teridentifikasi | Kerusakan Buku Kas / Fraud Keuangan |
| **🟡 MEDIUM** | **Insecure CORS Configuration** | `allow_origins=["*"]` digabungkan dengan `allow_credentials=True`. | Teridentifikasi | Aplikasi Crash di Runtime / Cross-Origin Attacks |
| **🟡 MEDIUM** | **Hardcoded / Weak JWT Secret Key** | Kunci JWT rahasia default dibiarkan aktif tanpa validasi lingkungan produksi. | Teridentifikasi | Pemalsuan Token (*JWT Spoofing*) |
| **🟢 LOW** | **No Rate Limiting & Resource Exhaustion** | Endpoint login dan upload OCR (Ollama) tidak dibatasi kecepatannya. | Teridentifikasi | Denial of Service (DoS) pada Model AI Lokal |

---

## 🔍 Analisis Detail & Usulan Solusi Praktis

### 1. 🔴 CRITICAL: Path Traversal di Upload Resi (`sajen/app/api/v1/ocr.py`)

*   **Lokasi Kode Saat Ini:**
    ```python
    file_path = os.path.join(UPLOAD_DIR, f"{current_user.id}_{file.filename}")
    ```
*   **Analisis Bahaya:** 
    Parameter `file.filename` diambil langsung dari input peramban client tanpa dibersihkan. Penyerang dapat mengirimkan nama file manipulatif seperti `../../../../etc/shadow` atau `../../app/main.py`. Jika kontainer berjalan dengan hak akses tinggi, penyerang dapat menimpa file penting sistem atau menginjeksikan kode berbahaya (*Remote Code Execution*).
*   **Solusi Taktis (Rekomendasi):**
    Menggunakan **UUID v4** untuk menghasilkan nama file acak yang unik di server, kemudian mempertahankan eksternal ekstensi aslinya secara aman (hanya memperbolehkan ekstensi gambar dan PDF).

    ```python
    import uuid
    import os

    # Ekstrak ekstensi asli
    ext = os.path.splitext(file.filename)[1].lower()
    # Hasilkan nama file acak yang aman
    safe_filename = f"{current_user.id}_{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    ```

---

### 2. 🔴 CRITICAL: Kebocoran Hak Akses / RBAC Bypass

*   **Lokasi Kode Saat Ini:**
    Di `sajen/app/api/v1/accounting.py` dan `sajen/app/api/v1/inventory.py`, proteksi rute hanya mengandalkan dependency `current_user: CurrentUser`.
*   **Analisis Bahaya:**
    Meskipun database mendukung kolom `role` (`admin`, `manager`, `cashier`), saat ini **tidak ada pemeriksaan peran di endpoint API**. Seorang `cashier` dapat membuat jurnal manual sembarangan (misal: memindahkan saldo kas keluar tanpa persetujuan) atau memanipulasi stok inventori.
*   **Solusi Taktis (Rekomendasi):**
    Implementasikan decorator atau helper dependency `check_role` di `sajen/app/api/deps.py` untuk memvalidasi hak akses secara deklaratif.

    ```python
    # sajen/app/api/deps.py
    def check_role(allowed_roles: list[UserRole]):
        def role_checker(current_user: CurrentUser = Depends(get_current_user)) -> User:
            if current_user.role not in allowed_roles:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Anda tidak memiliki hak akses yang cukup untuk tindakan ini."
                )
            return current_user
        return role_checker
    ```
    
    Terapkan pada endpoint sensitif:
    ```python
    # Di accounting.py (hanya Admin dan Manager yang bisa posting transaksi manual)
    @router.post("/transactions", response_model=TransactionResponse)
    def create_new_transaction(
        trans_in: TransactionCreate,
        session: SessionDep,
        current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
    ):
        ...
    ```

---

### 3. 🟡 MEDIUM: Insecure CORS & Runtime Crash (`sajen/app/main.py`)

*   **Lokasi Kode Saat Ini:**
    ```python
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    ```
*   **Analisis Bahaya:**
    Di FastAPI/Uvicorn, mengaktifkan `allow_credentials=True` bersama dengan `allow_origins=["*"]` akan menyebabkan **RuntimeError** saat diakses oleh peramban modern karena spesifikasi keamanan CORS melarang wildcard ketika kredensial (cookie/auth headers) diizinkan. Ini dapat merusak pengalaman integrasi frontend.
*   **Solusi Taktis (Rekomendasi):**
    Konfigurasikan asal CORS secara dinamis melalui file konfigurasi `.env`. Jika memang diperlukan wildcard pada lingkungan dev lokal, gunakan penanganan khusus atau matikan kredensial jika origins adalah `*`.

    ```python
    # Pastikan domain diatur melalui .env
    ALLOWED_ORIGINS = ["http://localhost:7500", "http://127.0.0.1:7500"]
    ```

---

### 4. 🟡 MEDIUM: Kunci Rahasia Default / Hardcoded JWT (`sajen/app/core/config.py`)

*   **Lokasi Kode Saat Ini:**
    ```python
    SECRET_KEY: str = "yolo_super_secret_key_change_in_production_12345"
    ```
*   **Analisis Bahaya:**
    Jika aplikasi dideploy tanpa membuat file `.env` kustom, kunci rahasia lemah ini akan digunakan secara default. Penyerang dapat dengan mudah memalsukan JWT token (*JWT forge*) dan bertindak sebagai admin sistem secara tidak sah.
*   **Solusi Taktis (Rekomendasi):**
    Pastikan `SECRET_KEY` tidak memiliki nilai default yang lemah di lingkungan non-development, atau berikan validasi wajib saat startup aplikasi.

    ```python
    import secrets
    
    # generate kunci aman acak secara dinamis jika tidak disediakan di .env
    SECRET_KEY: str = os.getenv("SECRET_KEY") or secrets.token_hex(32)
    ```

---

### 5. 🟢 LOW: Proteksi DoS untuk Inference Lokal (Ollama)

*   **Analisis Bahaya:**
    Inferensi gambar (OCR) menggunakan model AI lokal seperti `llava` sangat menguras resource CPU/GPU. Tanpa adanya pembatasan rate limit (*throttling*), penyerang atau pengguna nakal dapat mengirimkan ratusan berkas resi secara berulang untuk menghabiskan memori server (*Resource Exhaustion*), yang mengakibatkan server mati (*Denial of Service*).
*   **Solusi Taktis (Rekomendasi):**
    Gunakan pustaka rate-limiting ringan seperti `slowapi` pada endpoint `/ocr/upload` untuk mencegah eksploitasi berlebihan.

---

## 🛠️ Rencana Aksi Eksekusi Koding (Execution Plan)

Saya siap langsung mengimplementasikan perbaikan keamanan kelas tinggi ini demi mengamankan ekosistem akuntansi retail BLONJO & SAJEN. 

### Langkah yang Akan Dilakukan:
1.  **Memperbaiki Path Traversal** pada endpoint `/ocr/upload` dengan generator UUID yang aman.
2.  **Menambahkan Keamanan RBAC** dengan mengimplementasikan dependency `check_role` di `deps.py` dan menempelkannya ke endpoint krusial di `accounting.py` dan `inventory.py`.
3.  **Mengeraskan Konfigurasi CORS** di `app/main.py` agar tidak terjadi crash dan mematuhi standar OWASP.
4.  **Meningkatkan Validasi `SECRET_KEY`** di `config.py` untuk mengamankan JWT token dari pemalsuan.

> [!IMPORTANT]
> Apakah Anda menyetujui rencana perbaikan keamanan ini untuk segera saya eksekusi di codebase? Silakan beri instruksi agar saya bisa mulai menulis kodenya dengan standar *clean code* terbaik.
