from app.core.database import SessionLocal
from app.models.ocr import AILearningTemplate
from app.services.ai_engine import get_embedding
from app.utils.text_processing import legal_semantic_splitter

def seed_legal_template():
    sample_text = """
UNDANG-UNDANG REPUBLIK INDONESIA
NOMOR 1 TAHUN 2026

BAB I
KETENTUAN UMUM

Pasal 1
Dalam Undang-Undang ini yang dimaksud dengan:
1. Pemerintah adalah Pemerintah Pusat.
2. Daerah adalah daerah otonom.

Pasal 2
(1) Peraturan ini berlaku mengikat.
(2) Hal-hal yang belum diatur meliputi:
    a. Pengecualian; dan
    b. Tambahan.

BAB II
ASAS DAN TUJUAN

Pasal 3
Asas peraturan ini meliputi keadilan.
"""

    print("Memotong teks hukum menggunakan legal_semantic_splitter...")
    chunks = legal_semantic_splitter(sample_text)
    
    db = SessionLocal()
    tenant_id = 1
    
    saved_count = 0
    for idx, chunk in enumerate(chunks):
        print(f"Generate embedding lokal (Nomic) untuk chunk {idx+1}/{len(chunks)}...")
        vec = get_embedding(chunk)
        
        if vec:
            template = AILearningTemplate(
                tenant_id=tenant_id,
                file_name=f"UU_NO_1_2026_CHUNK_{idx+1}.txt",
                raw_ocr_text=chunk,
                expected_output=f"Ekstraksi Hukum: Chunk {idx+1}",
                embedding=vec,
                usage_count=0
            )
            db.add(template)
            saved_count += 1
        else:
            print(f"Gagal generate embedding untuk chunk {idx+1}")
            
    db.commit()
    db.close()
    
    print(f"Berhasil menyimpan {saved_count} Golden Template Hukum ke database.")

if __name__ == "__main__":
    seed_legal_template()
