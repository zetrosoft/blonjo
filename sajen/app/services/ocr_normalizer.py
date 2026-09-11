import re
import difflib
import logging
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.models.ocr import OCRAliasMapping

logger = logging.getLogger(__name__)


# Standar Mapping UOM Distributor Indonesia
DISTRIBUTOR_UOM_MAP = {
    "car": "karton",
    "ctn": "karton",
    "krt": "karton",
    "dus": "dus",
    "box": "box",
    "rcg": "renceng",
    "ren": "renceng",
    "bal": "bal",
    "bl": "bal",
    "pak": "pack",
    "pck": "pack",
    "btl": "botol",
    "pcs": "pcs",
    "bks": "bungkus",
    "lsn": "lusin",
    "sak": "sak",
    "kg": "kg",
    "gr": "gram",
    "ltr": "liter"
}


def normalize_distributor_uom(raw_uom: Optional[str]) -> tuple[str, Optional[int]]:
    """
    Mengekstrak satuan baku dan packaging multiplier dari format UOM distributor.
    Contoh: '12 /CAR' -> ('karton', 12), '40 /CAR' -> ('karton', 40), 'CAR' -> ('karton', None).
    """
    if not raw_uom:
        return ("", None)
    
    clean = str(raw_uom).strip().lower()
    
    # Deteksi pola 'angka /satuan' misal '12 /car', '40/ctn'
    match = re.search(r'(\d+)\s*/\s*([a-z]+)', clean)
    if match:
        multiplier = int(match.group(1))
        unit_code = match.group(2)
        std_unit = DISTRIBUTOR_UOM_MAP.get(unit_code, unit_code)
        return (std_unit, multiplier)
    
    # Deteksi satuan tunggal
    clean_code = re.sub(r'[^a-z]', '', clean)
    std_unit = DISTRIBUTOR_UOM_MAP.get(clean_code, clean_code or clean)
    return (std_unit, None)


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
    similarity_threshold: float = 0.70
) -> Dict[str, Any]:
    """
    Fast-Path Semantic Normalizer (<10ms).
    Memeriksa hasil ekstraksi OCR dan mencocokkannya dengan memori alias (`ocr_alias_mappings`).
    Jika ditemukan kecocokan (exact, substring, atau similarity >= 0.70), otomatis menukar nama supplier
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
            if matched_supplier and matched_supplier.lower() != curr_supplier.lower():
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
                if matched_item and matched_item.lower() != item_name.lower():
                    auto_corrected_logs.append(f"Item '{item_name}' ➔ '{matched_item}'")
                    item["ocr_name"] = item_name  # Simpan nama asli OCR
                    item["name"] = matched_item
                    item["product_name"] = matched_item

            item_uom = item.get("unit") or item.get("uom") or item.get("satuan") or ""
            if item_uom:
                # 3a. Standar Distributor UOM & Packaging Multiplier (e.g. '12 /CAR' -> 'karton', multiplier: 12)
                std_uom, multiplier = normalize_distributor_uom(item_uom)
                if std_uom:
                    item["unit"] = std_uom
                    item["uom"] = std_uom
                if multiplier:
                    item["packaging_multiplier"] = multiplier

                # 3b. Tenant Custom UOM Aliases
                matched_uom = _find_best_match(item.get("uom") or item_uom, uom_aliases, 0.80)
                if matched_uom and matched_uom.lower() != (item.get("uom") or "").lower():
                    item["unit"] = matched_uom
                    item["uom"] = matched_uom

        if auto_corrected_logs:
            parsed_data["_auto_corrected_entities"] = auto_corrected_logs
            logger.info(f"[OCR Normalizer] Berhasil auto-correct entitas nota: {', '.join(auto_corrected_logs)}")

        # 4. Strict Mathematical Validation & Reconciler Guardrail
        parsed_data = validate_and_reconcile_math(parsed_data)

    except Exception as e:
        logger.warning(f"[OCR Normalizer] Gagal menerapkan alias entitas: {e}")

    return parsed_data


def validate_and_reconcile_math(parsed_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Strict Accounting & Mathematical Reconciler.
    Mengharmonisasikan QTY x Harga Satuan = Subtotal dan Total Belanja secara matematis
    untuk mencegah halusinasi angka dari model vision.
    """
    if not parsed_data or not isinstance(parsed_data, dict):
        return parsed_data

    items = parsed_data.get("items") or parsed_data.get("item_belanja") or []
    calculated_subtotal_sum = 0.0

    for item in items:
        if not isinstance(item, dict):
            continue

        try:
            qty = float(item.get("quantity") or item.get("kuantitas") or item.get("qty") or 1.0)
            price = float(item.get("unit_price") or item.get("harga_satuan") or item.get("price") or item.get("net_price") or 0.0)
            subtotal = float(item.get("subtotal") or item.get("jumlah") or item.get("total") or item.get("Jumlah") or item.get("neto") or 0.0)
            
            # Ekstrak diskon (dukung kolom spesifik faktur distributor: discount_product + discount_customer)
            disc_prod = float(item.get("discount_product") or 0.0)
            disc_cust = float(item.get("discount_customer") or 0.0)
            distro_disc = disc_prod + disc_cust
            disc = distro_disc if distro_disc > 0 else float(item.get("discount_amount") or item.get("discount") or item.get("diskon") or 0.0)

            # Skenario 1: Subtotal ada, tetapi harga satuan 0 -> hitung harga satuan = (subtotal + disc) / qty
            if subtotal > 0 and price == 0.0 and qty > 0:
                price = (subtotal + disc) / qty
                item["unit_price"] = price
                item["price"] = price

            # Skenario 1.5 (Self-Healing Diskon): Harga kotor dan subtotal terbaca benar, namun kolom diskon terlewat
            elif price > 0 and qty > 0 and subtotal > 0 and (qty * price) > subtotal and disc == 0.0:
                gross = qty * price
                if (gross - subtotal) >= 1.0:
                    disc = round(gross - subtotal, 2)
                    item["discount_amount"] = disc
                    item["discount"] = disc

            # Skenario 2: Harga satuan & qty ada, tetapi subtotal 0 -> hitung subtotal = (qty * price) - disc
            elif price > 0 and subtotal == 0.0 and qty > 0:
                subtotal = (qty * price) - disc
                item["subtotal"] = subtotal
                item["total"] = subtotal

            # Skenario 3: Qty bernilai 0 tapi subtotal ada -> set qty minimal 1.0
            elif qty <= 0 and subtotal > 0:
                qty = 1.0
                item["quantity"] = qty
                item["qty"] = qty
                if price == 0.0:
                    price = subtotal
                    item["unit_price"] = price
                    item["price"] = price

            calculated_subtotal_sum += subtotal
        except (ValueError, TypeError):
            continue

    # Rekonsiliasi Grand Total
    summary = parsed_data.get("summary") if isinstance(parsed_data.get("summary"), dict) else {}
    current_total = float(
        summary.get("grand_total")
        or summary.get("total")
        or parsed_data.get("total_amount")
        or parsed_data.get("total")
        or 0.0
    )

    if calculated_subtotal_sum > 0:
        tax = float(summary.get("tax_amount") or parsed_data.get("tax_amount") or 0.0)
        global_disc = float(summary.get("discount_total") or summary.get("global_discount_amount") or parsed_data.get("global_discount_amount") or 0.0)
        reconciled_total = calculated_subtotal_sum + tax - global_disc

        # Perbaiki jika total 0 atau terdapat salah baca digit dot-matrix kecil (misal 204.158 vs 204.153)
        if current_total == 0.0 or (0 < abs(current_total - reconciled_total) <= 10.0):
            if isinstance(parsed_data.get("summary"), dict):
                parsed_data["summary"]["grand_total"] = reconciled_total
            parsed_data["total_amount"] = reconciled_total
            parsed_data["total"] = reconciled_total

    return parsed_data


