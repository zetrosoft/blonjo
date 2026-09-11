import os
import shutil
import uuid
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, UploadFile, Body
from fastapi.responses import FileResponse
from typing import List, Annotated, Any

logger = logging.getLogger(__name__)

from app.api.deps import SessionDep, CurrentUser
from app.models.ocr import OCRTask, OCRFeedback, OCRStatus
from app.models.log import AIParsingLog
from app.schemas.ocr import (
    OCRTaskResponse, 
    OCRCorrectionRequest, 
    AILearningTemplateCreate, 
    AILearningTemplateResponse,
    AITrainingProcessRequest,
    AITrainingProcessResponse
)
from app.workers.ocr_worker import process_receipt_ocr
from app.services.ai_context import get_rag_context
from app.services.ai_engine import call_ai_vision, call_ai_text, call_ai_freetext
import json

router = APIRouter()

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "/tmp/sajen_uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _map_rich_schema_to_frontend(extracted_data: dict) -> dict:
    """
    Adapter untuk memetakan skema JSON akuntansi kaya yang baru
    ke format lama yang diharapkan oleh UI frontend Blonjo.
    Mencegah rusaknya visualisasi dashboard di browser.
    """
    if not extracted_data:
        return {}
        
    # 1. Jika data sudah menggunakan format lama, kembalikan langsung
    if "total_amount" in extracted_data and "items" in extracted_data:
        # Periksa apakah item di dalam array juga sudah format lama
        items = extracted_data.get("items") or []
        if not items or (isinstance(items[0], dict) and "name" in items[0]):
            # Sanitize LLM babble from description if it exists
            desc = extracted_data.get("description", "")
            if isinstance(desc, str) and ("Berikut adalah" in desc or "ekstraksi data" in desc or "format tabel" in desc):
                tgl = extracted_data.get("transaction_date", "")
                supplier = extracted_data.get("toko") or extracted_data.get("contact_name") or "Supplier"
                item_names = [i.get("name", "Item") for i in items[:3]] if items else []
                item_str = ", ".join(item_names)
                if len(items) > 3:
                    item_str += f" dan {len(items)-3} item lainnya"
                
                t_type = extracted_data.get("transaction_type") or "purchase"
                if t_type == "purchase":
                    extracted_data["description"] = f"Transaksi Pembelian di {supplier}"
                    if tgl:
                        extracted_data["description"] += f" pada tanggal {tgl}"
                elif t_type == "sales":
                    extracted_data["description"] = f"Transaksi Penjualan di {supplier}"
                    if tgl:
                        extracted_data["description"] += f" pada tanggal {tgl}"
                else:
                    extracted_data["description"] = f"Transaksi di {supplier}"
                    if tgl:
                        extracted_data["description"] += f" pada tanggal {tgl}"
                if item_str:
                    extracted_data["description"] += f" ({item_str})"

            return extracted_data
            
    # 2. Lakukan pemetaan dari skema baru ke skema lama
    transaction_sec = extracted_data.get("transaction") or extracted_data.get("info_transaksi") or {}
    merchant_sec = extracted_data.get("merchant") or {}
    summary_sec = extracted_data.get("summary") or extracted_data.get("rincian_pembayaran") or {}
    tx_type = extracted_data.get("transaction_type") or "purchase"
    
    tgl_nota = transaction_sec.get("date") or transaction_sec.get("tanggal") or extracted_data.get("transaction_date") or ""
    
    # Perbaiki tanggal jika tertukar (misal DD/MM/YY terbaca YY/MM/DD) atau masih 2-digit
    if tgl_nota:
        try:
            tgl_clean = tgl_nota.replace("/", "-")
            parts = tgl_clean.split("-")
            if len(parts) == 3:
                # Pola YYYY-MM-DD
                if len(parts[0]) == 4:
                    y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
                    if y < 2015 and d >= 20:
                        new_y = 2000 + d
                        new_d = y % 100
                        tgl_nota = f"{new_y}-{m:02d}-{new_d:02d}"
                # Pola DD-MM-YY (2 digit tahun)
                elif len(parts[0]) <= 2 and len(parts[2]) <= 2:
                    d, m, y = int(parts[0]), int(parts[1]), int(parts[2])
                    # Pastikan tahun terformat 4 digit (20xx)
                    new_y = 2000 + y if y < 100 else y
                    tgl_nota = f"{new_y}-{m:02d}-{d:02d}"
        except Exception as e:
            print(f"Date correction in ocr error: {e}")

    # Cari supplier secara dinamis dari berbagai kemungkinan struktur JSON
    supplier_nota = (
        merchant_sec.get("brand_name") 
        or merchant_sec.get("name") 
        or extracted_data.get("company_name") 
        or extracted_data.get("supplier_name") 
        or extracted_data.get("vendor_name") 
        or extracted_data.get("toko") 
        or (extracted_data.get("company_info") or {}).get("name")
        or (extracted_data.get("vendor") or {}).get("name")
        or (extracted_data.get("header") or {}).get("company_name")
        or "Supplier"
    )
    
    # Cari alamat secara dinamis
    alamat_nota = (
        merchant_sec.get("address") 
        or merchant_sec.get("alamat")
        or extracted_data.get("company_address") 
        or extracted_data.get("supplier_address") 
        or (extracted_data.get("company_info") or {}).get("address")
        or (extracted_data.get("vendor") or {}).get("address")
        or (extracted_data.get("header") or {}).get("company_address")
        or ""
    )
    
    invoice_no = transaction_sec.get("invoice_number") or transaction_sec.get("no_nota") or ""
    
    # Ambil list item untuk deskripsi
    items_list = extracted_data.get("items") or extracted_data.get("item_belanja") or []
    item_names = [i.get("product_name") or i.get("nama_barang") or i.get("item_name") or i.get("name") or "Item" for i in items_list[:3]]
    item_str = ", ".join(item_names)
    if len(items_list) > 3:
        item_str += f" dan {len(items_list)-3} item lainnya"

    # Template Deskripsi sesuai permintaan user (Format: Transaksi Pembelian/Penjualan di {Supplier} pada tanggal {Tanggal})
    if tx_type == "purchase":
        desc = f"Transaksi Pembelian di {supplier_nota}"
        if tgl_nota:
            desc += f" pada tanggal {tgl_nota}"
    elif tx_type == "sales":
        desc = f"Transaksi Penjualan di {supplier_nota}"
        if tgl_nota:
            desc += f" pada tanggal {tgl_nota}"
    else:
        desc = f"Transaksi di {supplier_nota}"
        if tgl_nota:
            desc += f" pada tanggal {tgl_nota}"
    if item_str:
        desc += f" ({item_str})"

    # Gunakan deskripsi cerdas dari AI jika ada, jika tidak fallback ke template auto-generate
    final_desc = extracted_data.get("description") or desc

    mapped_data = {
        "transaction_date": tgl_nota,
        "due_date": transaction_sec.get("due_date"),
        "payment_method": transaction_sec.get("payment_method"),
        "reference_no": invoice_no,
        "description": final_desc,
        "contact_name": supplier_nota,
        "contact_address": alamat_nota,
        "total_amount": summary_sec.get("grand_total") or summary_sec.get("total") or extracted_data.get("total_amount") or 0.0,
        "global_discount_amount": summary_sec.get("global_discount_amount") or 0.0,
        "tax_treatment": summary_sec.get("tax_treatment") or "none",
        "tax_percentage": summary_sec.get("tax_percentage") or 0.0,
        "tax_amount": summary_sec.get("tax_amount") or 0.0,
        "transaction_type": tx_type,
        "items": []
    }
    
    # Petakan list items
    new_items = extracted_data.get("items") or extracted_data.get("item_belanja") or []
    for item in new_items:
        if not isinstance(item, dict):
            continue
        
        raw_product_name = item.get("product_name") or item.get("nama_barang") or item.get("item_name") or item.get("name") or ""
        item_qty = item.get("quantity") or item.get("kuantitas") or item.get("qty") or 1
        try:
            item_qty = float(item_qty)
        except (ValueError, TypeError):
            item_qty = 1.0

        item_subtotal = item.get("subtotal") or item.get("jumlah") or item.get("total") or item.get("Jumlah") or item.get("neto") or 0.0
        try:
            item_subtotal = float(item_subtotal)
        except (ValueError, TypeError):
            item_subtotal = 0.0

        item_price = item.get("unit_price") or item.get("harga_satuan") or item.get("price") or item.get("Harga @") or 0.0
        try:
            item_price = float(item_price)
        except (ValueError, TypeError):
            item_price = 0.0

        # Cari diskon secara dinamis (termasuk kolom terpisah discount_product + discount_customer pada faktur distributor)
        discount_val = 0.0
        disc_prod = item.get("discount_product") or 0.0
        disc_cust = item.get("discount_customer") or 0.0
        try:
            total_distro_disc = float(disc_prod) + float(disc_cust)
        except (ValueError, TypeError):
            total_distro_disc = 0.0

        if total_distro_disc > 0:
            discount_val = total_distro_disc
        else:
            for k, v in item.items():
                if any(x in k.lower() for x in ["discount", "diskon", "potongan", "disc"]):
                    try:
                        parsed_val = float(v)
                        if parsed_val > 0:
                            discount_val = parsed_val
                            break
                    except:
                        pass

        # Self-Healing: Jika diskon 0 namun (qty * price) > subtotal, selisihnya adalah diskon tersirat
        if discount_val == 0.0 and item_qty > 0 and item_price > 0 and item_subtotal > 0:
            gross = item_qty * item_price
            if gross > item_subtotal and (gross - item_subtotal) >= 1.0:
                discount_val = round(gross - item_subtotal, 2)

        # Jika item_price 0 / kosong tapi subtotal ada:
        if (not item_price or item_price == 0.0) and item_subtotal > 0 and item_qty > 0:
            item_price = round((item_subtotal + discount_val) / item_qty, 2)

        # Jika item sudah dalam format lama, pertahankan dan perbarui discount
        if "name" in item and "product_name" not in item and "nama_barang" not in item and "item_name" not in item:
            item_mapped = {**item}
            item_mapped["discount"] = discount_val
            item_mapped["ocr_name"] = item.get("name", "")
            item_mapped["price"] = item_price
            item_mapped["total"] = item_subtotal
            mapped_data["items"].append(item_mapped)
            continue

        mapped_data["items"].append({
            "name": raw_product_name,
            "ocr_name": raw_product_name,
            "qty": item_qty,
            "price": item_price,
            "total": item_subtotal,
            "unit": item.get("uom") or item.get("unit") or item.get("satuan") or "pcs",
            "discount": discount_val,
            "contact_name": supplier_nota,
            "contact_address": alamat_nota
        })
        
    return mapped_data


