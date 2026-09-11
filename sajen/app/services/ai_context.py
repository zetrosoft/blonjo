from sqlalchemy.orm import Session
from sqlalchemy import or_
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
    elif tx_class == TransactionClass.PRODUCT_PURCHASE:
        # Pembelian dari supplier: tidak butuh pricing rules (itu harga jual, bukan beli)
        # Cukup akun umum (kas, utang, persediaan)
        return {
            "coa": _get_common_accounts(tenant_id, db),
            "pricing_rules": []
        }
    elif tx_class == TransactionClass.PRODUCT_SALES:
        keywords = _extract_product_keywords(text)
        return {
            "coa": _get_sales_accounts(tenant_id, db),
            "pricing_rules": []
        }
    else:
        return {
            "coa": _get_common_accounts(tenant_id, db),
            "pricing_rules": []
        }


# COA sekarang dikelola secara terpisah oleh coa_cache.py
# Gunakan get_coa_string() dan needs_coa_in_prompt() dari sana

def get_rag_context(db: Session, tenant_id: int = None, query_text: str = "", is_ocr: bool = False) -> str:
    """
    Bangun RAG context dari sumber yang relevan untuk proses OCR.
    - PRIMER : MCP vector store (semantic similarity) — sumber utama & terus tumbuh otomatis
    - MASTER DATA: daftar produk & kontak terdaftar sebagai petunjuk nama item
    Sumber Sekunder (SQL corrected tasks) dihapus — sudah digantikan oleh auto-ingest ke RAG Primer.
    Pricing Rules dihapus — ditangani oleh build_minimal_context per tipe transaksi.
    """
    context = ""

    # PRIMER: Semantic Search via MCP vector store (Only for OCR)
    if query_text and is_ocr:
        try:
            import requests
            from app.core.config import settings
            url = f"{settings.MCP_SERVER_URL.rstrip('/')}/api/v1/rag/search"
            resp = requests.post(url, json={"text": query_text, "tenant_id": tenant_id}, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("action") == "bypass":
                    # Zero-token bypass: nota ini pernah dikoreksi, langsung pakai hasilnya
                    context += "\n--- REFERENSI PEMBELAJARAN TERKAIT ---\n"
                    context += f"CONTOH MIRIP (95% MATCH): {data.get('matched_file')}\nHASIL EKSTRAKSI: {data.get('expected_output')}\n\n"
                elif data.get("rag_context"):
                    # Nota agak mirip: jadikan contoh pembanding untuk LLM
                    context += "\n--- REFERENSI PEMBELAJARAN TERKAIT ---\n"
                    context += data["rag_context"] + "\n\n"
        except Exception as e:
            print(f"[RAG] MCP Vector search failed: {e}")

    # ATURAN DISTILASI KHUSUS SUPPLIER (Learned Business & Layout Rules)
    if query_text and is_ocr:
        try:
            from app.services.ocr_distiller import get_supplier_rules_prompt
            # Deteksi nama supplier potensial dari 5 baris pertama teks nota
            lines = [l.strip() for l in query_text.splitlines() if l.strip()][:5]
            for line in lines:
                if len(line) >= 3 and not any(kw in line.lower() for kw in ["nota", "faktur", "invoice", "tanggal", "kepada", "alamat", "telp"]):
                    sup_rules = get_supplier_rules_prompt(db, tenant_id, line)
                    if sup_rules:
                        context += sup_rules + "\n"
                        break
        except Exception as _re:
            print(f"[RAG] Failed to inject supplier rules: {_re}")

    return context
