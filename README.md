# BLONJO & SAJEN - Ekosistem Akuntansi Retail & AI untuk UMKM

**BLONJO & SAJEN** adalah ekosistem manajemen keuangan dan retail modern untuk UMKM dengan standar industri tinggi. Platform ini menggabungkan aktivitas transaksi retail riil di garda depan (**BLONJO**) dan kecanggihan mesin otomasi backend asinkronus di balik layar (**SAJEN**). Platform ini mengintegrasikan pembukuan keuangan terstandarisasi **PSAK UMKM**, teknologi **AI OCR** lokal menggunakan **Ollama**, pencarian semantik dengan **pgvector**, serta asisten AI interaktif via **WhatsApp (Bizeto)**.

---

## 🚀 Fitur Utama

*   **Double-Entry Accounting (PSAK UMKM):** Pencatatan otomatis untuk Chart of Accounts (COA), Jurnal Umum, Buku Besar, Neraca, hingga Laporan Laba Rugi yang akurat (dikelola oleh **BLONJO**).
*   **AI OCR & Few-Shot Learning:** Ekstraksi data dari nota belanja secara lokal menggunakan Ollama. Sistem belajar secara cerdas dari setiap koreksi input pengguna untuk meningkatkan akurasi OCR selanjutnya (dikelola secara senyap oleh **SAJEN**).
*   **Vector Search & Semantic Search:** Pencarian produk cerdas berbasis makna semantik menggunakan ekstensi `pgvector` di PostgreSQL.
*   **WhatsApp AI Assistant (Bizeto):** Agen penjualan dan FAQ otomatis yang dapat membalas chat pelanggan secara profesional dalam Bahasa Indonesia maupun English.
*   **Sovereign & Local-First Storage:** Seluruh data sensitif, dokumen, serta model AI disimpan secara mandiri dan aman di infrastruktur lokal tanpa ketergantungan pada SaaS pihak ketiga.

---

## 🛠️ Stack Teknologi

| Komponen | Teknologi | Deskripsi |
| :--- | :--- | :--- |
| **Frontend (BLONJO)** | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, react-i18next | UI modern dengan responsive design, transisi super halus, dual-bahasa (ID/EN), serta support Dark/Light mode. |
| **Backend & Workers (SAJEN)** | Python, FastAPI, SQLAlchemy, Alembic, Celery, Uvicorn | REST API berkinerja tinggi berbasis asynchronous programming dengan parsing data cepat via Pydantic. |
| **Database & Cache** | PostgreSQL (+ pgvector), Redis | Penyimpanan relasional terstruktur terintegrasi pencarian vektor serta task queue asinkronus yang andal. |
| **Artificial Intelligence** | Ollama (Local AI & Embeddings) | Inferensi AI mandiri tanpa API Key eksternal untuk OCR nota belanja dan pencarian semantik. |

---

## 📁 Struktur Proyek

```text
blonjo-sajen/
├── docs/                   # Dokumentasi Arsitektur Sistem & Database
├── sajen/                  # FastAPI Application (Python) - Sisi Backend & AI
│   ├── app/
│   │   ├── core/           # Konfigurasi, Keamanan, dan Engine Database
│   │   ├── api/            # API Route Handlers (v1)
│   │   ├── models/         # SQLAlchemy / SQLModel Definisi Tabel
│   │   ├── schemas/        # Pydantic Validation Schemas
│   │   ├── services/       # Business Logic (Accounting, OCR, AI)
│   │   └── workers/        # Celery Background Task Definitions
│   ├── migrations/         # Alembic Database Migrations
│   └── pyproject.toml      # Manajemen Dependensi Python (UV)
├── blonjo/                 # React + Vite Application - Sisi Frontend & UI
│   ├── src/
│   │   ├── components/     # Reusable UI Components (shadcn/ui)
│   │   ├── store/          # Zustand State Management
│   │   └── pages/          # Layout & Dashboard Views
│   └── package.json        # Node Dependensi (Dijalankan dengan Bun)
├── docker-compose.yml      # Orkestrasi Docker (API, DB, Redis, Worker)
└── README.md               # Dokumentasi Utama Proyek
```

---

## ⚙️ Variabel Lingkungan (Environment Variables)

Salin file `.env.example` menjadi `.env` di masing-masing folder frontend (`blonjo`) dan backend (`sajen`). Berikut adalah parameter penting yang digunakan:

### Backend Configuration (`sajen/.env`)
| Variable | Default Value | Deskripsi |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://<DB_USER>:<SECURE_PASSWORD>@sajen-db:5432/blonjo_db` | URL koneksi ke PostgreSQL (Ganti placeholder dengan kredensial aman). |
| `REDIS_URL` | `redis://sajen-redis:6379/0` | URL koneksi Redis untuk cache internal. |
| `CELERY_BROKER_URL` | `redis://sajen-redis:6379/0` | Broker Celery untuk antrean background task. |
| `OLLAMA_HOST` | `http://sajen-ollama:11434` | Endpoint Ollama (Direkomendasikan terisolasi dalam private network Docker). |

### Frontend Configuration (`blonjo/.env`)
| Variable | Default Value | Deskripsi |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://api.yourdomain.com/api/v1` | Endpoint backend API (Wajib gunakan HTTPS/Domain resmi di production). |

---

