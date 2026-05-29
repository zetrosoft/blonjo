# BLONJO & SAJEN - Retail Accounting & AI Ecosystem for SMEs

**BLONJO & SAJEN** is a modern financial and retail management ecosystem for SMEs with high industry standards. The platform combines real-world retail transaction activities at the front-end (**BLONJO**) with sophisticated asynchronous backend automation engines behind the scenes (**SAJEN**). It integrates standardized bookkeeping based on **PSAK UMKM**, local **AI OCR** technology using **Ollama**, semantic search with **pgvector**, and interactive AI assistants via **WhatsApp (Bizeto)**.

---

## 🚀 Key Features

*   **Double-Entry Accounting (PSAK UMKM):** Automated recording for Chart of Accounts (COA), General Journal, General Ledger, Balance Sheet, and accurate Profit & Loss Statements (managed by **BLONJO**).
*   **AI OCR & Few-Shot Learning:** Data extraction from shopping receipts locally using Ollama. The system intelligently learns from every user input correction to improve future OCR accuracy (silently managed by **SAJEN**).
*   **Vector Search & Semantic Search:** Intelligent product search based on semantic meaning using the `pgvector` extension in PostgreSQL.
*   **WhatsApp AI Assistant (Bizeto):** Automated sales agent and FAQ that can reply to customer chats professionally in both Indonesian and English.
*   **Sovereign & Local-First Storage:** All sensitive data, documents, and AI models are stored independently and securely on local infrastructure without dependence on third-party SaaS.

---

## 🛠️ Tech Stack

| Component | Technology | Description |
| :--- | :--- | :--- |
| **Frontend (BLONJO)** | React, TypeScript, Vite, Tailwind CSS, shadcn/ui, Zustand, react-i18next | Modern UI with responsive design, smooth transitions, dual-language (ID/EN) support, and Dark/Light mode. |
| **Backend & Workers (SAJEN)** | Python, FastAPI, SQLAlchemy, Alembic, Celery, Uvicorn | High-performance REST API based on asynchronous programming with fast data parsing via Pydantic. |
| **Database & Cache** | PostgreSQL (+ pgvector), Redis | Structured relational storage integrated with vector search and reliable asynchronous task queues. |
| **Artificial Intelligence** | Ollama (Local AI & Embeddings) | Sovereign AI inference without external API keys for receipt OCR and semantic search. |

---

## 📁 Project Structure

```text
blonjo-sajen/
├── sajen/                  # FastAPI Application (Python) - Backend & AI side
│   ├── app/
│   │   ├── core/           # Configuration, Security, and Database Engine
│   │   ├── api/            # API Route Handlers (v1)
│   │   ├── models/         # SQLAlchemy / SQLModel Table Definitions
│   │   ├── schemas/        # Pydantic Validation Schemas
│   │   ├── services/       # Business Logic (Accounting, OCR, AI)
│   │   └── workers/        # Celery Background Task Definitions
│   ├── migrations/         # Alembic Database Migrations
│   └── pyproject.toml      # Python Dependency Management (UV)
├── blonjo/                 # React + Vite Application - Frontend & UI side
│   ├── src/
│   │   ├── components/     # Reusable UI Components (shadcn/ui)
│   │   ├── store/          # Zustand State Management
│   │   └── pages/          # Layout & Dashboard Views
│   └── package.json        # Node Dependencies (Run with Bun)
├── docker-compose.yml      # Docker Orchestration (API, DB, Redis, Worker)
└── README.md               # Main Project Documentation
```

---

## ⚙️ Environment Variables

Copy the `.env.example` file to `.env` in both the frontend (`blonjo`) and backend (`sajen`) folders. Below are the key parameters used:

### Backend Configuration (`sajen/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `DATABASE_URL` | `postgresql://<DB_USER>:<SECURE_PASSWORD>@sajen-db:5432/blonjo_db` | PostgreSQL connection URL (Replace placeholders with secure credentials). |
| `REDIS_URL` | `redis://sajen-redis:6379/0` | Redis connection URL for internal cache. |
| `CELERY_BROKER_URL` | `redis://sajen-redis:6379/0` | Celery Broker for background task queues. |
| `OLLAMA_HOST` | `http://sajen-ollama:11434` | Ollama endpoint (Recommended to be isolated within a private Docker network). |

### Frontend Configuration (`blonjo/.env`)
| Variable | Default Value | Description |
| :--- | :--- | :--- |
| `VITE_API_URL` | `https://api.yourdomain.com/api/v1` | Backend API endpoint (HTTPS/Official domain required in production). |

