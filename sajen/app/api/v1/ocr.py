import os
import shutil
import uuid
from fastapi import APIRouter, HTTPException, status, UploadFile, Body
from typing import List, Annotated, Any

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
from app.services.ai_engine import call_ai_vision, call_ai_text
import json

router = APIRouter()

UPLOAD_DIR = "/app/uploads"
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
            return extracted_data
            
    # 2. Lakukan pemetaan dari skema baru ke skema lama
    transaction_sec = extracted_data.get("transaction") or {}
    merchant_sec = extracted_data.get("merchant") or {}
    summary_sec = extracted_data.get("summary") or {}
    tx_type = extracted_data.get("transaction_type") or "purchase"
    
    tgl_nota = transaction_sec.get("date") or extracted_data.get("transaction_date") or ""
    supplier_nota = merchant_sec.get("brand_name") or extracted_data.get("description") or "Supplier"
    invoice_no = transaction_sec.get("invoice_number") or ""
    alamat_nota = merchant_sec.get("address") or ""
    
    # Ambil list item untuk deskripsi
    items_list = extracted_data.get("items") or []
    item_names = [i.get("product_name") or i.get("name") or "Item" for i in items_list[:3]]
    item_str = ", ".join(item_names)
    if len(items_list) > 3:
        item_str += f" dan {len(items_list)-3} item lainnya"

    # Template Deskripsi sesuai permintaan user
    if tx_type == "purchase":
        desc = f"Belanja tanggal {tgl_nota} di {supplier_nota}:\n {item_str}"
        if alamat_nota:
            desc += f"\nAlamat: {alamat_nota}"
    else:
        desc = supplier_nota

    mapped_data = {
        "transaction_date": tgl_nota,
        "reference_no": invoice_no,
        "description": desc,
        "total_amount": summary_sec.get("grand_total") or extracted_data.get("total_amount") or 0.0,
        "transaction_type": tx_type,
        "items": []
    }
    
    # Petakan list items
    new_items = extracted_data.get("items") or []
    for item in new_items:
        if not isinstance(item, dict):
            continue
        # Jika item sudah dalam format lama, pertahankan
        if "name" in item:
            mapped_data["items"].append(item)
            continue
            
        mapped_data["items"].append({
            "name": item.get("product_name") or "",
            "qty": item.get("quantity") or 1,
            "price": item.get("unit_price") or 0.0,
            "total": item.get("subtotal") or 0.0,
            "contact_name": supplier_nota,
            "contact_address": alamat_nota
        })
        
    return mapped_data


@router.post("/upload", response_model=OCRTaskResponse, status_code=status.HTTP_201_CREATED)
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
        
    safe_filename = f"{current_user.id}_{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create DB Record
    new_task = OCRTask(
        tenant_id=current_user.tenant_id,
        user_id=current_user.id,
        file_name=file.filename,
        file_path=file_path
    )
    session.add(new_task)
    session.commit()
    session.refresh(new_task)

    # Dispatch to Celery Worker
    process_receipt_ocr.delay(new_task.id)

    return new_task

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
    tasks = session.query(OCRTask).filter(OCRTask.user_id == current_user.id).order_by(OCRTask.id.desc()).limit(limit).all()
    for task in tasks:
        if task.extracted_data:
            task.extracted_data = _map_rich_schema_to_frontend(task.extracted_data)
        if task.corrected_data:
            task.corrected_data = _map_rich_schema_to_frontend(task.corrected_data)
    return tasks

