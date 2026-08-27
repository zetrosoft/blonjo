import os
import sys
import time
import asyncio

# Menambahkan direktori sajen ke sys.path agar bisa mengimpor modul app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal
from app.models.ocr import OCRTask
from app.workers.ocr_worker import process_receipt_ocr

# Gunakan gambar yang sebelumnya Anda sebutkan
IMAGE_PATH = "/Users/user/Downloads/WhatsApp Image 2026-07-24 at 08.28.35.jpeg"

def test_latency():
    if not os.path.exists(IMAGE_PATH):
        print(f"Error: Gambar tidak ditemukan di {IMAGE_PATH}")
        return

    print("Membuka sesi database...")
    db = SessionLocal()
    
    try:
        print("Membuat mock OCRTask...")
        # Buat task dummy dengan tenant 1 dan user 1
        task = OCRTask(
            tenant_id=1,
            user_id=1,
            file_name="WhatsApp Image 2026-07-24 at 08.28.35.jpeg",
            file_path=IMAGE_PATH
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        print(f"Task dibuat dengan ID: {task.id}")

        print("\n⏳ Memulai proses OCR Worker (Celery task dipanggil secara sinkron)...")
        start_time = time.time()
        
        # Panggil worker secara sinkron (langsung berjalan di script ini)
        process_receipt_ocr(task.id)
        
        end_time = time.time()
        latency = end_time - start_time
        
        print(f"\n✅ Proses OCR Selesai!")
        print(f"⏱️ Total Waktu Eksekusi: {latency:.2f} detik")
        
        db.refresh(task)
        print(f"Status Akhir: {task.status}")
        
    finally:
        db.close()

if __name__ == "__main__":
    test_latency()