---

## 📦 Installation & Execution Guide

### Method A: Using Docker Compose (Recommended)
This method is the most practical way to run the entire application ecosystem and all its dependencies (Database, Cache, API, Workers, and Frontend) in a single isolated command.

1.  **Ensure Docker Desktop is running on your device.**
2.  **Run the application using Docker Compose:**
    ```bash
    docker-compose up --build
    ```
3.  **Access Services:**
    *   **Frontend Dashboard (BLONJO):** [http://localhost:7500](http://localhost:7500)
    *   **Backend API Documentation (SAJEN Swagger):** [http://localhost:8005/api/docs](http://localhost:8005/api/docs)

---

### Method B: Running Locally (For Development)
If you wish to debug or develop code in real-time, run each service manually:

#### 1. System Prerequisites
*   **Node.js** & **Bun** (Required frontend package manager)
*   **Python 3.11+** with **uv** (For super-fast backend dependencies)
*   **PostgreSQL** (Must have the `pgvector` module installed)
*   **Redis** running on port `6380` (Or adjust according to `.env`)
*   **Ollama** installed locally and the server is active.

#### 2. PostgreSQL Setup (+ pgvector)
Ensure your database has the pgvector module installed globally or enabled on the target database:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

#### 3. Backend API & Workers Setup (SAJEN)
Use the **uv** package manager to install Python modules efficiently:
```bash
cd sajen
uv venv
source .venv/bin/activate
uv pip install -e .
alembic upgrade head
python -m app.seed_coa
uvicorn app.main:app --host 0.0.0.0 --port 8005 --reload
```

In a separate terminal, ensure the virtual environment remains active and run the Celery Worker for OCR processing:
```bash
cd sajen
source .venv/bin/activate
celery -A app.core.celery_app worker --loglevel=info --pool=threads --concurrency=2
```

#### 4. Frontend React Setup (BLONJO)
According to project rules, we **must** use **Bun** to manage packages and run the frontend locally:
```bash
cd blonjo
bun install
bun run dev --port 7500
```
Open your browser and navigate to [http://localhost:7500](http://localhost:7500) to access the **Blonjo** admin dashboard.

---

## 🔒 Security Standards & Docker Best Practices

1.  **Non-Root Execution:** All Docker containers run under a non-root user to mitigate the risk of kernel host hijacking (container escape).
2.  **Network Isolation:** PostgreSQL and Redis connections are fully isolated within the internal private Docker network. Only the API backend is exposed publicly with strict CORS controls.
3.  **Strict RBAC:** Highly restrictive access permission levels between **Owner/Admin**, **Manager**, and **Cashier/Staff** roles to protect sensitive financial business records.
4.  **Local-First Privacy:** Retail accounting data remains sovereign on your private server, without any analytics or transaction data sent to external clouds.
5.  **HTTPS Reverse Proxy (Production Mandatory):** Access to frontend and backend in production environments must use a Reverse Proxy (such as Nginx or Caddy) to handle SSL encryption (HTTPS) to prevent credential theft via network sniffing (MitM).
6.  **API Docs Hardening:** API documentation (Swagger at `/api/docs` and Redoc at `/api/redoc`) must be disabled in production environments by detecting the `ENV=production` environment variable to prevent database schema leaks.

---

## 🛡️ Contribution Rules & Quality Assurance

*   **Frontend Guidelines:** Must adhere to ESLint & Prettier configurations. Avoid using third-party libraries if visual elements can be built using **shadcn/ui** or **Radix UI** primitives.
*   **Backend Guidelines:** Ensure your code passes static analysis validation using **Ruff** and the **MyPy** type checker before committing or submitting a Pull Request.
*   **No Axios:** Client-server communication on the frontend must use native `fetch` with provided error handling utilities, rather than Axios.

---

## 💰 Support & Donations
If you find this project valuable for your retail infrastructure or AI implementations, please consider supporting the developer:

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-blue.svg?style=for-the-badge&logo=paypal)](https://paypal.me/bijaktechno)

---

## 📧 Contact & Support
For technical inquiries, contact the Lead Software Architect or open an issue in the project tracker.
r than Axios.

---

## 💰 Support & Donations
If you find this project valuable for your retail infrastructure or AI implementations, please consider supporting the developer:

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-blue.svg?style=for-the-badge&logo=paypal)](https://www.paypal.com/paypalme/iswanputera)

---

## 📧 Contact & Support
For technical inquiries, contact the Lead Software Architect or open an issue in the project tracker.
