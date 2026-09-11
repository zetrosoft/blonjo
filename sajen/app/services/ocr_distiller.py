import re
import json
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.ocr import SupplierParsingRule

logger = logging.getLogger(__name__)


def _clean_str(val: Any) -> str:
    if val is None:
        return ""
    return re.sub(r"\s+", " ", str(val)).strip()


def _normalize_key(val: Any) -> str:
    if val is None:
        return ""
    s = str(val).lower().strip()
    s = re.sub(r"[^\w\s\.-]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def compute_deep_json_delta(original_data: Dict[str, Any], corrected_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Melakukan deep comparison antara data asli ekstraksi AI dengan data validasi akhir pengguna.
    Mendeteksi perubahan global, formula kalkulasi, diskon, pajak, dan struktur per-item.
    """
    if not original_data or not corrected_data:
        return {}

    delta: Dict[str, Any] = {
        "supplier_changed": False,
        "global_changes": {},
        "calculation_changes": [],
        "item_changes": [],
        "added_items": [],
        "deleted_items": [],
        "has_structural_changes": False
    }

    # 1. Analisis Supplier
    orig_sup = _clean_str(
        original_data.get("contact_name")
        or original_data.get("toko")
        or original_data.get("supplier_name")
        or (original_data.get("merchant") or {}).get("brand_name")
        or (original_data.get("merchant") or {}).get("name")
    )
    corr_sup = _clean_str(
        corrected_data.get("contact_name")
        or corrected_data.get("supplier_name")
        or corrected_data.get("toko")
        or (corrected_data.get("merchant") or {}).get("brand_name")
        or (corrected_data.get("merchant") or {}).get("name")
    )
    if orig_sup and corr_sup and _normalize_key(orig_sup) != _normalize_key(corr_sup):
        delta["supplier_changed"] = True
        delta["supplier_from"] = orig_sup
        delta["supplier_to"] = corr_sup

    # 2. Analisis Global Field (Diskon, Pajak, Total, Jatuh Tempo)
    check_fields = ["total_amount", "tax_amount", "tax_percentage", "global_discount_amount", "payment_method", "due_date"]
    for f in check_fields:
        ov = original_data.get(f)
        cv = corrected_data.get(f)
        if ov != cv and (ov is not None or cv is not None):
            delta["global_changes"][f] = {"from": ov, "to": cv}
            delta["has_structural_changes"] = True

    # 3. Analisis Per-Item & Formula
    orig_items = original_data.get("items") or original_data.get("item_belanja") or []
    corr_items = corrected_data.get("items") or []

    max_len = max(len(orig_items), len(corr_items))
    for i in range(max_len):
        if i < len(orig_items) and i < len(corr_items):
            oi = orig_items[i] if isinstance(orig_items[i], dict) else {}
            ci = corr_items[i] if isinstance(corr_items[i], dict) else {}

            item_diff = {}
            for prop in ["name", "product_name", "qty", "quantity", "price", "unit_price", "total", "subtotal", "unit", "uom", "discount"]:
                if prop in oi or prop in ci:
                    ov = oi.get(prop)
                    cv = ci.get(prop)
                    if str(ov) != str(cv) and (ov is not None or cv is not None):
                        item_diff[prop] = {"from": ov, "to": cv}

            if item_diff:
                item_diff["item_index"] = i
                item_diff["item_name"] = ci.get("name") or ci.get("product_name") or oi.get("name") or f"Item #{i+1}"
                delta["item_changes"].append(item_diff)

                # Deteksi jika ada perubahan formula kalkulasi
                o_qty = float(oi.get("qty") or oi.get("quantity") or 1)
                o_sub = float(oi.get("total") or oi.get("subtotal") or 0)
                c_qty = float(ci.get("qty") or ci.get("quantity") or 1)
                c_price = float(ci.get("price") or ci.get("unit_price") or 0)
                c_sub = float(ci.get("total") or ci.get("subtotal") or 0)

                if c_qty > 0 and c_sub > 0 and abs(c_price - (c_sub / c_qty)) < 0.01 and abs(c_price - float(oi.get("price") or 0)) > 1:
                    delta["calculation_changes"].append({
                        "item": item_diff["item_name"],
                        "note": "Harga satuan disesuaikan dari (Subtotal / Qty)."
                    })
                    delta["has_structural_changes"] = True

        elif i < len(orig_items):
            oi = orig_items[i] if isinstance(orig_items[i], dict) else {}
            delta["deleted_items"].append(oi.get("name") or oi.get("product_name") or f"Item #{i+1}")
            delta["has_structural_changes"] = True
        elif i < len(corr_items):
            ci = corr_items[i] if isinstance(corr_items[i], dict) else {}
            delta["added_items"].append(ci.get("name") or ci.get("product_name") or f"Item #{i+1}")
            delta["has_structural_changes"] = True

    return delta


def distill_supplier_rules(
    db: Session,
    tenant_id: Optional[int],
    supplier_name: str,
    raw_ocr_text: str,
    delta_summary: Dict[str, Any]
) -> List[Dict[str, str]]:
    """
    LLM Meta-Distillation Agent.
    Menganalisis perbedaan data dan merumuskan aturan penafsiran nota spesifik supplier.
    """
    if not supplier_name or not delta_summary:
        return []

    # Jika tidak ada perubahan struktural atau kalkulatif, tidak perlu memanggil LLM distilasi
    if not delta_summary.get("has_structural_changes") and len(delta_summary.get("item_changes", [])) < 2:
        return []

    from app.services.ai_engine import call_ai_text
    
    prompt = f"""Anda adalah Senior Software Architect & Akuntan OCR Vision.
Pengguna baru saja mengoreksi hasil ekstraksi nota pembelian dari supplier '{supplier_name}'.

TEKS MENTAH NOTA (RAW OCR):
{raw_ocr_text[:1000]}

RINGKASAN PERBEDAAN (DIFF HASIL AI vs KOREKSI USER):
{json.dumps(delta_summary, indent=2, ensure_ascii=False)}

TUGAS ANDA:
Analisa secara mendalam mengapa hasil AI awal berbeda dengan koreksi pengguna (misal: apakah ada kolom Qty tersembunyi, diskon per baris, harga neto, biaya tambahan, singkatan nama produk, dsb).
Rumuskan 1 sampai maksimal 3 aturan penafsiran nota yang SANGAT JELAS, PADAT, dan DETERMINISTIK dalam Bahasa Indonesia agar AI tidak mengulang kesalahan pada nota berikutnya dari supplier '{supplier_name}'.

FORMAT OUTPUT WAJIB JSON VALID TANPA MARKDOWN:
[
  {{
    "category": "calculation | multi_column | tax_discount | item_structure | general",
    "instruction": "Instruksi aturan jelas yang memandu AI membaca kolom/angka pada nota supplier ini"
  }}
]
"""
    system_instruction = "Anda adalah AI Rule Distillation Engine. Hasilkan HANYA array JSON aturan presisi tanpa kalimat pengantar."
    try:
        res = call_ai_text(db, prompt, system_instruction=system_instruction, temperature=0.0)
        parsed = res.get("parsed_data")
        if isinstance(parsed, list):
            return parsed
        elif isinstance(parsed, dict) and "rules" in parsed:
            return parsed["rules"]
        return []
    except Exception as e:
        logger.warning(f"[OCR Distiller] Rule distillation failed: {e}")
        return []


def upsert_supplier_rules(
    db: Session,
    tenant_id: Optional[int],
    supplier_name: str,
    rules: List[Dict[str, str]],
    sample_diff: Optional[Dict[str, Any]] = None
) -> None:
    """
    Menyimpan atau memperbarui aturan distilasi ke tabel `supplier_parsing_rules`.
    """
    if not supplier_name or not rules:
        return

    norm_supplier = _normalize_key(supplier_name)
    if not norm_supplier or len(norm_supplier) < 2:
        return

    try:
        for r in rules:
            category = r.get("category") or "general"
            instruction = _clean_str(r.get("instruction"))
            if not instruction or len(instruction) < 10:
                continue

            existing = db.query(SupplierParsingRule).filter(
                or_(SupplierParsingRule.tenant_id == tenant_id, SupplierParsingRule.tenant_id.is_(None)),
                SupplierParsingRule.supplier_pattern == norm_supplier,
                SupplierParsingRule.rule_category == category
            ).first()

            if existing:
                existing.rule_instruction = instruction
                existing.sample_diff = sample_diff
                existing.confidence_count += 1
            else:
                new_rule = SupplierParsingRule(
                    tenant_id=tenant_id,
                    supplier_pattern=norm_supplier,
                    rule_category=category,
                    rule_instruction=instruction,
                    sample_diff=sample_diff,
                    confidence_count=1
                )
                db.add(new_rule)

        db.commit()
        logger.info(f"[OCR Distiller] Berhasil menyimpan {len(rules)} aturan penafsiran untuk supplier '{supplier_name}'")
    except Exception as e:
        logger.error(f"[OCR Distiller] Gagal menyimpan aturan supplier: {e}")
        db.rollback()


def get_supplier_rules_prompt(db: Session, tenant_id: Optional[int], supplier_name: Optional[str]) -> str:
    """
    Mengambil seluruh aturan aktif untuk supplier tertentu untuk disuntikkan ke prompt AI Vision / Parser.
    """
    if not supplier_name:
        return ""

    norm_supplier = _normalize_key(supplier_name)
    if not norm_supplier or len(norm_supplier) < 2:
        return ""

    try:
        rules = db.query(SupplierParsingRule).filter(
            or_(SupplierParsingRule.tenant_id == tenant_id, SupplierParsingRule.tenant_id.is_(None)),
            or_(
                SupplierParsingRule.supplier_pattern == norm_supplier,
                SupplierParsingRule.supplier_pattern.ilike(f"%{norm_supplier}%")
            )
        ).order_by(SupplierParsingRule.confidence_count.desc()).limit(5).all()

        if not rules:
            return ""

        rule_lines = [f"- [{r.rule_category.upper()}] {r.rule_instruction}" for r in rules]
        return (
            f"\n\n--- ATURAN KHUSUS NOTA SUPPLIER '{supplier_name.upper()}' (DIPELAJARI DARI KOREKSI SEBELUMNYA) ---\n"
            + "\n".join(rule_lines)
            + "\n--- AKHIR ATURAN KHUSUS SUPPLIER ---\n"
        )
    except Exception as e:
        logger.warning(f"[OCR Distiller] Gagal mengambil aturan supplier: {e}")
        return ""
