import os
import sys
import json
from sqlalchemy.orm import Session

# Add the app directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "app"))
# For running from sajen/ directory
sys.path.append(os.getcwd())

from app.services.ai_engine import get_embedding, call_ai_text, _get_ollama_client
from app.core.config import settings
from app.core.database import SessionLocal

def dry_run():
    print("=== AI AUTO-SWITCH DRY RUN ===")
    
    # 1. Check Ollama Client Availability
    print("\n1. Memeriksa ketersediaan Client Ollama...")
    client, active_host = _get_ollama_client()
    if client:
        print(f"✅ Client aktif ditemukan di host: {active_host}")
    else:
        print("❌ Seluruh host Ollama offline.")

    # 2. Test Embedding
    print("\n2. Mengetes Embedding (Semantic Search logic)...")
    test_text = "Beras Premium 5kg"
    vec = get_embedding(test_text)
    if vec:
        print(f"✅ Embedding berhasil dibuat (dimensi: {len(vec)})")
    else:
        print("❌ Embedding gagal.")

    # 3. Test Text AI (Parsing logic)
    print("\n3. Mengetes Text AI (Parsing logic)...")
    db = SessionLocal()
    try:
        prompt = "Ekstrak data ini: Beli 1 Sabun seharga 5000"
        system_instruction = "Berikan output JSON: {\"item\": string, \"price\": number}"
        
        res = call_ai_text(db, prompt, system_instruction=system_instruction)
        
        print(f"✅ Processor yang digunakan: {res.get('processor')}")
        print(f"✅ Hasil Parsed: {json.dumps(res.get('parsed_data'), indent=2)}")
        
    except Exception as e:
        print(f"❌ Text AI Error: {e}")
    finally:
        db.close()

    print("\n=== DRY RUN SELESAI ===")

if __name__ == "__main__":
    dry_run()
