"""
Stock Opname & Reconciliation Service — SmartNote, Excel Parser, and Dual-Mode Stock Reconciliation.
"""

import io
import re
import logging
from datetime import datetime, date
from decimal import Decimal
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.models.inventory import (
    Product, ProductCategory, TenantInventory, InventoryLog,
    StockOpnameSession, StockOpnameSessionItem
)
from app.models.tenant import Tenant
from app.models.ocr import OCRAliasMapping

logger = logging.getLogger("sajen.stock_opname")

def learn_product_alias(db: Session, tenant_id: int, raw_alias: str, official_item_name: str) -> None:
    """
    Menyimpan atau memperbarui pasangan (Alias Input -> Nama Resmi Produk) ke ocr_alias_mappings.
    Digunakan lintas modul (Stock Opname, OCR, POS, MCP Copilot).
    """
    clean_raw = raw_alias.strip()
    clean_corr = official_item_name.strip()
    if not clean_raw or not clean_corr or len(clean_raw) < 2:
        return

    try:
        existing = db.query(OCRAliasMapping).filter(
            or_(OCRAliasMapping.tenant_id == tenant_id, OCRAliasMapping.tenant_id.is_(None)),
            OCRAliasMapping.entity_type == 'product_name',
            func.lower(OCRAliasMapping.raw_pattern) == clean_raw.lower()
        ).first()

        if existing:
            existing.corrected_value = clean_corr
            existing.confidence_count += 1
        else:
            new_alias = OCRAliasMapping(
                tenant_id=tenant_id,
                entity_type='product_name',
                raw_pattern=clean_raw,
                corrected_value=clean_corr,
                confidence_count=1
            )
            db.add(new_alias)
    except Exception as e_alias:
        logger.warning(f"[StockOpname] Auto-learn alias error: {e_alias}")

def match_product_by_alias_or_name(db: Session, tenant_id: int, raw_name: str) -> Tuple[Optional[Product], float, Optional[str]]:
    """
    Mencocokkan Alias Item Name ke Master Product di DB.
    Menggunakan Engine Normalizer Tunggal (app.services.ocr_normalizer._find_best_match).
    
    Urutan Prioritas:
    1. Cek ocr_alias_mappings (Memori alias terbukti/disetujui pengguna) via Pass 1 Exact & Pass 2 Fuzzy.
    2. Exact Match di Master Product DB.
    3. ILIKE Partial Match.
    4. Trigram Similarity.
    """
    clean_name = re.sub(r'^(?:\d+[\.\)]|•|-|\*)\s*', '', raw_name.strip()).strip()
    if not clean_name:
        return None, 0.0, None

    from app.services.ocr_normalizer import _find_best_match, _normalize_key

    # 1. Cek ocr_alias_mappings DAHULU (Prioritas #1 Utama)
    try:
        alias_list = db.query(OCRAliasMapping).filter(
            or_(OCRAliasMapping.tenant_id == tenant_id, OCRAliasMapping.tenant_id.is_(None)),
            OCRAliasMapping.entity_type == 'product_name'
        ).order_by(OCRAliasMapping.confidence_count.desc()).all()

        if alias_list:
            norm_clean = _normalize_key(clean_name)
            # Pass 1: Exact normalized pattern match
            for a in alias_list:
                if a.raw_pattern.lower().strip() == clean_name.lower() or _normalize_key(a.raw_pattern) == norm_clean:
                    prod_alias = db.query(Product).filter(
                        func.lower(Product.name) == a.corrected_value.lower().strip()
                    ).first()
                    if prod_alias:
                        return prod_alias, 0.99, clean_name

            # Pass 2: Fuzzy matching via ocr_normalizer._find_best_match
            matched_corr_val = _find_best_match(clean_name, alias_list, threshold=0.65)
            if matched_corr_val:
                prod_alias = db.query(Product).filter(
                    func.lower(Product.name) == matched_corr_val.lower().strip()
                ).first()
                if prod_alias:
                    return prod_alias, 0.95, clean_name
    except Exception as e_alias:
        logger.warning(f"[StockOpname] Alias lookup warning: {e_alias}")

    # 2. Exact match di master product
    exact_prod = db.query(Product).filter(
        func.lower(Product.name) == clean_name.lower()
    ).first()
    if exact_prod:
        return exact_prod, 1.0, clean_name

    # 3. ILIKE Partial Match
    ilike_prod = db.query(Product).filter(
        Product.name.ilike(f"%{clean_name}%")
    ).order_by(func.length(Product.name).asc()).first()
    if ilike_prod:
        return ilike_prod, 0.85, clean_name

    # 4. Fallback Trigram Similarity (jika pg_trgm aktif)
    try:
        trgm_sql = """
            SELECT p.id, similarity(p.name, :clean_name) as sim
            FROM products p
            WHERE similarity(p.name, :clean_name) > 0.25
            ORDER BY sim DESC LIMIT 1
        """
        trgm_res = db.execute(trgm_sql, {"clean_name": clean_name}).fetchone()
        if trgm_res:
            p_id = trgm_res[0]
            trgm_score = float(trgm_res[1])
            prod_trgm = db.query(Product).get(p_id)
            if prod_trgm:
                return prod_trgm, trgm_score, clean_name
    except Exception as e_trgm:
        logger.warning(f"[StockOpname] Trigram lookup warning: {e_trgm}")

    return None, 0.0, None


