import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from app.api.deps import SessionDep, CurrentUser
from app.models.ocr import OCRTask
from app.schemas.ocr import OCRTaskResponse
from app.workers.ocr_worker import process_receipt_ocr

router = APIRouter()

UPLOAD_DIR = "/app/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

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

    # Save file locally (in Docker volume)
    file_path = os.path.join(UPLOAD_DIR, f"{current_user.id}_{file.filename}")
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
    """
    return session.query(OCRTask).filter(OCRTask.user_id == current_user.id).order_by(OCRTask.id.desc()).limit(limit).all()

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
