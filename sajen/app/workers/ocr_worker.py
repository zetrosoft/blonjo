import os
import base64
import json
import re
from celery import shared_task
from sqlalchemy.orm import Session
from ollama import Client

from app.core.database import SessionLocal
from app.core.config import settings
from app.models.ocr import OCRTask, OCRStatus, OCRFeedback
from app.models.user import User # Register User model in SQLAlchemy metadata

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
ollama_client = Client(host=OLLAMA_HOST)

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
        
        # Simpan teks mentah sementara jika diperlukan untuk audit / logging
        print(f"--- PyTesseract Raw Extraction for Task {task_id} ---\n{raw_ocr_text}\n----------------------------------")

        # 3. Build few-shot examples from past corrections
        few_shot_section = _build_few_shot_examples(db)

        # 4. Susun prompt akuntansi kaya terstruktur (temperature 0.25)
        prompt = f"""Anda adalah sistem ekstraksi data terstruktur tingkat lanjut. Tugas Anda adalah menganalisis teks mentah hasil OCR dari sebuah nota/struk belanja dan mengubahnya menjadi format JSON yang valid dan terstruktur.

Aturan Ekstraksi:
1. Ekstrak semua informasi penting sesuai dengan skema JSON yang diberikan di bawah ini.
2. Format tanggal transaksi wajib YYYY-MM-DD. Jika tidak terlihat atau tidak valid, gunakan tanggal hari ini.
3. Jenis transaksi (transaction_type) wajib bernilai salah satu dari: "purchase", "sales", atau "expense".
4. Output harus berupa string JSON murni yang valid tanpa ada penjelasan pembuka/penutup, atau tag markdown tambahan.

Skema JSON yang harus dipatuhi secara mutlak:
{{
  "transaction": {{
    "date": "YYYY-MM-DD",
    "invoice_number": "Nomor invoice/nota/struk belanja (string atau null jika tidak ada)"
  }},
  "merchant": {{
    "brand_name": "Nama merchant/toko/warung (string atau null)"
  }},
  "summary": {{
    "grand_total": angka total transaksi belanja (number)
  }},
  "transaction_type": "purchase, sales, atau expense",
  "items": [
    {{
      "product_name": "Nama produk/barang belanja (string)",
      "quantity": angka jumlah kuantitas barang (number),
      "unit_price": angka harga satuan barang (number),
      "subtotal": angka subtotal total harga barang tersebut (number, quantity * unit_price)
    }}
  ]
}}

Teks Mentah Hasil OCR Nota:
{raw_ocr_text}
{few_shot_section}
"""

        # 5. Kirim teks mentah hasil OCR ke Ollama Qwen2.5 3B
        response = ollama_client.generate(
            model=settings.OLLAMA_LLM_MODEL,
            prompt=prompt,
            stream=False,
            options={"temperature": 0.25}
        )
        
        # 6. Parse output JSON tangguh
        raw_output = response['response']
        clean_json_str = _clean_json_output(raw_output)
        extracted_data = json.loads(clean_json_str)

        # 7. Simpan hasil ekstraksi JSON kaya ke database
        task.extracted_data = extracted_data
        task.status = OCRStatus.COMPLETED
        db.commit()
        
        return {"status": "success", "task_id": task_id}

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
