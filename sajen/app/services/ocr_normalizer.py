import re
import difflib
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.ocr import OCRAliasMapping

logger = logging.getLogger(__name__)


def _clean_str(val: Optional[str]) -> str:
    """Membersihkan spasi dan karakter non-alfanumerik berlebih untuk perbandingan string."""
    if not val:
        return ""
    return re.sub(r"\s+", " ", str(val)).strip()


def _normalize_key(val: Optional[str]) -> str:
    """Normalisasi string ke huruf kecil tanpa tanda baca berulang untuk pencocokan alias."""
    if not val:
        return ""
    # Hapus tanda baca di ujung kata dan lowercase
    s = str(val).lower().strip()
    s = re.sub(r"[^\w\s\.-]", "", s)
    return re.sub(r"\s+", " ", s).strip()


def record_ocr_entity_aliases(
    db: Session,
    tenant_id: Optional[int],
    original_data: Dict[str, Any],
    corrected_data: Dict[str, Any]
) -> None:
    """
    Mencatat hasil koreksi manual pengguna ke tabel `ocr_alias_mappings`.
    Setiap perbaikan nama supplier/merchant, nama barang, atau satuan (UOM)
    otomatis dipelajari dan disimpan sebagai alias memory untuk toko tersebut.
    """
    if not corrected_data:
        return

    try:
        # 1. Analisis Perubahan Nama Supplier / Merchant
        orig_supplier = _clean_str(
            original_data.get("contact_name")
            or original_data.get("toko")
            or original_data.get("supplier_name")
            or (original_data.get("merchant") or {}).get("brand_name")
            or (original_data.get("merchant") or {}).get("name")
        )
        corr_supplier = _clean_str(
            corrected_data.get("contact_name")
            or corrected_data.get("supplier_name")
            or corrected_data.get("toko")
            or (corrected_data.get("merchant") or {}).get("brand_name")
            or (corrected_data.get("merchant") or {}).get("name")
        )

        if orig_supplier and corr_supplier and _normalize_key(orig_supplier) != _normalize_key(corr_supplier):
            _upsert_alias(db, tenant_id, "merchant", orig_supplier, corr_supplier)

        # 2. Analisis Perubahan Per-Item (Nama Barang & UOM)
        orig_items = original_data.get("items") or original_data.get("item_belanja") or []
        corr_items = corrected_data.get("items") or []

        for i, corr_item in enumerate(corr_items):
            if not isinstance(corr_item, dict):
                continue
            corr_name = _clean_str(corr_item.get("name") or corr_item.get("product_name"))
            corr_uom = _clean_str(corr_item.get("unit") or corr_item.get("uom"))

            # Cari pasangan item asli berdasarkan urutan indeks atau ocr_name
            orig_name = ""
            orig_uom = ""
            if i < len(orig_items) and isinstance(orig_items[i], dict):
                orig_name = _clean_str(
                    orig_items[i].get("ocr_name")
                    or orig_items[i].get("name")
                    or orig_items[i].get("product_name")
                    or orig_items[i].get("nama_barang")
                )
                orig_uom = _clean_str(orig_items[i].get("unit") or orig_items[i].get("uom") or orig_items[i].get("satuan"))
            elif corr_item.get("ocr_name"):
                orig_name = _clean_str(corr_item.get("ocr_name"))

            # Catat alias nama barang
            if orig_name and corr_name and _normalize_key(orig_name) != _normalize_key(corr_name):
                _upsert_alias(db, tenant_id, "product_name", orig_name, corr_name)

            # Catat alias UOM
            if orig_uom and corr_uom and _normalize_key(orig_uom) != _normalize_key(corr_uom):
                _upsert_alias(db, tenant_id, "uom", orig_uom, corr_uom)

        db.commit()
    except Exception as e:
        logger.warning(f"[OCR Normalizer] Gagal mencatat alias koreksi: {e}")
        db.rollback()


def _upsert_alias(
    db: Session,
    tenant_id: Optional[int],
    entity_type: str,
    raw_pattern: str,
    corrected_value: str
) -> None:
    """Helper untuk menyimpan atau menaikkan bobot confidence_count pada alias."""
    norm_pattern = _normalize_key(raw_pattern)
    if not norm_pattern or len(norm_pattern) < 2:
        return

    clean_corr = _clean_str(corrected_value)
    if not clean_corr:
        return

    existing = db.query(OCRAliasMapping).filter(
        or_(OCRAliasMapping.tenant_id == tenant_id, OCRAliasMapping.tenant_id.is_(None)),
        OCRAliasMapping.entity_type == entity_type,
        OCRAliasMapping.raw_pattern == norm_pattern
    ).first()

    if existing:
        existing.corrected_value = clean_corr
        existing.confidence_count += 1
    else:
        new_alias = OCRAliasMapping(
            tenant_id=tenant_id,
            entity_type=entity_type,
            raw_pattern=norm_pattern,
            corrected_value=clean_corr,
            confidence_count=1
        )
        db.add(new_alias)


