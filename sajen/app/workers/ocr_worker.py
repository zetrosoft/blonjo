import os
import base64
import json
from celery import shared_task
from sqlalchemy.orm import Session
from ollama import Client

from app.core.database import SessionLocal
from app.models.ocr import OCRTask, OCRStatus
from app.core.config import settings

# Initialize Ollama client
# Assuming Ollama is running on the host machine or another container accessible at host.docker.internal
# Modify OLLAMA_HOST in production / .env
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
ollama_client = Client(host=OLLAMA_HOST)

@shared_task(name="app.workers.ocr_worker.process_receipt_ocr", bind=True, max_retries=3)
def process_receipt_ocr(self, task_id: int):
    """
    Celery task to process an uploaded receipt using Ollama Vision model.
    """
    db: Session = SessionLocal()
    task = db.query(OCRTask).filter(OCRTask.id == task_id).first()
    
    if not task:
        db.close()
        return {"status": "error", "message": "Task not found"}

    try:
        # 1. Update status to processing
        task.status = OCRStatus.PROCESSING
        db.commit()

        # 2. Read the image file and encode to base64
        with open(task.file_path, "rb") as image_file:
            encoded_image = base64.b64encode(image_file.read()).decode("utf-8")

        # 3. Construct prompt for Ollama
        # Using few-shot learning by injecting previous corrections from the database is highly recommended here in the future.
        prompt = """
        You are an expert accountant AI. 
        Extract the structured transaction data from this receipt image.
        Provide the output EXCLUSIVELY in valid JSON format with the following keys:
        - transaction_date (YYYY-MM-DD format)
        - reference_no (string, receipt number)
        - description (string, summary of purchase/sales)
        - total_amount (number, total money exchanged)
        - transaction_type (either "purchase", "sales", or "expense")
        - items (array of objects with 'name', 'qty', 'price', 'total')
        Do not include markdown blocks or any other text.
        """

        # 4. Call Ollama model (e.g., llava or llama3.2-vision)
        response = ollama_client.generate(
            model='llava', # Ensure this model is pulled on the host machine
            prompt=prompt,
            images=[encoded_image],
            stream=False,
            options={
                "temperature": 0.1 # Low temperature for factual extraction
            }
        )
        
        # 5. Parse Response
        raw_output = response['response']
        # Very basic cleaning in case Ollama returns markdown blocks
        clean_json = raw_output.replace("```json", "").replace("```", "").strip()
        extracted_data = json.loads(clean_json)

        # 6. Save result
        task.extracted_data = extracted_data
        task.status = OCRStatus.COMPLETED
        db.commit()
        
        return {"status": "success", "task_id": task_id}

    except json.JSONDecodeError:
        task.status = OCRStatus.FAILED
        task.error_message = "Failed to parse Ollama output into valid JSON."
        db.commit()
        return {"status": "error", "message": "JSON Parse Error"}
    except Exception as exc:
        task.status = OCRStatus.FAILED
        task.error_message = str(exc)
        db.commit()
        # Retry mechanism for temporary Ollama failures
        raise self.retry(exc=exc, countdown=10)
    finally:
        db.close()
