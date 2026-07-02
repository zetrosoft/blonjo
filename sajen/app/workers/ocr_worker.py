import os
import base64
import json
import re
from celery import shared_task
from sqlalchemy.orm import Session
from google import genai

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.tenant import Tenant 
from app.models.user import User 
from app.models.role import Role 
from app.models.permission import Permission 
from app.models.setting import AppSetting 
from app.models.ocr import OCRTask, OCRStatus, OCRFeedback
from app.models.log import AIParsingLog
from app.models.accounting import Transaction, Account, JournalEntry
from app.models.inventory import InventoryLog, Product, Contact
from app.services.ai_context import get_rag_context

from google import genai

from app.core.database import SessionLocal
...
def call_gemini_fallback(prompt: str) -> str:
    """
    Fallback mechanism menggunakan Google Gemini API jika Ollama offline.
    Mencoba Gemini 1.5 Flash (Primary) lalu Gemini 2.0 Flash (Secondary).
    """
    if not settings.GOOGLE_API_KEY:
        raise Exception("Ollama offline dan GOOGLE_API_KEY tidak dikonfigurasi di .env")

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)

    # Percobaan 1: Gemini 1.5 Flash
    try:
        print(f"Attempting Fallback with {settings.GEMINI_PRIMARY_MODEL}...")
        response = client.models.generate_content(
            model=settings.GEMINI_PRIMARY_MODEL,
            contents=prompt
        )
        return response.text
    except Exception as e:
        print(f"Primary Gemini ({settings.GEMINI_PRIMARY_MODEL}) failed: {str(e)}")

        # Percobaan 2: Gemini 2.0 Flash
        try:
            print(f"Attempting Fallback with {settings.GEMINI_SECONDARY_MODEL}...")
            response = client.models.generate_content(
                model=settings.GEMINI_SECONDARY_MODEL,
                contents=prompt
            )
            return response.text
        except Exception as e2:
            raise Exception(f"Seluruh jalur AI Gagal. Gemini Secondary Error: {str(e2)}")


def get_ocr_text(file_path: str) -> str:
    """
    Ekstraksi teks dari gambar menggunakan PyTesseract dengan bahasa Indonesia dan Inggris.
    """
    import pytesseract
    from PIL import Image
    try:
        img = Image.open(file_path)
        # Menggunakan bahasa Indonesia (ind) dan Inggris (eng)
        raw_text = pytesseract.image_to_string(img, lang="ind+eng")
        return raw_text
    except Exception as e:
        print(f"Error dalam ekstraksi Tesseract OCR: {str(e)}")
        raise e


def _clean_json_output(raw_text: str) -> str:
    """
    Tangguh terhadap output Ollama yang mungkin berisi markdown wrapper,
    teks pengantar, tag reasoning <think>, atau karakter pengganggu.
    """
    clean = raw_text.strip()
    
    # Hapus tag reasoning milik model-model reasoning seperti DeepSeek R1 jika ada
    clean = re.sub(r"<think>.*?</think>", "", clean, flags=re.DOTALL)
    
    # Remove common markdown code block wrappers
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    
    # Find the first '{' and last '}' to extract valid JSON object
    start = clean.find('{')
    end = clean.rfind('}')
    if start != -1 and end != -1 and end > start:
        return clean[start:end+1]
    
    return clean.strip()


def _build_few_shot_examples(db: Session, max_examples: int = 5) -> str:
    """
    Build few-shot examples dari riwayat koreksi manual ocr_feedback di database.
    Meningkatkan akurasi model LLM dengan pembelajaran kontekstual dinamis.
    """
    feedback_items = db.query(OCRFeedback).order_by(
        OCRFeedback.id.desc()
    ).limit(max_examples * 5).all()
    
    if not feedback_items:
        return ""
    
    examples_by_task = {}
    for fb in feedback_items:
        tid = fb.ocr_task_id
        if tid not in examples_by_task:
            examples_by_task[tid] = []
        examples_by_task[tid].append(f'  - Field "{fb.field_name}": extracted "{fb.original_value}" but correct value is "{fb.corrected_value}"')
    
    if not examples_by_task:
        return ""
    
    few_shot_text = "\n\nHistori koreksi yang perlu dipelajari dari transaksi sebelumnya:\n"
    for i, (tid, corrections) in enumerate(list(examples_by_task.items())[:max_examples]):
        few_shot_text += f"Contoh Koreksi {i+1}:\n" + "\n".join(corrections) + "\n"
    
    return few_shot_text