def _find_best_match(
    input_text: str,
    aliases: List[OCRAliasMapping],
    threshold: float
) -> Optional[str]:
    """
    Mencari alias terbaik dengan dukungan:
    1. Exact match (case & punctuation insensitive)
    2. Direct match terhadap corrected_value
    3. OCR Visual Character Confusion tolerance (h/k, s/h, 0/o, dll)
    4. Substring containment (panjang >= 3)
    5. SequenceMatcher fuzzy score >= threshold (default 0.70)
    """
    norm_input = _normalize_key(input_text)
    if not norm_input or len(norm_input) < 2:
        return None

    # 1. Exact normalized match & direct corrected match (Fast-path)
    for a in aliases:
        if a.raw_pattern == norm_input or _normalize_key(a.corrected_value) == norm_input:
            return a.corrected_value

    def _ocr_clean(s: str) -> str:
        s_clean = s.replace("0", "o").replace("1", "i").replace("h", "k").replace("5", "s")
        return s_clean

    ocr_input = _ocr_clean(norm_input)

    # 2. Substring Match
    for a in aliases:
        norm_pattern = a.raw_pattern
        if len(norm_pattern) >= 3 and len(norm_input) >= 3:
            if norm_pattern in norm_input or norm_input in norm_pattern:
                len_ratio = min(len(norm_pattern), len(norm_input)) / max(len(norm_pattern), len(norm_input))
                if len_ratio >= 0.60:
                    return a.corrected_value

    # 3. Fuzzy similarity match
    best_score = 0.0
    best_val = None

    for a in aliases:
        score = difflib.SequenceMatcher(None, norm_input, a.raw_pattern).ratio()
        score_ocr = difflib.SequenceMatcher(None, ocr_input, _ocr_clean(a.raw_pattern)).ratio()
        max_s = max(score, score_ocr)

        if max_s > best_score:
            best_score = max_s
            best_val = a.corrected_value

    if best_score >= threshold and best_val:
        return best_val

    return None