@router.post("/upload", response_model=OCRTaskResponse, status_code=status.HTTP_201_CREATED)
@router.post("/upload/", response_model=OCRTaskResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def upload_receipt(
    file: UploadFile,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Upload a receipt image (JPEG/PNG/PDF).
    Creates an OCR Task and dispatches it to the Celery worker for Ollama processing.
    """
    allowed_types = ["image/jpeg", "image/png", "application/pdf"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Invalid file type. Only JPEG, PNG, and PDF are allowed.")

    # Save file locally with a secure randomized UUID name to prevent Path Traversal
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".pdf"]:
        raise HTTPException(status_code=400, detail="Invalid file extension.")

    file_bytes = await file.read()
    from app.services.vision_matcher import compute_image_signature
    img_phash_val = compute_image_signature(file_bytes)

    safe_filename = f"{current_user.id}_{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    with open(file_path, "wb") as buffer:
        buffer.write(file_bytes)

    task = OCRTask(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        file_name=file.filename,
        file_path=file_path,
        status=OCRStatus.PENDING,
        image_hash=img_phash_val,
    )
    session.add(task)
    session.commit()
    session.refresh(task)

    process_receipt_ocr.delay(task.id)

    return task

@router.get("/tasks", response_model=List[OCRTaskResponse])
def get_ocr_tasks(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = 50
):
    """
    Get the status and results of uploaded receipts.
    Memetakan secara transparan hasil format baru ke format lama sebelum dikirim ke frontend.
    """
    from app.services.ocr_normalizer import apply_ocr_entity_aliases
    tasks = session.query(OCRTask).filter(OCRTask.user_id == current_user.id, OCRTask.tenant_id == current_user.tenant_id).order_by(OCRTask.id.desc()).limit(limit).all()
    for task in tasks:
        if task.extracted_data:
            task.extracted_data = apply_ocr_entity_aliases(session, task.tenant_id, task.extracted_data)
            task.extracted_data = _map_rich_schema_to_frontend(task.extracted_data)
        if task.corrected_data:
            task.corrected_data = _map_rich_schema_to_frontend(task.corrected_data)
    return tasks

@router.get("/tasks/{task_id}", response_model=OCRTaskResponse)
@router.get("/tasks/{task_id}/", response_model=OCRTaskResponse, include_in_schema=False)
def get_ocr_task_detail(
    task_id: int,
    session: SessionDep,
    current_user: CurrentUser,
):
    """
    Get detailed result of an OCR task by ID.
    Supports smart continuous polling:
    - If status == PENDING/PROCESSING, returns instantly.
    - If completed, returns extracted_data.
    - Uses Universal Multi-Vector Semantic Basket Duplicate Matcher to detect actual active transactions.
    """
    task = session.query(OCRTask).filter(
        OCRTask.id == task_id,
        OCRTask.tenant_id == current_user.tenant_id,
    ).first()

    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="OCR task tidak ditemukan",
        )

    if task.extracted_data or task.corrected_data:
        from app.services.ocr_normalizer import find_semantic_basket_duplicate
        
        dup_check = find_semantic_basket_duplicate(
            db=session,
            tenant_id=current_user.tenant_id,
            parsed_data=task.corrected_data or task.extracted_data,
            current_task_id=task.id
        )
        if dup_check.get("is_duplicate", False):
            setattr(task, "is_duplicate", True)
            setattr(task, "duplicate_warning", dup_check.get("duplicate_warning"))
        else:
            setattr(task, "is_duplicate", False)

    if task.extracted_data:
        from app.services.ocr_normalizer import apply_ocr_entity_aliases
        task.extracted_data = apply_ocr_entity_aliases(session, task.tenant_id, task.extracted_data)
        task.extracted_data = _map_rich_schema_to_frontend(task.extracted_data)
    if task.corrected_data:
        task.corrected_data = _map_rich_schema_to_frontend(task.corrected_data)
    return task

@router.get("/tasks/{task_id}/image")
@router.get("/tasks/{task_id}/image/", include_in_schema=False)
def get_ocr_task_image(
    task_id: int,
    session: SessionDep,
):
    """
    Serve physical receipt image file for an OCR task.
    """
    task = session.query(OCRTask).filter(OCRTask.id == task_id).first()
    if not task or not task.file_path or not os.path.exists(task.file_path):
        raise HTTPException(status_code=404, detail="Image file not found")
    
    return FileResponse(task.file_path)

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ocr_task(
    task_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Delete an OCR task and its physical file.
    """
    task = session.query(OCRTask).filter(OCRTask.id == task_id, OCRTask.user_id == current_user.id, OCRTask.tenant_id == current_user.tenant_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="OCR Task not found")
    
    # Delete physical file
    if task.file_path and os.path.exists(task.file_path):
        try:
            os.remove(task.file_path)
        except Exception as e:
            print(f"Error removing file: {e}")

    session.delete(task)
    session.commit()
    return None

@router.post("/tasks/{task_id}/correct", response_model=OCRTaskResponse)
def correct_ocr_task(
    task_id: int,
    payload: OCRCorrectionRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Submit manual user correction for an OCR task.
    Compares original vision data with user inputs, records feedback to database,
    and updates the task status to CORRECTED.
    """
    task = session.query(OCRTask).filter(OCRTask.id == task_id, OCRTask.user_id == current_user.id, OCRTask.tenant_id == current_user.tenant_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="OCR Task not found")
        
    if task.status not in [OCRStatus.COMPLETED, OCRStatus.CORRECTED]:
        raise HTTPException(status_code=400, detail="Only completed or corrected tasks can be corrected.")

    # Petakan data asli akuntansi kaya baru ke format lama sebelum pembandingan selisih
    original = _map_rich_schema_to_frontend(task.extracted_data or {})
    corrected = payload.model_dump()

    # 1. Compare global properties
    fields_to_compare = ["transaction_date", "reference_no", "description", "total_amount", "transaction_type"]
    for field in fields_to_compare:
        orig_val = str(original.get(field)) if original.get(field) is not None else ""
        corr_val = str(corrected.get(field)) if corrected.get(field) is not None else ""
        if orig_val != corr_val:
            # Record feedback
            fb = OCRFeedback(
                ocr_task_id=task.id,
                field_name=field,
                original_value=orig_val,
                corrected_value=corr_val
            )
            session.add(fb)

    # 2. Compare items (list of goods)
    orig_items = original.get("items") or []
    corr_items = corrected.get("items") or []
    
    # We can compare them by indexing
    max_len = max(len(orig_items), len(corr_items))
    for i in range(max_len):
        if i < len(orig_items) and i < len(corr_items):
            orig_item = orig_items[i]
            corr_item = corr_items[i]
            
            # Compare name
            if orig_item.get("name") != corr_item.get("name"):
                session.add(OCRFeedback(
                    ocr_task_id=task.id,
                    field_name=f"item_{i}_name",
                    original_value=str(orig_item.get("name")),
                    corrected_value=str(corr_item.get("name"))
                ))
            # Compare price
            if orig_item.get("price") != corr_item.get("price"):
                session.add(OCRFeedback(
                    ocr_task_id=task.id,
                    field_name=f"item_{i}_price",
                    original_value=str(orig_item.get("price")),
                    corrected_value=str(corr_item.get("price"))
                ))
            # Compare qty
            if orig_item.get("qty") != corr_item.get("qty"):
                session.add(OCRFeedback(
                    ocr_task_id=task.id,
                    field_name=f"item_{i}_qty",
                    original_value=str(orig_item.get("qty")),
                    corrected_value=str(corr_item.get("qty"))
                ))
        elif i < len(orig_items):
            # Deleted item
            orig_item = orig_items[i]
            session.add(OCRFeedback(
                ocr_task_id=task.id,
                field_name=f"item_{i}_deleted",
                original_value=str(orig_item.get("name")),
                corrected_value=""
            ))
        elif i < len(corr_items):
            # Added item
            corr_item = corr_items[i]
            session.add(OCRFeedback(
                ocr_task_id=task.id,
                field_name=f"item_{i}_added",
                original_value="",
                corrected_value=str(corr_item.get("name"))
            ))

    # 3. Update task
    task.corrected_data = corrected
    task.status = OCRStatus.CORRECTED

    # 3.5 Record Entity-Level Alias Mappings (Fast-Path Normalizer Learning)
    from app.services.ocr_normalizer import record_ocr_entity_aliases
    record_ocr_entity_aliases(session, task.tenant_id, original, corrected)
    
    # 3.6 Compute Universal Deep JSON Delta
    from app.services.ocr_distiller import compute_deep_json_delta, distill_supplier_rules, upsert_supplier_rules
    delta_summary = compute_deep_json_delta(original, corrected)
    
    session.commit()
    session.refresh(task)
    
    # 4. Background Async Distillation & RAG Ingest (Non-blocking)
    #    Menyintesis aturan supplier baru dan menyimpannya ke database
    import threading, requests as _req, json as _json
    from app.core.config import settings as _settings
    from app.core.database import SessionLocal

    def _ingest_and_distill():
        # A. Distilasi Aturan Supplier
        try:
            supplier_name = (
                corrected.get("contact_name")
                or corrected.get("supplier_name")
                or corrected.get("toko")
                or (corrected.get("merchant") or {}).get("name")
                or original.get("contact_name")
                or original.get("toko")
                or ""
            )
            raw_text = task.raw_ocr_text or ""
            if supplier_name and delta_summary:
                distill_db = SessionLocal()
                try:
                    rules = distill_supplier_rules(distill_db, task.tenant_id, supplier_name, raw_text, delta_summary)
                    if rules:
                        upsert_supplier_rules(distill_db, task.tenant_id, supplier_name, rules, delta_summary)
                finally:
                    distill_db.close()
        except Exception as _de:
            print(f"[Rule Distiller] ❌ Background distillation error task {task.id}: {_de}")

        # B. Auto-ingest ke RAG MCP
        try:
            raw_text = task.raw_ocr_text or ""
            if not raw_text or not task.corrected_data:
                return
            payload = {
                "raw_ocr_text": raw_text,
                "expected_output": _json.dumps(task.corrected_data, ensure_ascii=False),
                "tenant_id": task.tenant_id,
                "file_name": task.file_name or "unknown"
            }
            url = f"{_settings.MCP_SERVER_URL.rstrip('/')}/api/v1/rag/ingest"
            resp = _req.post(url, json=payload, timeout=20)
            if resp.status_code == 200:
                print(f"[RAG Auto-Ingest] ✅ Task {task.id} ({task.file_name}) berhasil dipelajari oleh MCP RAG.")
            else:
                print(f"[RAG Auto-Ingest] ⚠️ Task {task.id} gagal ingest: HTTP {resp.status_code} — {resp.text[:200]}")
        except Exception as _e:
            print(f"[RAG Auto-Ingest] ❌ Error background ingest task {task.id}: {_e}")

    threading.Thread(target=_ingest_and_distill, daemon=True).start()

    # Map back for response format compatibility
    if task.extracted_data:
        task.extracted_data = _map_rich_schema_to_frontend(task.extracted_data)
    if task.corrected_data:
        task.corrected_data = _map_rich_schema_to_frontend(task.corrected_data)
        
    return task

# === AI TRAINING TEMPLATES ENDPOINTS (STATELESS VIA KNOWLEDGE_VECTORS) ===
from sqlalchemy import text

@router.get("/training-templates", response_model=List[AILearningTemplateResponse])
def get_training_templates(session: SessionDep, current_user: CurrentUser):
    # Mengambil data dari knowledge_vectors di database MCP via HTTP API
    import requests
    from app.core.config import settings
    url = f"{settings.MCP_SERVER_URL.rstrip('/')}/api/v1/rag/templates"
    
    try:
        resp = requests.get(url, params={"tenant_id": current_user.tenant_id}, timeout=15)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Gagal mengambil dari MCP: {resp.text}")
        templates = resp.json()
        
        # Map back to expected schema
        results = []
        for t in templates:
            # parsing created_at to ISO string compatibility
            created_at_val = t.get("created_at") or datetime.utcnow().isoformat()
            results.append({
                "id": str(t.get("id")),
                "tenant_id": t.get("tenant_id"),
                "file_name": t.get("file_name"),
                "raw_ocr_text": t.get("raw_ocr_text"),
                "expected_output": t.get("expected_output"),
                "usage_count": t.get("usage_count", 0),
                "created_at": created_at_val
            })
        return results
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Koneksi ke MCP Hub gagal: {str(e)}")

@router.post("/training-templates", response_model=AILearningTemplateResponse)
def create_training_template(template_in: AILearningTemplateCreate, session: SessionDep, current_user: CurrentUser):
    # Hit MCP Server Ingest API to handle embedding and storage uniformly
    import requests
    from app.core.config import settings
    url = f"{settings.MCP_SERVER_URL.rstrip('/')}/api/v1/rag/ingest"
    payload = {
        "raw_ocr_text": template_in.raw_ocr_text,
        "expected_output": template_in.expected_output,
        "tenant_id": current_user.tenant_id,
        "file_name": template_in.file_name
    }
    try:
        resp = requests.post(url, json=payload, timeout=15)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Gagal menyimpan ke MCP: {resp.text}")
        
        resp_data = resp.json()
        created_id = resp_data.get("result", {}).get("id") or "0"
        
        return {
            "id": str(created_id),
            "tenant_id": current_user.tenant_id,
            "file_name": template_in.file_name,
            "raw_ocr_text": template_in.raw_ocr_text,
            "expected_output": template_in.expected_output,
            "usage_count": 0,
            "created_at": datetime.utcnow()
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Koneksi ke MCP Hub gagal: {str(e)}")

@router.put("/training-templates/{template_id}", response_model=AILearningTemplateResponse)
def update_training_template(
    template_id: str, 
    template_in: AILearningTemplateCreate, 
    session: SessionDep, 
    current_user: CurrentUser
):
    # Hit MCP Server PUT API to handle update uniformly
    import requests
    from app.core.config import settings
    url = f"{settings.MCP_SERVER_URL.rstrip('/')}/api/v1/rag/templates/{template_id}"
    payload = {
        "raw_ocr_text": template_in.raw_ocr_text,
        "expected_output": template_in.expected_output,
        "tenant_id": current_user.tenant_id,
        "file_name": template_in.file_name
    }
    try:
        resp = requests.put(url, json=payload, timeout=15)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Gagal memperbarui di MCP: {resp.text}")
        
        return {
            "id": template_id,
            "tenant_id": current_user.tenant_id,
            "file_name": template_in.file_name,
            "raw_ocr_text": template_in.raw_ocr_text,
            "expected_output": template_in.expected_output,
            "usage_count": 0,
            "created_at": datetime.utcnow()
        }
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Koneksi ke MCP Hub gagal: {str(e)}")

@router.delete("/training-templates/{template_id}")
def delete_training_template(template_id: str, session: SessionDep, current_user: CurrentUser):
    import requests
    from app.core.config import settings
    url = f"{settings.MCP_SERVER_URL.rstrip('/')}/api/v1/rag/templates/{template_id}"
    try:
        resp = requests.delete(url, timeout=15)
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail=f"Gagal menghapus di MCP: {resp.text}")
        return {"message": "Deleted successfully"}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Koneksi ke MCP Hub gagal: {str(e)}")

@router.post("/training-templates/extract-raw")
async def extract_raw_text(file: UploadFile, session: SessionDep, current_user: CurrentUser):
    """Hanya mengekstrak teks mentah dari gambar untuk keperluan Form Training AI"""
    import io

    contents = await file.read()

    # 1. Coba gunakan Gemini Vision jika tersedia (untuk akurasi tulisan tangan)
    from app.core.config import settings
    if settings.GOOGLE_API_KEY:
        try:
            res = call_ai_vision(
                db=session,
                image_bytes=contents,
                mime_type=file.content_type,
                prompt="Bacakan teks dari nota ini secara lengkap baris demi baris. Gunakan tabel markdown jika ada daftar barang."
            )
            return {"file_name": file.filename, "raw_text": res["raw_text"]}
        except Exception as e:
            print(f"Gemini Vision failed in training, falling back to Tesseract: {e}")

    # 2. Fallback jika Gemini Vision tidak tersedia atau error
    raise HTTPException(status_code=400, detail="Gagal memproses gambar: Gemini Vision tidak tersedia atau mengalami gangguan.")

@router.post("/training-templates/process", response_model=AITrainingProcessResponse)
async def process_training_data(
    payload: Annotated[AITrainingProcessRequest, Body(...)],
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Memproses gabungan teks mentah (hasil Vision) dan instruksi user 
    untuk menghasilkan draf Golden Template (Markdown) yang siap dipakai RAG POS.
    """
    # TIDAK menggunakan get_rag_context() di sini karena akan mencemari output
    # dengan data pricing rules atau history transaksi yang tidak relevan.

    system_instruction = (
        "Anda adalah AI Trainer Expert untuk sistem manajemen toko berbasis AI.\n"
        "Tugas Anda adalah mengubah teks mentah hasil OCR menjadi DATASET PEMBELAJARAN (Golden Template) yang sangat rapi dan terstruktur.\n"
        "Golden Template ini akan digunakan oleh mesin AI untuk mengenali dan memparsing dokumen serupa di masa depan, "
        "termasuk namun tidak terbatas pada: nota pembelian, faktur supplier, struk kasir, input transaksi, atau dokumen bisnis lainnya.\n\n"
        "ATURAN WAJIB:\n"
        "1. Ikuti INSTRUKSI CARA BACA dari user dengan tepat — user adalah penentu apa yang relevan.\n"
        "2. Koreksi nama barang/item yang terpotong atau rusak akibat OCR menjadi nama yang lebih standar dan mudah dibaca.\n"
        "3. Hanya tampilkan kolom dan field yang diminta user di output.\n"
        "4. JANGAN menambahkan data apapun yang tidak ada di teks mentah (jangan tambahkan pricing rules, history, asumsi, atau data luar).\n"
        "5. Format output: Markdown terstruktur dengan section Metadata Dokumen dan Tabel Detail (jika ada).\n"
        "6. Jika instruksi menyebut PPN/pajak sudah termasuk harga, catat di metadata dan JANGAN hitung ulang harga.\n"
    )

    prompt = f"""INSTRUKSI CARA BACA DARI USER:
{payload.instructions}

TEKS MENTAH DARI OCR:
{payload.raw_text}

TUGAS:
Susun ulang data di atas menjadi Golden Template Markdown yang rapi sesuai instruksi.
Pastikan seluruh rincian item masuk ke dalam tabel Markdown.
JANGAN menambahkan data apapun yang tidak ada di teks mentah di atas."""

    res = call_ai_freetext(session, prompt, system_instruction=system_instruction, temperature=0.3)

    # Save Activity Log for Terminal Visibility
    new_log = AIParsingLog(
        tenant_id=current_user.tenant_id,
        original_text=f"AI TRAINING PROCESS: {payload.instructions[:100]}...",
        prompt=prompt,
        parsed_result=res.get("raw_output", ""),
        token_in=res.get("token_in", 0),
        token_out=res.get("token_out", 0),
        processor=res.get("processor", "local")
    )
    session.add(new_log)
    session.commit()

    return AITrainingProcessResponse(
        processed_markdown=res.get("raw_output", ""),
        processor=res.get("processor", "local")
    )

