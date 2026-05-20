# Database Schema & Project Structure: BLONJO & SAJEN

## 1. Database Schema (PostgreSQL)

### A. Accounting & Core Finance
- **`accounts`**: Chart of Accounts (COA).
  - `id`, `code` (e.g., 1-101), `name`, `type` (Asset, Liability, Equity, Income, Expense), `parent_id`.
- **`transactions`**: Header for all financial movements.
  - `id`, `date`, `description`, `total_amount`, `type` (Purchase, Sales, Expense), `reference_no`.
- **`journal_entries`**: Double-entry records.
  - `id`, `transaction_id`, `account_id`, `debit`, `credit`.

### B. Inventory & Sales
- **`products`**: Item master data.
  - `id`, `sku`, `name`, `unit` (kg, pcs, etc.), `current_stock`, `min_stock_level`.
- **`inventory_logs`**: Tracking stock movement & COGS (HPP).
  - `id`, `product_id`, `transaction_id`, `quantity`, `price_per_unit`, `type` (In/Out).
- **`contacts`**: Customers & Suppliers.
  - `id`, `name`, `type` (Customer/Supplier), `phone`, `current_balance` (for Hutang/Piutang).

### C. AI & OCR Learning System
- **`ocr_tasks`**: Metadata for uploaded receipts.
  - `id`, `file_path`, `raw_extracted_json`, `status` (Pending, Processed, Corrected).
- **`ocr_feedback`**: Training data for few-shot prompting.
  - `id`, `ocr_task_id`, `field_name`, `original_value`, `corrected_value`.
- **`commodity_trends`**: Cached data from web search & historical analysis.
  - `id`, `product_id`, `source` (Internal/Web), `price`, `recorded_at`.

---

## 2. Project Folder Structure

```text
blonjo-sajen/
├── docs/                   # Documentation (System Arch, API, etc.)
├── sajen/                  # FastAPI Application (Sisi Backend, AI, & Agentic Engine)
│   ├── app/
│   │   ├── core/           # Config, security, database engine
│   │   ├── api/            # Route handlers (v1)
│   │   ├── models/         # SQLAlchemy/SQLModel definitions
│   │   ├── schemas/        # Pydantic validation schemas
│   │   ├── services/       # Business logic (Accounting, OCR, AI)
│   │   ├── workers/        # Celery/Arq task definitions
│   │   └── main.py         # Entry point
│   ├── migrations/         # Alembic DB migrations
│   ├── requirements.txt
│   └── .env
├── blonjo/                 # React + Vite Application (Sisi Frontend UI & Kasir)
│   ├── src/
│   │   ├── api/            # Fetch wrappers
│   │   ├── components/     # UI Components (shadcn/ui)
│   │   ├── hooks/          # Custom React hooks
│   │   ├── pages/          # Layouts & Views
│   │   ├── store/          # Zustand state management
│   │   └── App.tsx
│   ├── public/
│   ├── tailwind.config.js
│   └── package.json
├── ai/                     # Ollama scripts & prompt templates (diintegrasikan ke sajen)
│   ├── prompts/
│   └── model_config.yaml
├── docker-compose.yml      # Orchestration (API, DB, Redis, Worker)
└── README.md
```

---

## 3. Implementation Strategy

1.  **Phase 1 (Backend Core - SAJEN)**: 
    - Setup FastAPI + PostgreSQL.
    - Implement COA & Journal Entry logic.
2.  **Phase 2 (Frontend Base - BLONJO)**:
    - Setup React + Tailwind + shadcn/ui.
    - Build main dashboard & Manual Input forms.
3.  **Phase 3 (AI & Worker - SAJEN)**:
    - Setup Redis & Celery Worker.
    - Implement OCR extraction with Ollama.
    - Create the correction feedback loop.
4.  **Phase 4 (Advanced - SAJEN & BIZETO)**:
    - Web search integration for price prediction.
    - Bizeto WhatsApp webhook integration.
