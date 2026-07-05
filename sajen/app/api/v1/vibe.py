from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from app.api import deps
from app.services import ai_engine, accounting
from pydantic import BaseModel
from typing import List, Optional, Any
import json
import logging
from datetime import date
from decimal import Decimal

# Setup logging for debugging Vibe
logger = logging.getLogger(__name__)

router = APIRouter()

class IntentRequest(BaseModel):
    text: str

class VibeItem(BaseModel):
    type: str # 'stat' | 'list' | 'message'
    title: str
    data: Optional[Any] = None
    content: Optional[str] = None

class VibeResponse(BaseModel):
    items: List[VibeItem]
    processor: str

@router.post("/intent", response_model=VibeResponse)
async def process_vibe_intent(
    *,
    db: Session = Depends(deps.get_db),
    current_user: deps.CurrentUser,
    text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None)
):
    """
    Vibe Intent Processor - REAL DATA ONLY.
    Numeric Accuracy: Standardized for Indonesian Dot-Thousands.
    """
    from app.services.accounting import get_dashboard_summary, create_transaction_with_journal
    from app.services.reports import get_profit_loss
    from app.schemas.accounting import TransactionCreate
    from app.models.accounting import Account
    from app.models.inventory import Product, Contact

    # 1. Fetch REAL Context from DB
    doc_context = ""
    if file:
        contents = await file.read()
        ocr_res = ai_engine.call_ai_vision(
            db=db,
            image_bytes=contents,
            mime_type=file.content_type,
            prompt="Ekstrak data nota ini. TITIK adalah ribuan. Balas dengan JSON number."
        )
        doc_context = f"\nData dari Dokumen OCR (NYATA):\n{ocr_res['raw_text']}"

    summary = get_dashboard_summary(db, current_user.tenant_id)
    pl = get_profit_loss(db, current_user.tenant_id, date.today(), date.today())
    
    products = db.query(Product).filter(Product.tenant_id == current_user.tenant_id).limit(20).all()
    contacts = db.query(Contact).filter(Contact.tenant_id == current_user.tenant_id).limit(10).all()
    accounts = db.query(Account).filter(Account.tenant_id == current_user.tenant_id, Account.is_active == True).all()

    prod_list = "\n".join([f"- {p.name} (Stok: {p.current_stock} {p.unit})" for p in products])
    cont_list = "\n".join([f"- {c.name} ({c.contact_type})" for c in contacts])
    acc_list = "\n".join([f"- ID {a.id}: {a.name} ({a.code})" for a in accounts])

    # NUMERIC NORMALIZATION: Send plain integers to AI to avoid confusion
    cash_val = int(summary['cash_balance'])
    profit_val = int(pl['net_profit'])

    data_context = (
        f"--- DATA NYATA DATABASE (DILARANG MENGARANG) ---\n"
        f"Saldo Kas: {cash_val}\n"
        f"Laba Bersih: {profit_val}\n"
        f"Daftar Produk:\n{prod_list if prod_list else 'Kosong'}\n"
        f"Daftar Kontak:\n{cont_list if cont_list else 'Kosong'}\n"
        f"Daftar Akun:\n{acc_list}\n"
        f"{doc_context}\n"
        f"------------------------------------------------"
    )
    system_instruction = (
        "Anda adalah Transactional AI Orchestrator Blonjo.\n"
        "PROTOKOL ANALISIS UTUH & ATOMISASI BARIS (WAJIB):\n"
        "1. PAHAMI MAKSUD KALIMAT UTUH: Evaluasi apakah kalimat bermakna ringkasan/rekapitulasi global (misal: 'total penjualan kemarin', 'omset toko hari ini', 'pendapatan total kemarin') atau detail barang.\n"
        "2. TRANSAKSI RINGKASAN: Jika input adalah ringkasan penjualan/pembelian global tanpa menyebutkan nama barang retail satu per satu, MAKA properti 'items' pada payload trans_in harus KOSONG []. Jangan paksa membelah kata atau membuat item dummy.\n"
        "3. TRANSAKSI DETAIL: Lakukan pembelahan komponen (Nama, Qty, Unit, Angka) HANYA jika pengguna menyebutkan nama barang ritel spesifik (misal: 'beras 10kg', '2 sabun @5000').\n"
        "4. DETEKSI TOTAL: Angka tanpa '@' adalah TOTAL baris. Hitung unit_price = Total / Qty.\n"
        "5. LIST ITEMS: Koma (,) berarti pecah menjadi item-item berbeda.\n"
        "6. ANGKA INDONESIA: TITIK (.) adalah ribuan. Output JSON harus number murni.\n\n"
        "KONTRAK INTEGRASI (WAJIB):\n"
        "- UI: Gunakan Nama Akun yang manusiawi (cth: 'Kas', 'Pendapatan') sebagai 'title'. DILARANG menampilkan ID.\n"
        "- ACTION: Gunakan ID Akun (angka) untuk field 'account_id' dalam payload.\n\n"
        f"{data_context}\n"
        "FORMAT OUTPUT (JSON Object):\n"
        "{\n"
        "  \"action\": { \"type\": \"CREATE_TRANSACTION\", \"payload\": { \"description\": \"...\", \"amount\": 0, ... } } | null,\n"
        "  \"ui\": [ { \"type\": \"stat\", \"title\": \"Nama Akun (Manusiawi)\", \"data\": \"Value\" }, ... ]\n"
        "}\n\n"
        "Perhitungan Matematika HARUS PRESISI (Qty * Unit Price = Total)."
    )
    
    intent_text = text or "Tampilkan dashboard"
    
    # 0. PRE-EMPTIVE NORMALIZATION (Numeric Integrity)
    import re
    # Clean dots that look like thousand separators (e.g., 443.250 -> 443250)
    normalized_intent = re.sub(r'(\d)\.(\d{3})(\b|\s)', r'\1\2\3', intent_text)
    normalized_intent = re.sub(r'(\d)\.(\d{3})(\b|\s)', r'\1\2\3', normalized_intent)

    try:
        response = ai_engine.call_ai_text(db, normalized_intent, system_instruction, temperature=0.0)
        raw_data = response.get("parsed_data") or {}
        
        ui_raw = raw_data.get("ui", [])
        ui_items = ui_raw if isinstance(ui_raw, list) else [ui_raw] if ui_raw else []
        action = raw_data.get("action")

        if action and action.get("type") == "CREATE_TRANSACTION":
            try:
                payload = action.get("payload")
                if isinstance(payload.get("transaction_date"), str):
                    payload["transaction_date"] = date.fromisoformat(payload["transaction_date"])
                
                trans_in = TransactionCreate(**payload)
                create_transaction_with_journal(db, trans_in, current_user.id, current_user.tenant_id)
                
                ui_items.insert(0, {
                    "type": "message", 
                    "title": "✅ Berhasil Disimpan", 
                    "content": f"Berhasil mencatat '{payload.get('description')}' ke database."
                })
            except Exception as e_trans:
                logger.error(f"Vibe Transaction Error: {e_trans}")
                ui_items.insert(0, {
                    "type": "message", 
                    "title": "❌ Gagal Simpan", 
                    "content": f"AI mencoba menyimpan tapi ditolak: {str(e_trans)}"
                })

        if not ui_items:
            ui_items = [{"type": "message", "title": "Info", "content": "Permintaan diproses namun tidak ada visual yang dihasilkan."}]

        return {
            "items": ui_items,
            "processor": response.get("processor", "unknown")
        }
        
    except Exception as e:
        logger.error(f"Vibe Critical Error: {e}")
        return {
            "items": [{"type": "message", "title": "Error", "content": f"Vibe Engine Error: {str(e)}"}],
            "processor": "error"
        }
