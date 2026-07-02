import os
import json
from app.services.ai_engine import call_ai_text
from app.core.database import SessionLocal
from app.core.config import settings

db = SessionLocal()
text = "Saldo Akhir Bulan 5, uang cash 5.650.000"

print(f"Testing with text: {text}")
print(f"Gemini Key present: {bool(settings.GOOGLE_API_KEY)}")
print(f"Ollama Host: {os.getenv('OLLAMA_HOST')}")

res = call_ai_text(db, text, system_instruction="Output JSON only.")
print("\n--- AI RESPONSE ---")
print(json.dumps(res, indent=2))
