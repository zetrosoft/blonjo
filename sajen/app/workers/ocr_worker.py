import os
import base64
import json
import re
from celery import shared_task
from sqlalchemy.orm import Session
from ollama import Client
import google.generativeai as genai

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.tenant import Tenant 
from app.models.user import User 
from app.models.role import Role 
from app.models.permission import Permission 
from app.models.setting import AppSetting 
from app.models.ocr import OCRTask, OCRStatus, OCRFeedback
from app.models.accounting import Transaction, Account, JournalEntry
from app.models.inventory import InventoryLog, Product, Contact


OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
ollama_client = Client(host=OLLAMA_HOST)

def call_gemini_fallback(prompt: str) -> str:
    """
    Fallback mechanism menggunakan Google Gemini API jika Ollama offline.
    Mencoba Gemini 1.5 Flash (Primary) lalu Gemini 2.0 Flash (Secondary).
    """
    if not settings.GOOGLE_API_KEY:
        raise Exception("Ollama offline dan GOOGLE_API_KEY tidak dikonfigurasi di .env")
    
    genai.configure(api_key=settings.GOOGLE_API_KEY)
    
    # Percobaan 1: Gemini 1.5 Flash
    try:
        print(f"Attempting Fallback with {settings.GEMINI_PRIMARY_MODEL}...")
        model = genai.GenerativeModel(settings.GEMINI_PRIMARY_MODEL)
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"Primary Gemini ({settings.GEMINI_PRIMARY_MODEL}) failed: {str(e)}")
        
        # Percobaan 2: Gemini 2.0 Flash
        try:
            print(f"Attempting Fallback with {settings.GEMINI_SECONDARY_MODEL}...")
            model = genai.GenerativeModel(settings.GEMINI_SECONDARY_MODEL)
            response = model.generate_content(prompt)
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
    Celery task untuk mengekstrak data struk belanja menggunakan arsitektur Hybrid OCR-LLM Pipeline:
    1. Ekstraksi Teks: PaddleOCR PP-OCRv4 LightWeight (Cepat & Akurat di CPU lokal)
    2. Strukturisasi JSON: Qwen2.5 3B / Llama3 via Ollama (Temperature 0.25)
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

        # 2. Jalankan Ekstraksi Teks menggunakan PyTesseract
        raw_ocr_text = get_ocr_text(task.file_path)
        task.raw_ocr_text = raw_ocr_text
        db.commit()
        
        # Simpan teks mentah sementara jika diperlukan untuk audit / logging
        print(f"--- PyTesseract Raw Extraction for Task {task_id} ---\n{raw_ocr_text}\n----------------------------------")

        # 3. RAG: Ambil contoh pembelajaran (Few-Shot)
        rag_examples = ""
        # Coba ambil dari Golden Template (Settings -> AI Training)
        from app.models.ocr import AILearningTemplate
        golden_templates = db.query(AILearningTemplate).filter(AILearningTemplate.tenant_id == task.user.tenant_id).order_by(AILearningTemplate.id.desc()).limit(2).all()
        
        if golden_templates:
            rag_examples += "\nBerikut adalah TEMPLATE EMAS (Golden Templates) untuk referensi pembelajaran utama:\n"
            for gt in golden_templates:
                rag_examples += f"--- CONTOH TEMPLATE ---\nTEKS MENTAH: {str(gt.raw_ocr_text)[:500]}\nPANDUAN JSON YANG BENAR:\n{gt.expected_output}\n"

        # Coba ambil dari koreksi manual (Transactions)
        past_tasks = db.query(OCRTask).filter(
            OCRTask.status == OCRStatus.CORRECTED,
            OCRTask.corrected_data != None,
            OCRTask.user_id == task.user_id # Idealnya tenant_id, tapi di sini pakai user_id sbg proxy
        ).order_by(OCRTask.id.desc()).limit(2).all()

        if past_tasks:
            rag_examples += "\nBerikut adalah riwayat koreksi transaksi sebelumnya untuk referensi tambahan:\n"
            for pt in past_tasks:
                rag_examples += f"--- CONTOH KOREKSI ---\nTEKS MENTAH: {str(pt.raw_ocr_text)[:500]}\nHASIL JSON YANG BENAR:\n{json.dumps(pt.corrected_data, indent=2)}\n"

        # 4. Susun prompt akuntansi kaya terstruktur (temperature 0.2)
        prompt = f"""Anda adalah sistem ekstraksi data terstruktur tingkat lanjut. Tugas Anda adalah menganalisis teks mentah hasil OCR dari sebuah nota/struk belanja dan mengubahnya menjadi format JSON yang valid dan terstruktur.

Aturan Ekstraksi:
1. Ekstrak semua informasi penting sesuai dengan skema JSON yang diberikan di bawah ini.
2. Identifikasi Tanggal Transaksi, Nomor Nota/Invoice, dan Alamat Merchant dengan teliti.
3. Format tanggal transaksi wajib YYYY-MM-DD. Jika tidak terlihat, gunakan tanggal hari ini.
4. Jenis transaksi (transaction_type) wajib bernilai salah satu dari: "purchase", "sales", atau "expense".
5. Output harus berupa string JSON murni yang valid.
{rag_examples}

Skema JSON yang harus dipatuhi secara mutlak:
{{
  "transaction": {{
    "date": "YYYY-MM-DD",
    "invoice_number": "Nomor invoice/nota/struk (string atau null)"
  }},
  "merchant": {{
    "brand_name": "Nama toko/merchant (string atau null)",
    "address": "Alamat lengkap toko jika ada (string atau null)"
  }},
  "summary": {{
    "grand_total": angka total transaksi (number)
  }},
  "transaction_type": "purchase, sales, atau expense",
  "items": [
    {{
      "product_name": "Nama barang (string)",
      "quantity": angka jumlah (number),
      "unit_price": angka harga satuan (number),
      "subtotal": angka total harga barang (number)
    }}
  ]
}}

Teks Mentah Hasil OCR Nota:
{raw_ocr_text}
{rag_examples}
"""


        # 5. Kirim teks mentah hasil OCR ke AI (Ollama dengan Fallback Gemini)
        try:
            response = ollama_client.generate(
                model=settings.OLLAMA_LLM_MODEL,
                prompt=prompt,
                stream=False,
                options={"temperature": 0.25}
            )
            raw_output = response['response']
        except Exception as ollama_err:
            print(f"Ollama Error/Offline: {str(ollama_err)}. Mengalihkan ke Gemini Fallback...")
            raw_output = call_gemini_fallback(prompt)
        
        # 6. Parse output JSON tangguh
        clean_json_str = _clean_json_output(raw_output)
        extracted_data = json.loads(clean_json_str)

        # 7. Simpan hasil ekstraksi JSON kaya ke database
        task.extracted_data = extracted_data
        task.status = OCRStatus.COMPLETED
        db.commit()
        
        return {
            "status": "success", 
            "task_id": task_id, 
            "ai_provider": "gemini" if "ollama_err" in locals() else "ollama"
        }

    except json.JSONDecodeError as e:
        task.status = OCRStatus.FAILED
        task.error_message = f"Gagal parsing JSON output Ollama: {str(e)}. Output asli: {raw_output if 'raw_output' in locals() else 'None'}"
        db.commit()
        return {"status": "error", "message": "JSON Parse Error"}
    except FileNotFoundError:
        task.status = OCRStatus.FAILED
        task.error_message = "File struk yang diunggah tidak ditemukan pada server."
        db.commit()
        return {"status": "error", "message": "File Not Found"}
    except Exception as exc:
        task.status = OCRStatus.FAILED
        task.error_message = str(exc)
        db.commit()
        raise self.retry(exc=exc, countdown=15)
    finally:
        db.close()
