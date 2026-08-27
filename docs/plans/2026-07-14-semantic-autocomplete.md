# Semantic Autocomplete with Local ONNX and pgvector Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a fast, local semantic autocomplete and search feature for item names and SKUs using a lightweight ONNX multilingual embedding model and pgvector HNSW similarity search on the backend.

**Architecture:** Use `onnxruntime` and HF `tokenizers` locally on the Python FastAPI backend to compute embeddings in < 15ms. Store these 3072-dimensional zero-padded embeddings directly in `products.embedding` inside `blonjo_db` (using the existing `ix_products_embedding_hnsw` HNSW index on `halfvec`). Connect the frontend `SmartTextarea` to query this fast semantic autocomplete API.

**Tech Stack:** FastAPI, SQLAlchemy, `onnxruntime`, `tokenizers`, `pgvector` (PostgreSQL), React/TS.

---

### Task 1: Add Python Backend Dependencies

**Files:**
- Modify: `sajen/pyproject.toml`

**Steps:**
1. Open [pyproject.toml](file:///Users/user/kerjaan/jualan/sajen/pyproject.toml) and add the following dependencies:
   - `onnxruntime>=1.17.0`
   - `tokenizers>=0.19.0`
   - `numpy>=1.24.0`
2. Run lock or install command to update dependencies.

---

### Task 2: Create Model Download Script

**Files:**
- Create: `sajen/app/scripts/download_model.py`

**Steps:**
1. Create a script to download the optimized `intfloat/multilingual-e5-small` ONNX model and its tokenizer configuration.
2. Store the downloaded model (`model.onnx`) and `tokenizer.json` inside the folder `sajen/app/resources/models/`.

---

### Task 3: Implement ONNX Embedding Service

**Files:**
- Create: `sajen/app/services/onnx_embed.py`

**Steps:**
1. Load ONNX model and tokenizer.
2. Tokenize input text.
3. Run ONNX inference to obtain token embeddings.
4. Perform mean pooling and L2 normalization.
5. Pad the resulting vector with zeros up to 3072 dimensions to match `blonjo_db` schema.

---

### Task 4: Create Fast Semantic Search & Autocomplete API Endpoint

**Files:**
- Modify: `sajen/app/api/v1/inventory.py`

**Steps:**
1. Define a request model `AutocompleteRequest` containing `query: str`.
2. Add a `POST /inventory/autocomplete-semantic` route.
3. Compute embedding using the local `ONNXEmbeddingEngine`.
4. Perform similarity search in `blonjo_db` using SQLAlchemy and the HNSW index.
5. Return suggestions with relevance scores.

---

### Task 5: Background Task for Product Embedding Updates

**Files:**
- Modify: `sajen/app/api/v1/inventory.py` (during item creation/update)
- Create/Modify background Celery or thread executor: `sajen/app/tasks/inventory.py` (if any, otherwise run in FastAPI background tasks)

**Steps:**
1. Hook into `POST /inventory/items` (create) and `PUT /inventory/items/{item_id}` (update).
2. Trigger background embedding generation when item `name` or `sku` is updated.
3. Populate `products.embedding` column with the new vector.

---

### Task 6: Integrate with Blonjo Frontend Autocomplete

**Files:**
- Modify: `blonjo/src/components/SmartTextarea.tsx`

**Steps:**
1. Modify autocomplete logic to call `/inventory/autocomplete-semantic` instead of relying purely on regex and text-matching if vector status is active.
2. Display suggestions based on the high similarity scores returned by pgvector search.
