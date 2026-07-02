import os
import re
import json
import time
from google import genai
from ollama import Client
from app.core.config import settings
from sqlalchemy.orm import Session
from app.models.log import AIModelQuota
from datetime import datetime

# UPDATED Priority list based on live Model Service list (June 2026)
# Standard Free Tier (Google AI Studio) limits applied
GEMINI_MODELS = [
    {"name": "gemini-3.1-flash-lite", "limit": 1500}, # Top priority: Fastest & High RPD
    {"name": "gemini-3-flash", "limit": 1000},      # Smart & Reliable
    {"name": "gemini-2.5-flash", "limit": 500},       # Stable production choice
    {"name": "gemini-1.5-flash", "limit": 1500},      # Legacy safety fallback
    {"name": "gemini-2.5-pro", "limit": 50},         # High reasoning but very low quota
]

def _clean_json_output(raw_text: str) -> str:
    """Robust JSON extraction from LLM output, supporting both arrays and objects"""
    # Print raw output for debugging in Docker logs
    print(f"--- AI RAW OUTPUT ---\n{raw_text}\n---------------------")
    
    clean = raw_text.strip()
    clean = re.sub(r"<think>.*?</think>", "", clean, flags=re.DOTALL)
    clean = re.sub(r"^```(?:json)?\s*", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\s*```$", "", clean)
    
    # Try to find the start and end of either an array [...] or an object {...}
    # We prefer the outermost structure
    array_start = clean.find('[')
    array_end = clean.rfind(']')
    
    obj_start = clean.find('{')
    obj_end = clean.rfind('}')
    
    # Logic to determine which one is the actual JSON payload
    start = -1
    end = -1
    
    if array_start != -1 and (obj_start == -1 or array_start < obj_start):
        start = array_start
        end = array_end
    else:
        start = obj_start
        end = obj_end

    if start != -1 and end != -1 and end > start:
        return clean[start:end+1]
        
    return clean.strip()

def _track_quota(db: Session, model_name: str, tokens: int = 0):
    """Update local usage statistics in DB"""
    try:
        today = datetime.now().date()
        quota = db.query(AIModelQuota).filter(
            AIModelQuota.model_name == model_name,
            AIModelQuota.usage_date == today
        ).first()

        if not quota:
            quota = AIModelQuota(
                model_name=model_name,
                usage_date=today,
                request_count=1,
                token_count=tokens
            )
            db.add(quota)
        else:
            quota.request_count += 1
            quota.token_count += tokens
        
        db.commit()
    except Exception as e:
        print(f"Quota tracking error: {e}")
        db.rollback()

# In-memory cache for Ollama offline status to prevent hanging requests when host is offline
_OLLAMA_OFFLINE_CACHE = {}  # host -> last_checked_timestamp
OLLAMA_OFFLINE_COOLDOWN = 180  # Don't try an offline host again for 3 minutes (180 seconds)

def _get_ollama_client():
    """
    Helper to get an active Ollama client by trying local then fallback.
    Returns (client, active_host) or (None, None).
    """
    local_host = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
    hosts = [local_host, settings.OLLAMA_FALLBACK_URL]
    
    now = time.time()
    for host in hosts:
        # Check if the host was marked offline recently to fail-fast immediately
        last_failed = _OLLAMA_OFFLINE_CACHE.get(host)
        if last_failed and (now - last_failed) < OLLAMA_OFFLINE_COOLDOWN:
            continue

        try:
            client = Client(host=host, timeout=2.5) # Lower timeout to 2.5s for faster local check
            # Minimal check to see if server is responsive
            client.list() 
            _OLLAMA_OFFLINE_CACHE.pop(host, None) # Clear offline state if successful
            return client, host
        except Exception:
            _OLLAMA_OFFLINE_CACHE[host] = now # Cache offline state
            continue
    return None, None

def get_embedding(text: str) -> list:
    """
    Generate vector embedding using Ollama with auto-switch.
    Pads the result to 3072 dimensions to match database schema.
    """
    client, host = _get_ollama_client()
    if not client:
        print("All Ollama hosts for embedding are offline.")
        return None

    try:
        response = client.embeddings(model="nomic-embed-text", prompt=text)
        vec = response["embedding"]
        
        # Pad with zeros to 3072 to match DB Vector type
        if len(vec) < 3072:
            import numpy as np
            vec = np.pad(vec, (0, 3072 - len(vec)), 'constant').tolist()
            
        return vec
    except Exception as e:
        print(f"Ollama Embedding failed on {host}: {e}")

    return None

def _get_best_model_name(client: Client, preferred_model: str) -> str:
    """
    Check if preferred_model exists on host, otherwise suggest a fallback name.
    """
    try:
        models_resp = client.list()
        # In newer ollama-python versions, models are objects with .model attribute
        available_models = []
        for m in models_resp.models:
            if hasattr(m, 'model'):
                available_models.append(m.model)
            elif isinstance(m, dict):
                available_models.append(m.get('model') or m.get('name'))

        if preferred_model in available_models:
            return preferred_model
            
        # Fallback mappings for common model variants
        fallbacks = {
            "qwen2.5-coder:3b": ["qwen2.5:3b", "qwen2.5", "qwen2"],
        }
        
        for alt in fallbacks.get(preferred_model, []):
            # Check for exact match or substring match in available models
            for available in available_models:
                if alt == available or alt in available:
                    return available
    except Exception:
        pass
    return preferred_model # Default to preferred if list fails

from app.core.redis import get_redis_client, get_ai_cache_key

def call_ai_text(db: Session, prompt: str, system_instruction: str = None, temperature: float = 0.0) -> dict:
    """
    Centralized Text AI caller with AUTO-MODEL SWITCHING & REDIS CACHING.
    """
    # --- 0. Redis Cache Check ---
    # Normalize prompt: lowercase and strip extra whitespace for better hit rate
    normalized_prompt = re.sub(r'\s+', ' ', prompt.strip().lower())
    cache_key = get_ai_cache_key(normalized_prompt, system_instruction)
    redis_client = None
    
    try:
        redis_client = get_redis_client()
        cached_res = redis_client.get(cache_key)
        if cached_res:
            print(f"--- AI CACHE HIT --- Key: {cache_key[:15]}...")
            return json.loads(cached_res)
    except Exception as e_redis:
        print(f"Redis Cache Error (get): {e_redis}")

    # --- 1. Try Ollama (Local -> Fallback) ---
    client, active_host = _get_ollama_client()
    if client:
        # Smart Model Selection
        model_to_use = _get_best_model_name(client, settings.OLLAMA_LLM_MODEL)
        processor = f"ollama-{model_to_use}"
        
        try:
            full_prompt = f"{system_instruction}\n\n{prompt}" if system_instruction else prompt
            response = client.generate(
                model=model_to_use,
                prompt=full_prompt,
                stream=False,
                options={"temperature": temperature}
            )
            raw_output = response['response']
            token_in = response.get('prompt_eval_count', 0)
            token_out = response.get('eval_count', 0)
            
            _track_quota(db, processor, token_in + token_out)
            
            try:
                clean_json = _clean_json_output(raw_output)
                parsed_data = json.loads(clean_json)
                
                res = {
                    "parsed_data": parsed_data,
                    "processor": f"{processor} ({active_host})",
                    "token_in": token_in,
                    "token_out": token_out,
                    "raw_output": raw_output
                }

                # Save to cache if successful
                if redis_client:
                    try:
                        redis_client.setex(cache_key, 3600 * 24 * 7, json.dumps(res))
                    except Exception as e_save:
                        print(f"Redis Cache Error (set): {e_save}")
                
                return res
            except (json.JSONDecodeError, Exception) as e_json:
                print(f"Ollama on {active_host} produced invalid JSON: {e_json}. Falling back to Gemini...")
        except Exception as e_ollama:
            print(f"Ollama connection to {active_host} failed during generate: {e_ollama}. Falling back to Gemini...")
    else:
        print("All Ollama hosts are offline. Falling back to Gemini...")

    # --- Try Gemini (Iterative Switching) ---
    if settings.GOOGLE_API_KEY:
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        
        for model_info in GEMINI_MODELS:
            model_name = model_info["name"]
            try:
                print(f"Attempting AI with model: {model_name}...")
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt,
                    config={
                        "system_instruction": system_instruction,
                        "temperature": temperature
                    }
                )
                raw_output = response.text
                token_in = len(prompt.split())
                token_out = len(raw_output.split())
                
                # Track usage
                _track_quota(db, model_name, token_in + token_out)
                
                try:
                    clean_json = _clean_json_output(raw_output)
                    parsed_data = json.loads(clean_json)
                    
                    res = {
                        "parsed_data": parsed_data,
                        "processor": model_name,
                        "token_in": token_in,
                        "token_out": token_out,
                        "raw_output": raw_output
                    }

                    # Save to cache if successful
                    if redis_client:
                        try:
                            redis_client.setex(cache_key, 3600 * 24 * 7, json.dumps(res))
                        except Exception as e_save:
                            print(f"Redis Cache Error (set): {e_save}")
                    
                    return res
                except (json.JSONDecodeError, Exception) as e_json:
                    print(f"Model {model_name} produced invalid JSON: {e_json}, switching to next...")
                    continue # Switch to next Gemini model

            except Exception as e_gemini:
                err_msg = str(e_gemini).lower()
                # Switch model if: Quota hit, Model not found, or API Error
                if any(kw in err_msg for kw in ["429", "quota", "exhausted", "404", "api_key", "internal"]):
                    print(f"Gemini Model {model_name} failed: {e_gemini}, switching to next...")
                    continue 
                else:
                    print(f"Gemini Critical Error ({model_name}): {e_gemini}")
                    break # Stop if it's a critical error not related to quota/availability

    return {
        "parsed_data": None,
        "processor": "error",
        "error": "All AI models failed",
        "raw_output": ""
    }


def parse_pricing_rule(db: Session, text: str) -> dict:
    """
    Expert AI Parser to turn Natural Language Pricing Stories into JSON.
    Example: "Beli 2 gratis 1" -> {"rule_type": "tiered", ...}
    """
    system_instruction = (
        "Anda adalah pakar strategi harga ritel dan AI Parser.\n"
        "Tugas Anda adalah mengekstrak aturan harga dari teks bebas menjadi JSON presisi.\n\n"
        "Format Output JSON:\n"
        "{\n"
        "  \"name\": \"Nama Promo Singkat\",\n"
        "  \"rule_type\": \"tiered | bundle_multiple | formula | discount\",\n"
        "  \"valid_from\": \"YYYY-MM-DD\",\n"
        "  \"valid_to\": \"YYYY-MM-DD atau null\",\n"
        "  \"rule_payload\": {\n"
        "     \"product_name\": \"Nama Produk\",\n"
        "     \"tiers\": [\n"
        "       { \"qty_threshold\": number, \"unit_price\": number, \"unit\": \"kg|pcs|dll\" }\n"
        "     ] (wajib ada jika rule_type='tiered'),\n"
        "     \"bundle_rules\": {\n"
        "       \"base_price\": number,\n"
        "       \"bundle_qty\": number,\n"
        "       \"bundle_price\": number\n"
        "     } (wajib ada jika rule_type='bundle_multiple'),\n"
        "     \"multiplier\": number (wajib ada jika rule_type='formula'),\n"
        "     \"discount_percent\": number (wajib ada jika rule_type='discount')\n"
        "  }\n"
        "}\n\n"
        "Panduan Deteksi:\n"
        "1. TIERED (Harga Bertingkat): Contoh '1 Kg = 22.000, 0.5 Kg = 11.000, 0.25kg = 5.500'.\n"
        "   - rule_type = 'tiered'\n"
        "   - tiers = [\n"
        "       { \"qty_threshold\": 1.0, \"unit_price\": 22000, \"unit\": \"kg\" },\n"
        "       { \"qty_threshold\": 0.5, \"unit_price\": 11000, \"unit\": \"kg\" },\n"
        "       { \"qty_threshold\": 0.25, \"unit_price\": 5500, \"unit\": \"kg\" }\n"
        "     ]\n"
        "2. BUNDLE_MULTIPLE (Promo Kelipatan): Contoh 'Indomie: Beli 1 = 4.500 jika beli 2 = 8.000 kelipatan'.\n"
        "   - rule_type = 'bundle_multiple'\n"
        "   - bundle_rules = { \"base_price\": 4500, \"bundle_qty\": 2, \"bundle_price\": 8000 }\n"
        "3. FORMULA: Contoh 'Faktor pengali 1.2 kali harga dasar'.\n"
        "   - rule_type = 'formula'\n"
        "   - multiplier = 1.2\n"
        "4. DISCOUNT (Diskon Persentase): Contoh 'Diskon telur 10%' atau 'Potongan harga minyak 15%'.\n"
        "   - rule_type = 'discount'\n"
        "   - discount_percent = 10.0\n\n"
        "Aturan Khusus:\n"
        "- Ekstrak seluruh tier kuantitas secara lengkap. Jangan hanya mengambil tier pertama.\n"
        "- Gunakan tanggal hari ini sebagai default valid_from: " + datetime.now().strftime("%Y-%m-%d")
    )
    
    return call_ai_text(db, text, system_instruction=system_instruction, temperature=0.0)

def call_ai_vision(db: Session, image_bytes: bytes, mime_type: str, prompt: str, system_instruction: str = None) -> dict:
    """
    Expert OCR Vision caller with switching support.
    """
    if not settings.GOOGLE_API_KEY:
        raise Exception("GOOGLE_API_KEY is required for Vision.")

    client = genai.Client(api_key=settings.GOOGLE_API_KEY)
    
    expert_instruction = (
        "Anda adalah sistem OCR Vision yang ahli dalam membaca dokumen, nota, dan manifes tulisan tangan dengan standar akurasi tinggi.\n"
        "Tugas Anda adalah mengekstrak seluruh data dari gambar nota yang diberikan secara presisi.\n\n"
        "Aturan Ekstraksi:\n"
        "1. Baca baris demi baris, jangan ada item yang terlewat.\n"
        "2. Jika ada coretan, angka dilingkari, atau simbol (seperti X, K, H, M), tuliskan apa adanya.\n"
        "3. Gunakan format tabel Markdown (No, Banyaknya, Nama Barang, Harga @, Jumlah).\n"
        "4. Pastikan total penjumlahan di akhir sesuai nota."
    )
    
    full_instruction = f"{expert_instruction}\n\n{system_instruction}" if system_instruction else expert_instruction

    for model_info in GEMINI_MODELS:
        model_name = model_info["name"]
        try:
            from google.genai import types
            response = client.models.generate_content(
                model=model_name,
                contents=[
                    types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    prompt
                ],
                config={
                    "system_instruction": full_instruction,
                    "temperature": 0.0
                }
            )
            
            raw_text = response.text
            _track_quota(db, f"{model_name}-vision")
            
            return {
                "raw_text": raw_text,
                "processor": f"{model_name}-vision",
                "token_in": 0,
                "token_out": len(raw_text.split())
            }
        except Exception as e:
            if "429" in str(e) or "quota" in str(e) or "404" in str(e):
                print(f"Vision Model {model_name} failed: {e}, switching...")
                continue
            raise e
    
    raise Exception("All Vision models exhausted or error occurred.")
