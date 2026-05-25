import os
import shutil
import uuid
from fastapi import APIRouter, HTTPException, status, UploadFile
from typing import List

from app.api.deps import SessionDep, CurrentUser
from app.models.ocr import OCRTask, OCRFeedback, OCRStatus
from app.schemas.ocr import OCRTaskResponse, OCRCorrectionRequest
from app.workers.ocr_worker import process_receipt_ocr

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
    
    mapped_data = {
        "transaction_date": transaction_sec.get("date") or extracted_data.get("transaction_date") or "",
        "reference_no": transaction_sec.get("invoice_number") or extracted_data.get("reference_no"),
        "description": merchant_sec.get("brand_name") or extracted_data.get("description") or "Pembelian Nota",
        "total_amount": summary_sec.get("grand_total") or extracted_data.get("total_amount") or 0.0,
        "transaction_type": extracted_data.get("transaction_type") or "purchase",
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
            "total": item.get("subtotal") or 0.0
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