def get_latest_purchase_info(db: Session, tenant_id: int, product_id: int) -> Tuple[Decimal, str]:
    """
    Mengambil Harga Beli (purchase price) dan Unit dari transaksi kulakan terakhir (log_type = 'in').
    Jika tidak ada riwayat pembelian, kembalikan (Decimal("0.00"), base_unit).
    """
    prod = db.query(Product).get(product_id)
    default_unit = prod.base_unit if prod and prod.base_unit else "pcs"

    # 1. Cek inventory_logs kulakan terakhir
    latest_log = db.query(InventoryLog).filter(
        InventoryLog.product_id == product_id,
        InventoryLog.log_type == 'in'
    ).order_by(InventoryLog.id.desc()).first()

    if latest_log and latest_log.price_per_unit and Decimal(str(latest_log.price_per_unit)) > 0:
        return Decimal(str(latest_log.price_per_unit)), default_unit

    # 2. Cek tenant_inventories last_purchase_price / moving_average_cost
    t_inv = db.query(TenantInventory).filter(
        TenantInventory.tenant_id == tenant_id,
        TenantInventory.product_id == product_id
    ).first()
    if t_inv:
        if t_inv.last_purchase_price and Decimal(str(t_inv.last_purchase_price)) > 0:
            return Decimal(str(t_inv.last_purchase_price)), default_unit
        if t_inv.moving_average_cost and Decimal(str(t_inv.moving_average_cost)) > 0:
            return Decimal(str(t_inv.moving_average_cost)), default_unit

    return Decimal("0.00"), default_unit


