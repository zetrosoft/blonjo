from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from app.models.ocr import OCRTask, OCRStatus
from app.models.inventory import Product, Contact, TenantPricingRule
from app.services.ai_engine import get_embedding
import json

from app.models.accounting import Account
from app.services.smart_parser import TransactionClass, _extract_product_keywords
from typing import List


def _get_cash_accounts(tenant_id: int, db: Session) -> str:
    """Ambil daftar COA kas aktif."""
    accounts = db.query(Account.code, Account.name).filter(
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None),
        Account.is_active == True,
        Account.code.like("1-1%")
    ).order_by(Account.code).limit(20).all()
    return ", ".join(f"[{a.code}] {a.name}" for a in accounts)


def _get_sales_accounts(tenant_id: int, db: Session) -> str:
    """Ambil daftar COA penjualan aktif."""
    accounts = db.query(Account.code, Account.name).filter(
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None),
        Account.is_active == True,
        or_(Account.code.like("4-%"), Account.code.like("1-1%"))
    ).order_by(Account.code).limit(25).all()
    return ", ".join(f"[{a.code}] {a.name}" for a in accounts)


def _get_common_accounts(tenant_id: int, db: Session) -> str:
    """Ambil daftar COA umum fallback (termasuk kas, piutang, hutang, modal, beban, penjualan)."""
    accounts = db.query(Account.code, Account.name).filter(
        or_(Account.tenant_id == tenant_id, Account.tenant_id == None),
        Account.is_active == True
    ).order_by(Account.code).limit(35).all()
    return ", ".join(f"[{a.code}] {a.name}" for a in accounts)


def _get_matched_pricing_rules(tenant_id: int, keywords: List[str], db: Session) -> List[dict]:
    """Cari pricing rules aktif yang cocok dengan nama produk berdasarkan keywords."""
    if not keywords:
        return []
    
    rules = db.query(TenantPricingRule).filter(
        TenantPricingRule.tenant_id == tenant_id,
        TenantPricingRule.is_active == True
    ).all()
    
    matched = []
    for r in rules:
        p_name_raw = r.rule_payload.get("product_name")
        p_name = (p_name_raw if p_name_raw is not None else "").lower()
        if any(kw in p_name for kw in keywords):
            matched.append({
                "name": r.name,
                "rule_type": r.rule_type,
                "rule_payload": r.rule_payload
            })
            
    # Batasi agar prompt tidak meledak
    return matched[:5]


def build_minimal_context(
    text: str,
    tx_class: TransactionClass,
    tenant_id: int,
    db: Session
) -> dict:
    """
    Bangun context COA dan pricing rules sesedikit mungkin berdasarkan tipe transaksi.
    """
    if tx_class == TransactionClass.KAS_GLOBAL:
        return {
            "coa": _get_cash_accounts(tenant_id, db),
            "pricing_rules": []
        }
    elif tx_class == TransactionClass.PRODUCT_SALES:
        keywords = _extract_product_keywords(text)
        return {
            "coa": _get_sales_accounts(tenant_id, db),
            "pricing_rules": _get_matched_pricing_rules(tenant_id, keywords, db)
        }
    else:
        return {
            "coa": _get_common_accounts(tenant_id, db),
            "pricing_rules": []
        }


# COA sekarang dikelola secara terpisah oleh coa_cache.py
# Gunakan get_coa_string() dan needs_coa_in_prompt() dari sana

def get_rag_context(db: Session, tenant_id: int = None, query_text: str = "") -> str:
    """
    Consolidate GLOBAL RAG context from multiple sources.
    Optimized with VECTOR SIMILARITY for primary templates via MCP Server.
    """
    context = ""

    # 1. PRIMARY: Semantic Search for Golden Templates via MCP Server
    if query_text:
        try:
            import requests
            from app.core.config import settings
            url = f"{settings.MCP_SERVER_URL.rstrip('/')}/api/v1/rag/search"
            payload = {
                "text": query_text,
                "tenant_id": tenant_id
            }
            resp = requests.post(url, json=payload, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("action") == "bypass":
                    # If we got a bypass, we just format it so the downstream caller gets the context
                    # The downstream OCR caller might handle bypass specifically, but for now we inject it as context
                    context += "\n--- REFERENSI PEMBELAJARAN TERKAIT ---\n"
                    context += f"CONTOH MIRIP (95% MATCH): {data.get('matched_file')}\nHASIL EKSTRAKSI: {data.get('expected_output')}\n\n"
                elif data.get("rag_context"):
                    context += "\n--- REFERENSI PEMBELAJARAN TERKAIT ---\n"
                    context += data["rag_context"] + "\n\n"
        except Exception as e:
            print(f"MCP Vector search failed: {e}")

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

    # 4. Inject Dynamic Pricing Rules (RAG Context)
    if tenant_id:
        pricing_rules = db.query(TenantPricingRule).filter(
            TenantPricingRule.tenant_id == tenant_id,
            TenantPricingRule.is_active == True
        ).all()
        if pricing_rules:
            context += "\n--- ATURAN HARGA JUAL (PRICING RULES) ---\n"
            for pr in pricing_rules:
                payload_str = json.dumps(pr.rule_payload)
                context += f"- {pr.name or 'Aturan Harga'}: {payload_str}\n"

    # CATATAN: COA TIDAK lagi di-inject di sini.
    # COA dikelola oleh coa_cache.py dengan Redis TTL 10 menit.
    # Di-inject ke prompt HANYA jika diperlukan (needs_coa_in_prompt()).
    # Ini mengurangi ukuran prompt ~30% untuk input transaksi simpel.

    return context