def find_semantic_basket_duplicate(
    db: Session,
    tenant_id: Optional[int],
    parsed_data: Dict[str, Any],
    current_task_id: Optional[int] = None
) -> Dict[str, Any]:
    """
    Universal Multi-Vector Semantic Basket Duplicate Matcher.
    Mendeteksi duplikasi nota antar variasi tulisan tangan/singkatan item dari supplier yang sama,
    bahkan jika nama toko tidak terbaca (nota manual tanpa kop) atau tanggal nota kosong.
    """
    res = {
        "is_duplicate": False,
        "confidence_score": 0.0,
        "matched_type": "none",
        "matched_task_id": None,
        "matched_reference_no": None,
        "matched_merchant": None,
        "matched_total": None,
        "duplicate_warning": None
    }

    if not parsed_data or not isinstance(parsed_data, dict):
        return res

    try:
        from app.models.accounting import Transaction, TransactionStatus, TransactionType
        from app.models.ocr import OCRTask, OCRStatus

        # 1. Ekstrak data kandidat nota saat ini
        cand_ref = _clean_str(
            (parsed_data.get("transaction") or {}).get("invoice_number")
            or parsed_data.get("receipt_number")
            or parsed_data.get("reference_no")
            or ""
        )
        cand_merchant = _clean_str(
            (parsed_data.get("merchant") or {}).get("brand_name")
            or (parsed_data.get("merchant") or {}).get("name")
            or parsed_data.get("contact_name")
            or parsed_data.get("toko")
            or parsed_data.get("supplier_name")
            or ""
        )
        cand_total = float(
            parsed_data.get("total_amount")
            or parsed_data.get("total")
            or (parsed_data.get("summary") or {}).get("grand_total")
            or 0.0
        )
        cand_date = (
            (parsed_data.get("transaction") or {}).get("date")
            or parsed_data.get("transaction_date")
            or ""
        )

        cand_items_raw = parsed_data.get("items") or parsed_data.get("item_belanja") or []
        cand_item_names = set()
        for it in cand_items_raw:
            if isinstance(it, dict):
                n = _normalize_key(it.get("name") or it.get("product_name") or it.get("nama_barang") or "")
                if n and len(n) >= 2:
                    cand_item_names.add(n)

        # 2. Case A: Exact Invoice / Reference No
        if cand_ref and len(cand_ref) >= 4:
            q_ref = db.query(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.transaction_type == TransactionType.PURCHASE,
                Transaction.reference_no == cand_ref,
                Transaction.status == TransactionStatus.POSTED
            ).first()
            if q_ref:
                res["is_duplicate"] = True
                res["confidence_score"] = 1.0
                res["matched_type"] = "exact_invoice"
                res["matched_reference_no"] = q_ref.reference_no
                res["matched_merchant"] = cand_merchant or "Supplier"
                res["matched_total"] = float(q_ref.total_amount)
                res["duplicate_warning"] = f"⚠️ DUPLIKASI NOTA RESMI: Faktur No. '{cand_ref}' ({res['matched_merchant']}, Total: Rp {res['matched_total']:,.0f}) sudah pernah tercatat."
                return res

        # 3. Case B: Nominal + Item Basket Overlap & Supplier Matching
        if cand_total > 0:
            # Cari transaksi posted dengan total nominal identik atau rentang toleransi <= 1%
            tol = max(1000.0, cand_total * 0.01)
            recent_txs = db.query(Transaction).filter(
                Transaction.tenant_id == tenant_id,
                Transaction.transaction_type == TransactionType.PURCHASE,
                Transaction.total_amount.between(cand_total - tol, cand_total + tol),
                Transaction.status == TransactionStatus.POSTED
            ).order_by(Transaction.id.desc()).limit(20).all()

            # Bandingkan terhadap transaksi yang sudah diposting
            for tx in recent_txs:
                tx_desc = _clean_str(tx.description or "")
                tx_contact_name = _clean_str(tx.contact.name) if tx.contact else ""
                tx_supplier = tx_contact_name or tx_desc
                tx_total = float(tx.total_amount)
                
                # Cek jika merchant cocok atau justru bertentangan
                merchant_match = False
                merchant_mismatch = False
                if cand_merchant and len(cand_merchant) >= 3 and tx_supplier and len(tx_supplier) >= 3:
                    cand_k = _normalize_key(cand_merchant)
                    tx_k = _normalize_key(tx_supplier)
                    if cand_k in tx_k or tx_k in cand_k or difflib.SequenceMatcher(None, cand_k, tx_k).ratio() >= 0.65:
                        merchant_match = True
                    else:
                        # Toko / Supplier berbeda (misal Bengawan vs Tridaya)
                        merchant_mismatch = True

                if merchant_mismatch:
                    continue

                # Ambil item murni dari transaksi terkait via InventoryLog
                tx_items = set()
                if tx.inventory_logs:
                    for log in tx.inventory_logs:
                        if log.product and log.product.name:
                            p_k = _normalize_key(log.product.name)
                            if p_k and len(p_k) >= 2:
                                tx_items.add(p_k)

                # Hitung Overlap similarity
                basket_sim = 0.0
                if cand_item_names and tx_items:
                    matches = 0
                    for c in cand_item_names:
                        for t_it in tx_items:
                            if c == t_it or difflib.SequenceMatcher(None, c, t_it).ratio() >= 0.70 or (len(c) >= 3 and len(t_it) >= 3 and (c in t_it or t_it in c)):
                                matches += 1
                                break
                    basket_sim = (2.0 * matches) / (len(cand_item_names) + len(tx_items))

                # Kriteria Duplikat:
                # 1. Total cocok + Keranjang item cocok >= 40%
                # 2. Total cocok + Merchant cocok (jika nota tidak memiliki daftar item rinci)
                if basket_sim >= 0.40 or (merchant_match and not cand_item_names):
                    res["is_duplicate"] = True
                    res["confidence_score"] = max(basket_sim, 0.85 if merchant_match else 0.80)
                    res["matched_type"] = "item_basket_and_total" if basket_sim >= 0.40 else "merchant_and_total"
                    res["matched_reference_no"] = tx.reference_no
                    res["matched_merchant"] = cand_merchant or tx_supplier or "Supplier"
                    res["matched_total"] = tx_total
                    res["duplicate_warning"] = (
                        f"⚠️ DUPLIKASI PEMBELIAN TERDETEKSI (AI Basket Similarity: {basket_sim*100:.0f}%): "
                        f"Struk dari '{res['matched_merchant']}' (Total: Rp {tx_total:,.0f}) sudah pernah tercatat pada Transaksi {tx.reference_no}."
                    )
                    return res

    except Exception as e:
        logger.warning(f"[OCR Semantic Duplicate Matcher] Error evaluasi duplikat: {e}")

    return res