def parse_stock_opname_smartnote(db: Session, tenant_id: int, content: str) -> Dict[str, Any]:
    """
    Mengurai teks SmartNote / Markdown Tabel Stock Opname.
    
    Format yang Didukung:
    Tanggal Opname : (datetime)
    | no | Item Names | qty | unit | Harga Beli | Total Harga |
    Atau baris teks kasual: "beras premium siip 10 karung", "gula pasir 50 kg"
    """
    lines = content.strip().split('\n')
    
    # 1. Parse Tanggal Opname
    opname_date_str = date.today().strftime('%Y-%m-%d %H:%M:%S')
    date_match = re.search(r'Tanggal\s*Opname\s*:\s*([^\n|]+)', content, re.IGNORECASE)
    if date_match:
        raw_dt = date_match.group(1).strip()
        try:
            # Coba parsing berbagai format datetime
            for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d-%m-%Y', '%d/%m/%Y %H:%M', '%d-%m-%Y %H:%M:%S'):
                try:
                    dt = datetime.strptime(raw_dt, fmt)
                    opname_date_str = dt.strftime('%Y-%m-%d %H:%M:%S')
                    break
                except ValueError:
                    continue
        except Exception:
            pass

    parsed_items: List[Dict[str, Any]] = []

    # 2. Iterasi Baris Teks / Tabel
    for line in lines:
        l = line.strip()
        if not l or l.startswith('---') or 'Tanggal Opname' in l:
            continue

        # ABAIKAN Header Tabel Markdown
        if re.search(r'\|\s*no\s*\|\s*item\s*names', l, re.IGNORECASE):
            continue

        # A. MODE TABEL MARKDOWN: | no | Item Names | qty | unit | Harga Beli | Total Harga |
        if l.startswith('|') and l.endswith('|'):
            parts = [p.strip() for p in l.split('|')[1:-1]]
            if len(parts) >= 3:
                # Cek susunan kolom
                raw_alias = ""
                raw_qty = "0"
                raw_unit = "pcs"
                raw_price = None

                if len(parts) >= 6:
                    # | no | Item Names | qty | unit | Harga Beli | Total Harga |
                    raw_alias = parts[1]
                    raw_qty = parts[2]
                    raw_unit = parts[3]
                    raw_price = parts[4]
                elif len(parts) == 5:
                    # | Item Names | qty | unit | Harga Beli | Total Harga |
                    raw_alias = parts[0]
                    raw_qty = parts[1]
                    raw_unit = parts[2]
                    raw_price = parts[3]
                elif len(parts) >= 3:
                    # Minimal: | Item Names | qty | unit |
                    raw_alias = parts[0]
                    raw_qty = parts[1]
                    raw_unit = parts[2]

                if raw_alias and not raw_alias.lower().startswith('no'):
                    item_data = process_single_opname_item(db, tenant_id, raw_alias, raw_qty, raw_unit, raw_price)
                    if item_data:
                        parsed_items.append(item_data)
            continue

        # B. MODE TEKS SMARTNOTE BIASA: e.g. "1. Beras Premium Siip 10 kg Rp 14.000"
        m_item = re.match(r'^(?:\d+[\.\)]\s*)?([a-zA-Z0-9\s\-_]+?)\s+([\d.,]+)\s*([a-zA-Z]+)?(?:\s+Rp\.?\s*([\d.,]+))?$', l)
        if m_item:
            raw_alias = m_item.group(1).strip()
            raw_qty = m_item.group(2).strip()
            raw_unit = m_item.group(3) or "pcs"
            raw_price = m_item.group(4)
            item_data = process_single_opname_item(db, tenant_id, raw_alias, raw_qty, raw_unit, raw_price)
            if item_data:
                parsed_items.append(item_data)

    return {
        "tanggal_opname": opname_date_str,
        "total_items": len(parsed_items),
        "items": parsed_items
    }