## 📦 Panduan Instalasi & Eksekusi

### Metode A: Menggunakan Docker Compose (Direkomendasikan)
Metode ini adalah cara paling praktis untuk menjalankan seluruh ekosistem aplikasi beserta semua dependensinya (Database, Cache, API, Workers, dan Frontend) dalam satu perintah terisolasi.

1.  **Pastikan Docker Desktop sudah berjalan di perangkat Anda.**
2.  **Jalankan aplikasi menggunakan Docker Compose:**
    ```bash
    docker-compose up --build
    ```
3.  **Akses Layanan:**
    *   **Frontend Dashboard (BLONJO):** [http://localhost:7500](http://localhost:7500)
    *   **Backend API Documentation (SAJEN Swagger):** [http://localhost:8005/api/docs](http://localhost:8005/api/docs)
    *   **Backend API Alternative Docs (SAJEN Redoc):** [http://localhost:8005/api/redoc](http://localhost:8005/api/redoc)

---

### Metode B: Menjalankan Secara Lokal (Untuk Development)
Jika Anda ingin melakukan debugging atau pengembangan kode secara real-time, jalankan masing-masing servis secara manual:

#### 1. Prasyarat Sistem
*   **Node.js** & **Bun** (Pengelola paket frontend wajib)
*   **Python 3.11+** dengan **uv** (Untuk dependensi backend super cepat)
*   **PostgreSQL** (Wajib terpasang modul `pgvector`)
*   **Redis** berjalan di port `6380` (Atau sesuaikan dengan `.env`)
*   **Ollama** terinstal secara lokal dan servernya aktif.

#### 2. Setup Database PostgreSQL (+ pgvector)
Pastikan database Anda sudah memiliki modul pgvector terinstal secara global atau di-enable pada database target:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 3. Setup Backend API & Workers (SAJEN)
Gunakan pengelola paket **uv** untuk menginstal modul Python secara efisien:
```bash
# Masuk ke direktori sajen
cd sajen

# Buat virtual environment & aktifkan
uv venv
source .venv/bin/activate

# Install semua dependensi
uv pip install -e .

# Jalankan migrasi database
alembic upgrade head

# Jalankan seeding data awal Chart of Accounts (COA)
python -m app.seed_coa

# Jalankan server FastAPI backend
uvicorn app.main:app --host 0.0.0.0 --port 8005 --reload
```

Di terminal terpisah, pastikan virtual environment tetap aktif dan jalankan Celery Worker untuk pemrosesan OCR:
```bash
cd sajen
source .venv/bin/activate
celery -A app.core.celery_app worker --loglevel=info --pool=threads --concurrency=2
```

#### 4. Setup Frontend React (BLONJO)
Sesuai aturan kerja proyek, kita **wajib** menggunakan **Bun** untuk mengelola paket dan menjalankan frontend secara lokal:
```bash
# Masuk ke direktori blonjo
cd blonjo

# Install dependensi menggunakan Bun
bun install

# Jalankan server development frontend
bun run dev --port 7500
```
Buka peramban Anda dan arahkan ke [http://localhost:7500](http://localhost:7500) untuk mengakses dasbor admin **Blonjo**.

---

## 🔒 Standar Keamanan & Docker Best Practices

1.  **Non-Root Execution:** Seluruh container Docker berjalan di bawah user non-root demi memitigasi risiko pembajakan akses host kernel (container escape).
2.  **Network Isolation:** Koneksi database PostgreSQL dan cache Redis diisolasi penuh di dalam private network internal Docker. Hanya backend API yang diekspos ke publik dengan kontrol CORS yang ketat.
3.  **Strict RBAC:** Pembagian izin akses super ketat antara peran **Owner/Admin**, **Manager**, dan **Cashier/Staff** untuk melindungi pencatatan keuangan bisnis sensitif.
4.  **Local-First Privacy:** Data akuntansi retail tetap terjamin kedaulatannya di server pribadi Anda, tanpa adanya pengiriman analitik maupun data transaksi ke cloud luar.
5.  **HTTPS Reverse Proxy (Wajib Production):** Akses frontend dan backend di lingkungan produksi wajib menggunakan Reverse Proxy (seperti Nginx atau Caddy) untuk menangani enkripsi SSL (HTTPS) demi menghindari pencurian kredensial via penyadapan jaringan (MitM).
6.  **API Docs Hardening:** Dokumentasi API (Swagger di `/api/docs` dan Redoc di `/api/redoc`) wajib dinonaktifkan di lingkungan produksi melalui pendeteksian variabel lingkungan `ENV=production` untuk mencegah kebocoran skema database.

---

## 🛡️ Aturan Kontribusi & Quality Assurance

*   **Frontend Guidelines:** Wajib mematuhi konfigurasi ESLint & Prettier. Hindari penggunaan pustaka pihak ketiga jika elemen visual tersebut dapat dibangun dengan memanfaatkan primitif **shadcn/ui** atau **Radix UI**.
*   **Backend Guidelines:** Pastikan kode Anda lolos validasi static analysis menggunakan **Ruff** dan type checker **MyPy** sebelum melakukan commit atau submit Pull Request.
*   **No Axios:** Komunikasi client-server pada frontend wajib menggunakan native `fetch` dengan memanfaatkan utility error handling yang sudah disediakan, bukan Axios.