@router.get("/tasks/{task_id}", response_model=OCRTaskResponse)
@router.get("/tasks/{task_id}/", response_model=OCRTaskResponse, include_in_schema=False)
def get_ocr_task_detail(
    task_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get the status and results of a specific OCR task.
    """
    task = session.query(OCRTask).filter(OCRTask.id == task_id, OCRTask.user_id == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="OCR Task not found")
    
    if task.extracted_data:
        task.extracted_data = _map_rich_schema_to_frontend(task.extracted_data)
    if task.corrected_data:
        task.corrected_data = _map_rich_schema_to_frontend(task.corrected_data)
    return task

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ocr_task(
    task_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Delete an OCR task and its physical file.
    """
    task = session.query(OCRTask).filter(OCRTask.id == task_id, OCRTask.user_id == current_user.id).first()
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
    task = session.query(OCRTask).filter(OCRTask.id == task_id, OCRTask.user_id == current_user.id).first()
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
    
    session.commit()
    session.refresh(task)
    
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
    # Mengambil data dari knowledge_vectors di database yang sama (shared db)
    query = text("""
        SELECT id, content as raw_ocr_text, 
               (metadata->>'tenant_id')::int as tenant_id,
               metadata->>'file_name' as file_name,
               metadata->>'expected_output' as expected_output,
               COALESCE((metadata->>'usage_count')::int, 0) as usage_count
        FROM knowledge_vectors
        WHERE metadata->>'app_context' = 'sajen_ocr'
          AND ((metadata->>'tenant_id')::int = :tid OR metadata->>'tenant_id' IS NULL)
        ORDER BY id DESC
    """)
    result = session.execute(query, {"tid": current_user.tenant_id}).fetchall()
    
    # Map back to expected schema
    return [
        {
            "id": row.id,
            "tenant_id": row.tenant_id,
            "file_name": row.file_name,
            "raw_ocr_text": row.raw_ocr_text,
            "expected_output": row.expected_output,
            "usage_count": row.usage_count
        } for row in result
    ]

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
    resp = requests.post(url, json=payload, timeout=15)
    
    if resp.status_code != 200:
        raise HTTPException(status_code=500, detail=f"Gagal menyimpan ke MCP: {resp.text}")
        
    return {
        "id": 0, # Placeholder, since MCP uses UUID for id, but UI expects integer. We'll return 0 for now.
        "tenant_id": current_user.tenant_id,
        "file_name": template_in.file_name,
        "raw_ocr_text": template_in.raw_ocr_text,
        "expected_output": template_in.expected_output,
        "usage_count": 0
    }

@router.put("/training-templates/{template_id}", response_model=AILearningTemplateResponse)
def update_training_template(
    template_id: str, 
    template_in: AILearningTemplateCreate, 
    session: SessionDep, 
    current_user: CurrentUser
):
    # For update, since MCP ingest appends, we update raw SQL directly for simplicity
    from app.services.ai_engine import get_embedding
    import json
    
    vec = get_embedding(template_in.raw_ocr_text)
    vec_str = f"[{','.join(map(str, vec))}]" if vec else None
    
    meta_update = json.dumps({
        "app_context": "sajen_ocr",
        "tenant_id": current_user.tenant_id,
        "file_name": template_in.file_name,
        "expected_output": template_in.expected_output,
        "usage_count": 0
    })
    
    query = text("""
        UPDATE knowledge_vectors 
        SET content = :content, metadata = :meta::jsonb, embedding = :vec::halfvec
        WHERE id::text = :id AND (metadata->>'tenant_id')::int = :tid
        RETURNING id
    """)
    result = session.execute(query, {
        "content": template_in.raw_ocr_text,
        "meta": meta_update,
        "vec": vec_str,
        "id": template_id,
        "tid": current_user.tenant_id
    }).first()
    
    if not result:
        raise HTTPException(status_code=404, detail="Template not found or access denied")
        
    session.commit()
    
    return {
        "id": 0,
        "tenant_id": current_user.tenant_id,
        "file_name": template_in.file_name,
        "raw_ocr_text": template_in.raw_ocr_text,
        "expected_output": template_in.expected_output,
        "usage_count": 0
    }

@router.delete("/training-templates/{template_id}")
def delete_training_template(template_id: str, session: SessionDep, current_user: CurrentUser):
    query = text("""
        DELETE FROM knowledge_vectors 
        WHERE id::text = :id AND (metadata->>'tenant_id')::int = :tid
        RETURNING id
    """)
    result = session.execute(query, {"id": template_id, "tid": current_user.tenant_id}).first()
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    session.commit()
    return {"message": "Deleted successfully"}

@router.post("/training-templates/extract-raw")
async def extract_raw_text(file: UploadFile, session: SessionDep, current_user: CurrentUser):
    """Hanya mengekstrak teks mentah dari gambar untuk keperluan Form Training AI"""
    import pytesseract
    from PIL import Image
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

    # 2. Fallback ke Tesseract (kurang akurat untuk tulisan tangan)
    try:
        img = Image.open(io.BytesIO(contents))
        raw_text = pytesseract.image_to_string(img, lang="ind+eng")
        return {"file_name": file.filename, "raw_text": raw_text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Gagal memproses gambar: {str(e)}")

@router.post("/training-templates/process", response_model=AITrainingProcessResponse)
async def process_training_data(
    payload: Annotated[AITrainingProcessRequest, Body(...)],
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Memproses gabungan teks mentah (hasil Vision) dan instruksi user 
    untuk menghasilkan draf Golden Template (Markdown).
    """
    rag_context = get_rag_context(session, current_user.tenant_id)

    system_instruction = (
        "Anda adalah AI Trainer Expert. Tugas Anda adalah membantu user membuat DATASET PEMBELAJARAN (Golden Template).\n"
        "Gunakan data mentah dari OCR dan perbaiki sesuai dengan INSTRUKSI CARA BACA yang diberikan user.\n"
        "Output harus berupa teks Markdown yang sangat rapi dan detail."
    )

    prompt = f"""
INSTRUKSI CARA BACA DARI USER:
{payload.instructions}

TEKS MENTAH DARI OCR:
{payload.raw_text}

{rag_context}

Tugas: Susun ulang data di atas menjadi laporan Markdown yang rapi. 
Pastikan seluruh rincian item masuk ke dalam tabel Markdown.
"""

    res = call_ai_text(session, prompt, system_instruction=system_instruction)

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