def process_single_opname_item(
    db: Session, 
    tenant_id: int, 
    raw_alias: str, 
    raw_qty: str, 
    raw_unit: str = "pcs", 
    raw_price: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Memproses 1 baris item opname:
    1. Konversi Qty ke Float/Decimal
    2. Match Alias Item Name -> Master Product DB
    3. Auto-Lookup Unit & Harga Beli Terakhir jika harga tidak diisi
    4. Kalkulasi Total Harga = Qty x Harga Beli
    """
    clean_alias = raw_alias.strip()
    if not clean_alias or clean_alias.lower() in ('item names', 'item_name', 'no', 'nama barang'):
        return None

    # Clean Qty
    try:
        qty_str = raw_qty.replace('.', '').replace(',', '.') if isinstance(raw_qty, str) else str(raw_qty)
        qty_val = float(qty_str)
    except Exception:
        qty_val = 0.0

    # Match Product
    prod, match_score, matched_alias = match_product_by_alias_or_name(db, tenant_id, clean_alias)
    
    product_id = prod.id if prod else None
    official_name = prod.name if prod else clean_alias
    category_name = prod.category.name if (prod and prod.category) else "Umum"

    # Auto-lookup Harga Beli & Unit Terakhir dari DB
    db_price, db_unit = (Decimal("0.00"), "pcs")
    if prod:
        db_price, db_unit = get_latest_purchase_info(db, tenant_id, prod.id)

    # Tentukan Unit
    final_unit = raw_unit.strip() if (raw_unit and raw_unit.strip() and raw_unit.strip() != '-') else db_unit

    # Tentukan Harga Beli
    final_price = Decimal("0.00")
    if raw_price and str(raw_price).strip() and str(raw_price).strip() != '-':
        try:
            price_clean = str(raw_price).replace('Rp', '').replace('rp', '').replace('.', '').replace(',', '.').strip()
            final_price = Decimal(price_clean)
        except Exception:
            final_price = db_price
    else:
        final_price = db_price

    total_price = Decimal(str(qty_val)) * final_price

    # Ambil Stok Sistem Saat Ini di DB
    system_qty = 0.0
    if prod:
        t_inv = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id,
            TenantInventory.product_id == prod.id
        ).first()
        if t_inv:
            system_qty = float(t_inv.static_stock or 0.0)

    variance_qty = qty_val - system_qty
    variance_amount = Decimal(str(variance_qty)) * final_price

    return {
        "alias_input": clean_alias,
        "product_id": product_id,
        "official_item_name": official_name,
        "category_name": category_name,
        "match_score": round(match_score, 2),
        "physical_qty": qty_val,
        "system_qty": system_qty,
        "variance_qty": round(variance_qty, 2),
        "unit": final_unit,
        "harga_beli": float(final_price),
        "total_harga": float(total_price),
        "variance_amount": float(variance_amount)
    }


def parse_stock_opname_excel(db: Session, tenant_id: int, file_bytes: bytes, filename: str) -> Dict[str, Any]:
    """
    Mengurai file Excel (.xlsx / .xls / .csv) untuk SmartNote Stock Opname.
    """
    items: List[Dict[str, Any]] = []
    opname_date_str = date.today().strftime('%Y-%m-%d %H:%M:%S')

    try:
        import pandas as pd
        if filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(file_bytes))
        else:
            df = pd.read_excel(io.BytesIO(file_bytes))

        # Normalisasi nama kolom ke lowercase
        df.columns = [str(c).strip().lower() for c in df.columns]

        # Temukan nama kolom yang sesuai
        col_name = next((c for c in df.columns if any(k in c for k in ('item', 'nama', 'alias', 'product', 'barang'))), None)
        col_qty = next((c for c in df.columns if any(k in c for k in ('qty', 'jumlah', 'fisik', 'actual', 'kuantitas'))), None)
        col_unit = next((c for c in df.columns if any(k in c for k in ('unit', 'satuan'))), None)
        col_price = next((c for c in df.columns if any(k in c for k in ('harga', 'price', 'beli', 'hpp'))), None)

        if not col_name or not col_qty:
            raise ValueError("File Excel harus memiliki minimal kolom Nama Produk/Item dan Qty!")

        for _, row in df.iterrows():
            raw_alias = str(row[col_name]).strip() if pd.notna(row[col_name]) else ""
            raw_qty = str(row[col_qty]).strip() if pd.notna(row[col_qty]) else "0"
            raw_unit = str(row[col_unit]).strip() if (col_unit and pd.notna(row[col_unit])) else "pcs"
            raw_price = str(row[col_price]).strip() if (col_price and pd.notna(row[col_price])) else None

            if raw_alias:
                item_data = process_single_opname_item(db, tenant_id, raw_alias, raw_qty, raw_unit, raw_price)
                if item_data:
                    items.append(item_data)

    except Exception as e_excel:
        logger.error(f"[StockOpname] Error parsing Excel file {filename}: {e_excel}")
        raise HTTPException(status_code=400, detail=f"Gagal memproses file Excel: {str(e_excel)}")

    return {
        "tanggal_opname": opname_date_str,
        "total_items": len(items),
        "items": items
    }


def execute_stock_reconciliation(
    db: Session, 
    tenant_id: int, 
    opname_data: List[Dict[str, Any]], 
    user_id: int, 
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Eksekusi Rekonsiliasi Stok Final (Manual Confirm).
    Mendukung Auto-Create Master Product Baru dan Idempotent Re-Upload Session.
    
    Logika Dual-Mode:
    1. is_maintenance_stock = false:
       - Recount pertama: MENOLKAN seluruh produk yang tidak ada dalam daftar opname!
       - Memperbarui stok produk yang ada di daftar opname sesuai Qty Fisik.
    2. is_maintenance_stock = true:
       - Memperbarui stok produk di tenant_inventories sesuai Qty Fisik.
       - Mencatat inventory_logs penyesuaian (adjustment/reconciliation).
    """
    import uuid
    tenant = db.query(Tenant).get(tenant_id)
    is_maintenance = tenant.maintenance_stock if tenant else False

    updated_count = 0
    zeroed_count = 0
    adjusted_logs_count = 0

    # 1. AUTO-CREATE MASTER PRODUCT & AUTO-LEARN ALIAS
    opname_product_ids = set()
    for item in opname_data:
        p_id = item.get("product_id")
        alias_input = str(item.get("alias_input", "")).strip()
        official_name = str(item.get("official_item_name", "")).strip()

        # Otomatis buat Master Product baru jika product_id belum ada tetapi official_name diisi!
        if not p_id and official_name:
            existing_prod = db.query(Product).filter(
                func.lower(Product.name) == official_name.lower()
            ).first()

            if existing_prod:
                p_id = existing_prod.id
                item["product_id"] = p_id
            else:
                new_sku = f"PRD-{uuid.uuid4().hex[:8].upper()}"
                new_prod = Product(
                    sku=new_sku,
                    name=official_name,
                    base_unit=str(item.get("unit", "pcs")).strip() or "pcs"
                )
                db.add(new_prod)
                db.flush()
                p_id = new_prod.id
                item["product_id"] = p_id
                logger.info(f"[StockOpname] Auto-created new Master Product: {official_name} (SKU: {new_sku}, ID: {p_id})")

        if p_id:
            opname_product_ids.add(p_id)

        # Otomatis pelajari alias (Alias Input -> Official Item Name)
        if alias_input and official_name:
            learn_product_alias(db, tenant_id, alias_input, official_name)

    # 2. PERLAKUAN KHUSUS is_maintenance_stock = False
    # Jika mode non-tracked stock & first recount -> Nolkan stok produk yang tidak terdaftar di opname!
    if not is_maintenance:
        unlisted_inventories = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id,
            ~TenantInventory.product_id.in_(opname_product_ids)
        ).all()

        for u_inv in unlisted_inventories:
            if u_inv.static_stock and Decimal(str(u_inv.static_stock)) != 0:
                # Log penyesuaian penolkan stok
                zero_log = InventoryLog(
                    product_id=u_inv.product_id,
                    log_type='out',
                    quantity=u_inv.static_stock,
                    price_per_unit=u_inv.last_purchase_price or 0
                )
                db.add(zero_log)
                u_inv.static_stock = Decimal("0.00")
                zeroed_count += 1

    # 3. UPDATE STOK PRODUK SESUAI DAFTAR OPNAME
    for item in opname_data:
        p_id = item.get("product_id")
        if not p_id:
            continue

        physical_qty = Decimal(str(item.get("physical_qty", 0)))
        harga_beli = Decimal(str(item.get("harga_beli", 0)))

        t_inv = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == tenant_id,
            TenantInventory.product_id == p_id
        ).first()

        old_qty = Decimal(str(t_inv.static_stock)) if (t_inv and t_inv.static_stock) else Decimal("0.00")
        diff_qty = physical_qty - old_qty

        if not t_inv:
            t_inv = TenantInventory(
                tenant_id=tenant_id,
                product_id=p_id,
                static_stock=physical_qty,
                last_purchase_price=harga_beli,
                moving_average_cost=harga_beli
            )
            db.add(t_inv)
        else:
            t_inv.static_stock = physical_qty
            if harga_beli > 0:
                t_inv.last_purchase_price = harga_beli

        if diff_qty != 0:
            log_type = 'in' if diff_qty > 0 else 'out'
            adj_log = InventoryLog(
                product_id=p_id,
                log_type=log_type,
                quantity=abs(diff_qty),
                price_per_unit=harga_beli
            )
            db.add(adj_log)
            adjusted_logs_count += 1

        updated_count += 1

    # 4. REKAM/UPDATE HISTORI SESI OPNAME (Deteksi Idempotent Re-Upload vs Sesi Baru)
    try:
        total_physical = sum(Decimal(str(item.get("total_harga", 0))) for item in opname_data)
        total_variance = sum(Decimal(str(item.get("variance_amount", 0))) for item in opname_data)

        # Cek apakah ada Sesi Opname tenant ini pada tanggal hari ini (Deteksi Re-Upload)
        existing_today_session = db.query(StockOpnameSession).filter(
            StockOpnameSession.tenant_id == tenant_id,
            StockOpnameSession.opname_date == date.today()
        ).order_by(StockOpnameSession.id.desc()).first()

        if existing_today_session:
            # UPDATE Sesi Saja (Re-Upload Data Hari Ini)
            session_record = existing_today_session
            session_record.total_items = len(opname_data)
            session_record.total_physical_amount = total_physical
            session_record.total_variance_amount = total_variance
            session_record.notes = notes or f"Re-upload Opname Tanggal {date.today()}"
            
            # Hapus items lama sesi ini lalu re-insert item terbaru
            db.query(StockOpnameSessionItem).filter(
                StockOpnameSessionItem.session_id == session_record.id
            ).delete()
        else:
            # Sesi Baru (Upload Baru)
            session_record = StockOpnameSession(
                tenant_id=tenant_id,
                user_id=user_id,
                opname_date=date.today(),
                total_items=len(opname_data),
                total_physical_amount=total_physical,
                total_variance_amount=total_variance,
                notes=notes or f"Opname Tanggal {date.today()}",
                status="CONFIRMED"
            )
            db.add(session_record)
            db.flush()

        for item in opname_data:
            p_id = item.get("product_id")
            session_item = StockOpnameSessionItem(
                session_id=session_record.id,
                product_id=p_id,
                alias_input=item.get("alias_input"),
                official_item_name=item.get("official_item_name", "Produk"),
                category_name=item.get("category_name", "Umum"),
                physical_qty=Decimal(str(item.get("physical_qty", 0))),
                system_qty=Decimal(str(item.get("system_qty", 0))),
                variance_qty=Decimal(str(item.get("variance_qty", 0))),
                unit=item.get("unit", "pcs"),
                harga_beli=Decimal(str(item.get("harga_beli", 0))),
                total_harga=Decimal(str(item.get("total_harga", 0))),
                variance_amount=Decimal(str(item.get("variance_amount", 0)))
            )
            db.add(session_item)
    except Exception as e_session:
        logger.warning(f"[StockOpname] Session history log warning: {e_session}")

    db.commit()

    return {
        "status": "success",
        "is_maintenance_stock": is_maintenance,
        "updated_products_count": updated_count,
        "zeroed_unlisted_count": zeroed_count,
        "adjusted_logs_count": adjusted_logs_count,
        "message": f"Rekonsiliasi stok berhasil dieksekusi ({updated_count} produk diperbarui, {zeroed_count} produk dinolkan)."
    }