@shared_task(name="app.workers.ocr_worker.process_receipt_ocr", bind=True, max_retries=3)
def process_receipt_ocr(self, task_id: int):
    """
    Celery task untuk mengekstrak data struk belanja menggunakan arsitektur Hybrid OCR-LLM Pipeline.
    Memprioritaskan Gemini Vision untuk akurasi tinggi pada tulisan tangan.
    """
    from app.services.ai_engine import call_ai_text, call_ai_vision
    
    db: Session = SessionLocal()
    task = db.query(OCRTask).filter(OCRTask.id == task_id).first()
    
    if not task:
        db.close()
        return {"status": "error", "message": "Task not found"}

    try:
        task.status = OCRStatus.PROCESSING
        db.commit()

        # 1. Pilih Mesin OCR (Prioritaskan Vision jika Gambar & API Key ada)
        is_image = task.file_path.lower().endswith(('.jpg', '.jpeg', '.png'))
        raw_ocr_text = ""
        ai_processor = "ollama"

        if is_image:
            try:
                with open(task.file_path, "rb") as f:
                    img_bytes = f.read()
                
                from app.services.mcp_client import mcp_client
                if settings.MCP_ENABLED:
                    import asyncio
                    print("[OCR Worker] Menggunakan MCP Server untuk OCR")
                    ocr_res = asyncio.run(mcp_client.ocr_receipt(db, img_bytes, "image/jpeg"))
                    # Ekstrak raw text dari hasil format MCP
                    raw_ocr_text = ocr_res.get("raw_text", "") if isinstance(ocr_res, dict) else str(ocr_res)
                    ai_processor = "mcp-ocr"

                elif settings.GOOGLE_API_KEY:
                    # GUNAKAN GEMINI VISION SEBAGAI PEMBACA UTAMA LOKAL
                    vision_res = call_ai_vision(
                        db=db,
                        image_bytes=img_bytes,
                        mime_type="image/jpeg",
                        prompt="Ekstrak seluruh teks dari nota ini. Jangan lewatkan detail tulisan tangan. Jika ada tabel, baca baris demi baris."
                    )
                    raw_ocr_text = vision_res['raw_text']
                    ai_processor = "gemini-vision"
                else:
                    raw_ocr_text = get_ocr_text(task.file_path)
            except Exception as e:
                print(f"Vision OCR pipeline failed, falling back to Tesseract: {e}")
                raw_ocr_text = get_ocr_text(task.file_path)
        else:
            # Fallback ke Tesseract untuk PDF atau file non-image
            raw_ocr_text = get_ocr_text(task.file_path)


        task.raw_ocr_text = raw_ocr_text
        db.commit()

        # 2. GLOBAL RAG: Ambil context lintas tenant
        rag_examples = get_rag_context(db, task.tenant_id, raw_ocr_text)

        # 3. Strukturisasi Data (Temperature 0.0)
        system_instruction = (
            "Anda adalah pakar akuntansi OCR Vision. Tugas Anda adalah mengubah teks hasil pembacaan nota menjadi JSON terstruktur secara presisi.\n"
            "PENTING: Abaikan teks teknis non-transaksi seperti 'Samsung Quad Camera', 'Galaxy A12', 'Shot with', atau watermark kamera lainnya."
        )

        prompt = f"""
{rag_examples}

HASIL PEMBACAAN NOTA (RAW):
{raw_ocr_text}

Tugas: Ekstrak data di atas menjadi JSON sesuai skema di bawah.
Gunakan data dari "GLOBAL GOLDEN TEMPLATES" jika pola nota mirip (terutama untuk nota SJP).

Skema JSON:
{{
  "transaction": {{ "date": "YYYY-MM-DD", "invoice_number": "string" }},
  "merchant": {{ "brand_name": "string", "address": "string" }},
  "summary": {{ "grand_total": number }},
  "transaction_type": "purchase|sales|expense",
  "items": [
    {{ "product_name": "string", "quantity": number, "unit_price": number, "subtotal": number }}
  ]
}}
"""
        # Call deterministic AI untuk strukturisasi
        res = call_ai_text(db, prompt, system_instruction=system_instruction, temperature=0.0)
        
        if not res["parsed_data"]:
            raise Exception("AI gagal menghasilkan JSON valid.")

        task.extracted_data = res["parsed_data"]
        task.status = OCRStatus.COMPLETED
        db.commit()

        # 4. Save Activity Log for Terminal Visibility
        new_log = AIParsingLog(
            tenant_id=task.tenant_id,
            original_text=f"OCR FILE: {task.file_name}",
            prompt=prompt,
            parsed_result=json.dumps(res["parsed_data"]),
            token_in=res.get("token_in", 0),
            token_out=res.get("token_out", 0),
            processor=res.get("processor", ai_processor)
        )
        db.add(new_log)
        db.commit()
        
        return {"status": "success", "task_id": task_id, "ai": ai_processor}

    except Exception as exc:
        task.status = OCRStatus.FAILED
        task.error_message = str(exc)
        db.commit()
        raise self.retry(exc=exc, countdown=15)
    finally:
        db.close()