def apply_ocr_entity_aliases(
    db: Session,
    tenant_id: Optional[int],
    parsed_data: Dict[str, Any],
    similarity_threshold: float = 0.85
) -> Dict[str, Any]:
    """
    Fast-Path Semantic Normalizer (<10ms).
    Memeriksa hasil ekstraksi OCR dan mencocokkannya dengan memori alias (`ocr_alias_mappings`).
    Jika ditemukan kecocokan (exact atau similarity >= 0.85), otomatis menukar nama supplier
    dan nama barang ke hasil validasi pengguna sebelumnya.
    """
    if not parsed_data or not isinstance(parsed_data, dict):
        return parsed_data

    try:
        # 1. Ambil seluruh alias untuk tenant ini (sangat cepat, < 1000 row)
        aliases = db.query(OCRAliasMapping).filter(
            or_(OCRAliasMapping.tenant_id == tenant_id, OCRAliasMapping.tenant_id.is_(None))
        ).order_by(OCRAliasMapping.confidence_count.desc()).all()

        if not aliases:
            return parsed_data

        merchant_aliases = [a for a in aliases if a.entity_type == "merchant"]
        product_aliases = [a for a in aliases if a.entity_type == "product_name"]
        uom_aliases = [a for a in aliases if a.entity_type == "uom"]

        auto_corrected_logs: List[str] = []

        # 2. Normalisasi Nama Merchant / Supplier
        curr_supplier = (
            (parsed_data.get("merchant") or {}).get("brand_name")
            or (parsed_data.get("merchant") or {}).get("name")
            or parsed_data.get("contact_name")
            or parsed_data.get("toko")
            or parsed_data.get("supplier_name")
            or ""
        )
        if curr_supplier:
            matched_supplier = _find_best_match(curr_supplier, merchant_aliases, similarity_threshold)
            if matched_supplier and matched_supplier != curr_supplier:
                auto_corrected_logs.append(f"Merchant '{curr_supplier}' ➔ '{matched_supplier}'")
                if "merchant" in parsed_data and isinstance(parsed_data["merchant"], dict):
                    parsed_data["merchant"]["brand_name"] = matched_supplier
                    parsed_data["merchant"]["name"] = matched_supplier
                parsed_data["contact_name"] = matched_supplier
                parsed_data["toko"] = matched_supplier
                parsed_data["supplier_name"] = matched_supplier

        # 3. Normalisasi Items (Nama Barang & UOM)
        items = parsed_data.get("items") or parsed_data.get("item_belanja") or []
        for item in items:
            if not isinstance(item, dict):
                continue
            item_name = item.get("name") or item.get("product_name") or item.get("nama_barang") or ""
            if item_name:
                matched_item = _find_best_match(item_name, product_aliases, similarity_threshold)
                if matched_item and matched_item != item_name:
                    auto_corrected_logs.append(f"Item '{item_name}' ➔ '{matched_item}'")
                    item["ocr_name"] = item_name  # Simpan nama asli OCR
                    item["name"] = matched_item
                    item["product_name"] = matched_item

            item_uom = item.get("unit") or item.get("uom") or item.get("satuan") or ""
            if item_uom:
                matched_uom = _find_best_match(item_uom, uom_aliases, 0.90)
                if matched_uom and matched_uom != item_uom:
                    item["unit"] = matched_uom
                    item["uom"] = matched_uom

        if auto_corrected_logs:
            parsed_data["_auto_corrected_entities"] = auto_corrected_logs
            logger.info(f"[OCR Normalizer] Berhasil auto-correct entitas nota: {', '.join(auto_corrected_logs)}")

    except Exception as e:
        logger.warning(f"[OCR Normalizer] Gagal menerapkan alias entitas: {e}")

    return parsed_data


def _find_best_match(
    input_text: str,
    aliases: List[OCRAliasMapping],
    threshold: float
) -> Optional[str]:
    """Mencari alias terbaik berdasarkan exact match atau Trigram/Sequence similarity >= threshold."""
    norm_input = _normalize_key(input_text)
    if not norm_input:
        return None

    # Exact normalized match (Fast-path 1)
    for a in aliases:
        if a.raw_pattern == norm_input:
            return a.corrected_value

    # Fuzzy similarity match (Fast-path 2)
    best_score = 0.0
    best_val = None

    for a in aliases:
        # Bandingkan kemiripan string
        score = difflib.SequenceMatcher(None, norm_input, a.raw_pattern).ratio()
        if score > best_score:
            best_score = score
            best_val = a.corrected_value

    if best_score >= threshold and best_val:
        return best_val

    return None
