import os
import base64
import json
import re
import logging
from celery import shared_task
from sqlalchemy.orm import Session
from google import genai

logger = logging.getLogger(__name__)

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
                
                # --- DEPRECATED: FASE 3 VISUAL-FIRST MATCH & CROP ---
                # Dinonaktifkan (dikomen) karena pemrosesan OCR kini 100% menggunakan RAG Vector Store & AI Vision utuh
                # yang lebih akurat tanpa memotong gambar (mencegah kop toko/tanggal terpotong).
                img_hash = ""
                template_matched = False
                # try:
                #     from app.services.vision_matcher import compute_image_signature, match_and_crop
                #     from app.services.mcp_client import mcp_client
                #     import asyncio
                #     
                #     img_hash = compute_image_signature(img_bytes)
                #     
                #     if settings.MCP_ENABLED and img_hash:
                #         match_res = asyncio.run(mcp_client.match_visual_template(img_hash))
                #         if match_res and match_res.get("matched"):
                #             template_coords = match_res.get("template", {}).get("bounding_boxes")
                #             if template_coords:
                #                 img_bytes, is_cropped = match_and_crop(img_bytes, template_coords)
                #                 if is_cropped:
                #                     template_matched = True
                #                     print(f"[OCR Worker] Gambar dipotong menggunakan Visual Template untuk {match_res['template'].get('merchant_name')}!")
                # except Exception as ve:
                #     print(f"[OCR Worker] Visual matching failed (fallback to original): {ve}")
                # --------------------------------------------------
                
                from app.services.mcp_client import mcp_client
                if settings.MCP_ENABLED:
                    import asyncio
                    print("[OCR Worker] Menggunakan MCP Server untuk OCR")
                    ocr_res = asyncio.run(mcp_client.ocr_receipt(db, img_bytes, "image/jpeg", tenant_id=task.tenant_id))
                    # Ekstrak raw text dari hasil format MCP
                    import json
                    if isinstance(ocr_res, dict):
                        if "merchant" in ocr_res or "items" in ocr_res or "transaction" in ocr_res:
                            raw_ocr_text = json.dumps(ocr_res)
                        else:
                            raw_ocr_text = ocr_res.get("raw_text", "")
                    else:
                        raw_ocr_text = str(ocr_res)
                    ai_processor = "mcp-ocr"

                elif settings.GOOGLE_API_KEY:
                    # GUNAKAN GEMINI VISION SEBAGAI PEMBACA UTAMA LOKAL
                    vision_res = call_ai_vision(
                        db=db,
                        image_bytes=img_bytes,
                        mime_type="image/jpeg",
                        prompt="Ekstrak seluruh teks dari nota ini secara mentah dari ujung atas sampai bawah. JANGAN LEWATKAN nama supplier/toko di bagian paling atas (kop nota). Perhatikan secara teliti tanda baca pada angka desimal (seperti Qty 2.00, dst). Untuk bagian tabel barang, USAHAKAN mempertahankan spasi antar kolom (gunakan spasi atau karakter tab) agar angka kuantitas, harga satuan, dan subtotal tidak menempel menjadi satu string. Berikan jarak antar kolom. PENTING: Jawab HANYA dengan teks ekstraksi, DILARANG KERAS menambahkan kalimat pengantar."
                    )
                    raw_ocr_text = vision_res['raw_text']
                    ai_processor = "gemini-vision"
                else:
                    raise Exception("Tidak ada layanan AI Vision (MCP/Gemini) yang aktif. OCR lokal dinonaktifkan.")
            except Exception as e:
                print(f"Vision OCR pipeline failed: {e}")
                raise Exception(f"Vision OCR gagal: {e}")
        else:
            # File non-image tidak lagi didukung oleh local fallback tanpa tesseract
            raise Exception("Tipe file tidak didukung untuk diproses AI Vision (hanya JPG/PNG).")

        # Sanitize raw_ocr_text from LLM babble
        if raw_ocr_text:
            clean_lines = []
            for line in raw_ocr_text.splitlines():
                line_lower = line.lower()
                if "berikut adalah" in line_lower or "ekstraksi data" in line_lower or "format tabel" in line_lower or "sesuai permintaan" in line_lower:
                    continue
                clean_lines.append(line)
            raw_ocr_text = "\n".join(clean_lines).strip()

        task.raw_ocr_text = raw_ocr_text
        db.commit()

        # Coba ekstrak JSON langsung dari raw_ocr_text jika MCP sudah mem-parsingnya
        import re
        import json
        extracted_json = None
        
        def try_parse_json(text_str):
            try:
                # Bersihkan trailing comma yang sering dihasilkan LLM
                clean_str = re.sub(r',\s*([}\]])', r'\1', text_str)
                return json.loads(clean_str)
            except:
                return None

        # 1. Cari blok markdown ```json ... ``` dari belakang ke depan
        blocks = re.findall(r'```(?:json)?\s*(.*?)\s*```', raw_ocr_text, re.DOTALL)
        for block in reversed(blocks):
            parsed = try_parse_json(block)
            if isinstance(parsed, dict) and ("toko" in parsed or "merchant" in parsed or "item_belanja" in parsed or "items" in parsed or "readability_status" in parsed):
                extracted_json = parsed
                break
                
        # 2. Jika gagal, cari kurung kurawal terluar
        if not extracted_json:
            start = raw_ocr_text.find('{')
            end = raw_ocr_text.rfind('}')
            if start != -1 and end != -1 and end > start:
                parsed = try_parse_json(raw_ocr_text[start:end+1])
                if isinstance(parsed, dict) and ("toko" in parsed or "merchant" in parsed or "items" in parsed or "readability_status" in parsed):
                    extracted_json = parsed

        parsed_data = {}
        prompt = ""
        # 2. GLOBAL RAG: Ambil context lintas tenant (hanya jika butuh strukturisasi manual)
        if not extracted_json:
            rag_examples = get_rag_context(db, task.tenant_id, raw_ocr_text, is_ocr=True)

            # 3. Strukturisasi Data (Temperature 0.0)
            system_instruction = (
                "Anda adalah pakar akuntansi OCR Vision. Tugas Anda adalah mengubah teks hasil pembacaan nota menjadi JSON terstruktur secara presisi.\n"
                "PENTING: Abaikan teks teknis non-transaksi seperti 'Samsung Quad Camera', 'Galaxy A12', 'Shot with', atau watermark kamera lainnya.\n"
                "PENTING: Jika ada item yang diawali dengan kata 'Potongan' (misal: 'Potongan Harga'), abaikan dari daftar 'items' (itu adalah penjelasan diskon, BUKAN barang yang dibeli).\n"
                "PENTING: Jangan pernah memasukkan kalimat pengantar/obrolan AI seperti 'Berikut adalah ekstraksi data...' atau 'Tabel markdown' ke dalam value JSON.\n"
                "PENTING: Perhatikan Qty (Kuantitas) barang. Qty bisa berbentuk desimal (contoh: 2.00, 1.5). Pertahankan titik desimal secara akurat dan jangan sampai nilai (seperti 2.00) terdeteksi sebagai 1.\n"
                "PENTING: Logika Akuntansi untuk Harga: Jika menemukan deretan angka setelah nama barang, ingat rumus (Kuantitas x Harga Satuan = Subtotal). Jangan asal menebak kuantitas = 1 jika terdapat angka yang masuk akal sebagai kuantitas di baris tersebut.\n"
                "PENTING: NOTASI TULISAN TANGAN RUPIAH & RIBUAN: Pada nota tulisan tangan Indonesia, angka ribuan sering disingkat menggunakan simbol strip/garis atau dua nol kecil di atas (contoh: '240.-', '240.00-', '240 00' = Rp 240.000, '140.-' = Rp 140.000, '380.-' = Rp 380.000, atau harga '2400' dengan qty 10 dan jumlah 240rb berarti harga satuan Rp 24.000). Total belanja HARUS merupakan penjumlahan matematis baris-baris tersebut. DILARANG KERAS mengartikan angka nota sebagai puluhan/ratusan rupiah jika konteks belanja ritel jelas ribuan.\n"
                "PENTING: PEMBERSIHAN KODE BARANG & ANTI-HALUSINASI: Jika nama barang diawali oleh kode singkatan pabrik/kemasan (seperti '26L.HCSLP M600G501BB DTRG LIQ BERRY'), ambil deskripsi jenis produk utama (seperti 'DTRG LIQ BERRY' atau 'DETERJEN LIQUID BERRY') beserta spesifikasi ukurannya. DILARANG KERAS mengganti teks nama barang di nota dengan nama produk lain yang TIDAK TERTERA di nota (misalnya mengganti produk deterjen menjadi Minyak Kayu Putih). Jika nama barang berupa kode/singkatan pabrik, WAJIB tuliskan deskripsi teks tersebut persis seperti yang terbaca.\n"
                "PENTING: ATURAN NOTA MULTI-KOLOM QTY (BSR, TGH, KCL): Jika nota memiliki 3 kolom kuantitas (BSR/Besar, TGH/Tengah, KCL/Kecil), ambil nilai Qty dari kolom yang bernilai > 0 dengan satuan (unit) yang relevan (misal 'box', 'pack', 'pcs'). Gunakan nilai pada kolom NETO sebagai total harga per item ('subtotal'), dan hitung harga per unit ('unit_price') dari (Nilai Neto / Qty).\n"
                "PENTING: DETEKSI DISKON ITEM DISTRIBUTOR: Jika nota memiliki kolom 'Discount Product', 'Discount Customer', 'Disc', atau 'Potongan', ambil jumlah diskon tersebut ke field 'discount_amount'. Jika ada kolom 'Discount Product' dan 'Discount Customer', jumlahkan keduanya. Pastikan 'subtotal' adalah nilai bersih (netto / kolom JUMLAH).\n"
                "PENTING: Ekstrak secara wajib nama merchant/toko/supplier dari bagian paling atas nota (kop surat) meskipun bentuknya terpisah atau kotor.\n"
                "PENTING: Klasifikasi Transaksi: Jika nota diterbitkan oleh pihak eksternal (minimarket, grosir, supplier) kepada kita, maka transaction_type WAJIB diset 'purchase'. Jangan terkecoh dengan tulisan 'Nota Penjualan' di kertas, karena itu adalah penjualan dari sisi mereka, namun merupakan pembelian (pengeluaran) dari sisi kita."
            )

            prompt = f"""
{rag_examples}

HASIL PEMBACAAN NOTA (RAW):
{raw_ocr_text}

Tugas: Ekstrak data di atas menjadi JSON sesuai skema di bawah.
Gunakan data dari "GLOBAL GOLDEN TEMPLATES" jika pola nota mirip (terutama untuk nota SJP).

Skema JSON:
{{
  "transaction": {{ "date": "YYYY-MM-DD", "invoice_number": "string", "payment_method": "cash|transfer|qris|tempo" }},
  "merchant": {{ "brand_name": "string", "address": "string" }},
  "summary": {{ "grand_total": number, "discount_total": number }},
  "transaction_type": "purchase|sales|expense",
  "items": [
    {{ "product_name": "string", "quantity": number, "unit_price": number, "discount_amount": number, "subtotal": number }}
  ]
}}
"""
            # Call deterministic AI untuk strukturisasi
            res = call_ai_text(db, prompt, system_instruction=system_instruction, temperature=0.0)
            
            if not res["parsed_data"]:
                raise Exception("AI gagal menghasilkan JSON valid.")
                
            parsed_data = res["parsed_data"]
            ai_processor = res.get("processor", ai_processor)
            token_in = res.get("token_in", 0)
            token_out = res.get("token_out", 0)
        else:
            parsed_data = extracted_json
            token_in = 0
            token_out = 0
            prompt = "MCP provided structured JSON directly."

        # Fast-Path Entity Semantic Normalization & Math Reconciler (Learned Alias Memory)
        from app.services.ocr_normalizer import apply_ocr_entity_aliases
        parsed_data = apply_ocr_entity_aliases(db, task.tenant_id, parsed_data)

        # Check Semantic AI Transaction Signature using Universal Multi-Vector Semantic Basket Matcher
        if isinstance(parsed_data, dict):
            from app.services.ocr_normalizer import find_semantic_basket_duplicate
            dup_check = find_semantic_basket_duplicate(
                db=db,
                tenant_id=task.tenant_id,
                parsed_data=parsed_data,
                current_task_id=task.id
            )
            if dup_check.get("is_duplicate", False):
                parsed_data["is_duplicate"] = True
                parsed_data["duplicate_warning"] = dup_check.get("duplicate_warning")
                logger.warning(f"Semantic AI Duplicate match found for task {task.id}: {parsed_data['duplicate_warning']}")
            else:
                parsed_data["is_duplicate"] = False

        task.extracted_data = parsed_data
        task.status = OCRStatus.COMPLETED
        db.commit()

        from app.core.redis import invalidate_tenant_cache
        invalidate_tenant_cache(task.tenant_id, ["products", "dashboard", "insights", "material_control"])

        # --- DEPRECATED: FASE 4 PELAJARI TEMPLATE ---
        # Dinonaktifkan (dikomen) karena pemrosesan OCR kini sepenuhnya ditangani oleh RAG Vector Store & AI Vision
        # if not template_matched and extracted_json and img_hash:
        #     try:
        #         merchant_name = extracted_json.get("merchant", {}).get("name", "Unknown")
        #         transaction_type = extracted_json.get("transaction_type", "purchase")
        #         payment_method = extracted_json.get("transaction", {}).get("payment_method")
        #         
        #         # Deteksi area tabel secara dinamis menggunakan OpenCV
        #         from app.services.vision_matcher import detect_receipt_bounding_box
        #         bounding_boxes = detect_receipt_bounding_box(img_bytes)
        #         static_headers = {"transaction_type": transaction_type, "payment_method": payment_method}
        #         
        #         if settings.MCP_ENABLED:
        #             import asyncio
        #             from app.services.mcp_client import mcp_client
        #             asyncio.run(mcp_client.learn_visual_template(
        #                 image_hash=img_hash,
        #                 merchant_name=merchant_name,
        #                 bounding_boxes=bounding_boxes,
        #                 static_headers=static_headers
        #             ))
        #             print(f"[OCR Worker] Visual Template dipelajari untuk {merchant_name}.")
        #     except Exception as e:
        #         print(f"[OCR Worker] Gagal menyimpan Visual Template: {e}")
        # --------------------------------------------

        # 4. Save Activity Log for Terminal Visibility
        new_log = AIParsingLog(
            tenant_id=task.tenant_id,
            original_text=f"OCR FILE: {task.file_name}",
            prompt=prompt,
            parsed_result=json.dumps(parsed_data),
            token_in=token_in,
            token_out=token_out,
            processor=ai_processor
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
