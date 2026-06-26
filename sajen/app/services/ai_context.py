from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from app.models.ocr import AILearningTemplate, OCRTask, OCRStatus
from app.models.inventory import Product, Contact
from app.services.ai_engine import get_embedding
import json

# COA sekarang dikelola secara terpisah oleh coa_cache.py
# Gunakan get_coa_string() dan needs_coa_in_prompt() dari sana

def get_rag_context(db: Session, tenant_id: int = None, query_text: str = "") -> str:
    """
    Consolidate GLOBAL RAG context from multiple sources.
    Optimized with VECTOR SIMILARITY for primary templates.
    """
    context = ""

    # 0. ON-THE-FLY SEEDING: Check if any templates missing embeddings and fix them
    missing_vectors = db.query(AILearningTemplate).filter(AILearningTemplate.embedding == None).all()
    if missing_vectors:
        print(f"Detecting {len(missing_vectors)} templates without vectors. Seeding now...")
        for mv in missing_vectors:
            vector = get_embedding(mv.raw_ocr_text)
            if vector:
                mv.embedding = vector
        try:
            db.commit()
            print("Templates seeded with vectors successfully.")
        except Exception as e:
            print(f"Failed to seed vectors: {e}")
            db.rollback()

    # 1. PRIMARY: Semantic Search for Golden Templates (Similarity Search)
    query_vector = get_embedding(query_text) if query_text else None
    
    # Check if query_vector is valid (must be a list of floats)
    if query_vector and isinstance(query_vector, list) and len(query_vector) > 0:
        try:
            # Search using pgvector cosine distance (<->)
            # We take templates ONLY if they are very similar (distance < 0.45)
            golden_templates = db.query(AILearningTemplate).filter(
                AILearningTemplate.embedding.op('<->')(query_vector) < 0.45
            ).order_by(
                AILearningTemplate.embedding.op('<->')(query_vector)
            ).limit(1).all()
        except Exception as ve:
            print(f"Vector search failed: {ve}")
            golden_templates = []
    else:
        # Fallback if embedding fails
        golden_templates = []

    if golden_templates:
        context += "\n--- REFERENSI PEMBELAJARAN TERKAIT ---\n"
        for gt in golden_templates:
            context += f"CONTOH INPUT: {gt.raw_ocr_text[:300]}\nHASIL EKSTRAKSI: {gt.expected_output}\n\n"

    # 2. SECONDARY: Historically Corrected Tasks (Only for complex/long input)
    # If the input is short (like "Saldo Kas"), we skip historical RAG to save tokens.
    is_complex_input = len(query_text) > 60 or any(kw in query_text.lower() for kw in ["nota", "struk", "toko", "belanja"])
    
    if is_complex_input:
        past_corrections = db.query(OCRTask).filter(
            OCRTask.status == OCRStatus.CORRECTED,
            OCRTask.corrected_data != None
        ).order_by(OCRTask.id.desc()).limit(1).all()

        if past_corrections:
            context += "\n--- PEMBELAJARAN DARI PENGALAMAN ---\n"
            for pt in past_corrections:
                context += f"INPUT ASLI: {pt.raw_ocr_text[:200]}\nHASIL KOREKSI: {json.dumps(pt.corrected_data)}\n\n"

    # 3. GLOBAL MASTER DATA: Registered Products & Contacts
    # Minimalist approach: only send if we suspect normalization is needed
    if is_complex_input:
        products = db.query(Product.name).distinct().limit(5).all()
        contacts = db.query(Contact.name).distinct().limit(3).all()

        if products or contacts:
            context += "\n--- MASTER DATA ---\n"
            if products:
                context += "ITEM: " + ", ".join([p[0] for p in products]) + "\n"
            if contacts:
                context += "KONTAK: " + ", ".join([c[0] for c in contacts]) + "\n"

    # CATATAN: COA TIDAK lagi di-inject di sini.
    # COA dikelola oleh coa_cache.py dengan Redis TTL 10 menit.
    # Di-inject ke prompt HANYA jika diperlukan (needs_coa_in_prompt()).
    # Ini mengurangi ukuran prompt ~30% untuk input transaksi simpel.

    return context
