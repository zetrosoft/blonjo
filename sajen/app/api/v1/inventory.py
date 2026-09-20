import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api.deps import SessionDep, CurrentUser, check_role
from app.models.user import UserRole, User
from app.models.inventory import (
    Product, ProductCategory, ProductUnitConversion,
    TenantInventory, TenantProductPrice, TenantPricingRule,
    InventoryLog, Contact, Uom
)
from app.schemas.inventory import (
    CategoryCreate, CategoryResponse, CategoryUpdate,
    ProductCreate, ProductResponse, ProductUpdate, ProductSearchQuery,
    UnitConversionCreate, UnitConversionResponse,
    InventoryLogCreate, InventoryLogResponse,
    ContactCreate, ContactResponse, ContactUpdate,
    TenantPricingRuleCreate, TenantPricingRuleResponse,
    UomCreate, UomResponse, UomUpdate,
    StockAdjustRequest, AutocompleteRequest, AutocompleteItemResponse,
    ProductMergeRequest
)
from app.services.ai_engine import get_embedding
from app.services.onnx_embed import get_onnx_embedding
from app.models.setting import AppSetting
from app.models.accounting import Transaction
from app.services.inventory import InventoryService

# Logger setup
logger = logging.getLogger("sajen.inventory")

# Router initialization
router = APIRouter()

# ==========================================
# STOCK OPNAME & RECONCILIATION ENDPOINTS
# ==========================================

from fastapi import File, UploadFile
from pydantic import BaseModel

class SmartNoteOpnameRequest(BaseModel):
    content: str

class ReconciliationApplyRequest(BaseModel):
    opname_data: List[dict]
    notes: Optional[str] = None

@router.post("/stock-opname/smartnote")
@router.post("/stock-opname/smartnote/")
def parse_smartnote_opname(
    payload: SmartNoteOpnameRequest,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER]))
):
    from app.services.stock_opname_service import parse_stock_opname_smartnote
    try:
        res = parse_stock_opname_smartnote(session, current_user.tenant_id, payload.content)
        return res
    except Exception as e:
        logger.error(f"Error parsing SmartNote opname: {e}")
        raise HTTPException(status_code=400, detail=f"Gagal memproses SmartNote opname: {str(e)}")

@router.post("/stock-opname/upload-xls")
@router.post("/stock-opname/upload-xls/")
async def upload_excel_opname(
    session: SessionDep,
    file: UploadFile = File(...),
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER, UserRole.CASHIER]))
):
    from app.services.stock_opname_service import parse_stock_opname_excel
    try:
        contents = await file.read()
        res = parse_stock_opname_excel(session, current_user.tenant_id, contents, file.filename or "opname.xlsx")
        return res
    except Exception as e:
        logger.error(f"Error uploading Excel opname: {e}")
        raise HTTPException(status_code=400, detail=f"Gagal memproses file Excel: {str(e)}")

class AliasMappingCreateRequest(BaseModel):
    raw_pattern: str
    corrected_value: str

@router.post("/reconciliation/apply")
@router.post("/reconciliation/apply/")
def apply_stock_reconciliation(
    payload: ReconciliationApplyRequest,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    from app.services.stock_opname_service import execute_stock_reconciliation
    try:
        res = execute_stock_reconciliation(
            db=session,
            tenant_id=current_user.tenant_id,
            opname_data=payload.opname_data,
            user_id=current_user.id,
            notes=payload.notes
        )
        return res
    except Exception as e:
        logger.error(f"Error executing stock reconciliation: {e}")
        raise HTTPException(status_code=500, detail=f"Gagal mengeksekusi rekonsiliasi stok: {str(e)}")

@router.get("/alias-mappings")
@router.get("/alias-mappings/")
def get_alias_mappings(
    session: SessionDep,
    current_user: CurrentUser,
    search: Optional[str] = None,
    limit: int = 100
):
    from app.models.ocr import OCRAliasMapping
    from sqlalchemy import or_
    query = session.query(OCRAliasMapping).filter(
        or_(OCRAliasMapping.tenant_id == current_user.tenant_id, OCRAliasMapping.tenant_id.is_(None)),
        OCRAliasMapping.entity_type == 'product_name'
    )
    if search:
        query = query.filter(
            OCRAliasMapping.raw_pattern.ilike(f"%{search}%") | OCRAliasMapping.corrected_value.ilike(f"%{search}%")
        )
    return query.order_by(OCRAliasMapping.confidence_count.desc()).limit(limit).all()

@router.post("/alias-mappings")
@router.post("/alias-mappings/")
def create_or_update_alias_mapping(
    payload: AliasMappingCreateRequest,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    from app.services.stock_opname_service import learn_product_alias
    try:
        learn_product_alias(session, current_user.tenant_id, payload.raw_pattern, payload.corrected_value)
        session.commit()
        return {"status": "success", "message": f"Alias '{payload.raw_pattern}' berhasil dipetakan ke '{payload.corrected_value}'."}
    except Exception as e:
        session.rollback()
@router.get("/stock-opname/history")
@router.get("/stock-opname/history/")
def get_stock_opname_history(
    session: SessionDep,
    current_user: CurrentUser,
    limit: int = 50
):
    from app.models.inventory import StockOpnameSession
    from sqlalchemy.orm import selectinload
    try:
        sessions = session.query(StockOpnameSession).options(
            selectinload(StockOpnameSession.items)
        ).filter(
            StockOpnameSession.tenant_id == current_user.tenant_id
        ).order_by(StockOpnameSession.id.desc()).limit(limit).all()

        results = []
        for s in sessions:
            results.append({
                "id": s.id,
                "opname_date": str(s.opname_date),
                "total_items": s.total_items,
                "total_physical_amount": float(s.total_physical_amount or 0),
                "total_variance_amount": float(s.total_variance_amount or 0),
                "notes": s.notes,
                "status": s.status,
                "created_at": str(s.created_at),
                "items": [
                    {
                        "alias_input": item.alias_input,
                        "product_id": item.product_id,
                        "official_item_name": item.official_item_name,
                        "category_name": item.category_name or "Umum",
                        "match_score": 1.0,
                        "physical_qty": float(item.physical_qty or 0),
                        "system_qty": float(item.system_qty or 0),
                        "variance_qty": float(item.variance_qty or 0),
                        "unit": item.unit,
                        "harga_beli": float(item.harga_beli or 0),
                        "total_harga": float(item.total_harga or 0),
                        "variance_amount": float(item.variance_amount or 0)
                    }
                    for item in s.items
                ]
            })
        return results
    except Exception as e:
        logger.error(f"Error fetching stock opname history: {e}")
        return []



# ==========================================
# CATEGORY ENDPOINTS (GLOBAL MASTER)
# ==========================================

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(session: SessionDep, skip: int = 0, limit: int = 100):
    from app.core.redis import get_redis_client
    import json
    cache_key = f"categories_list:{skip}:{limit}"
    try:
        redis_client = get_redis_client()
        if redis_client:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
    except Exception as e:
        logger.error(f"Redis get categories error: {e}")

    categories = session.query(ProductCategory).order_by(ProductCategory.name.asc()).offset(skip).limit(limit).all()
    results = [CategoryResponse.model_validate(c).model_dump(mode="json") for c in categories]

    try:
        redis_client = get_redis_client()
        if redis_client:
            redis_client.setex(cache_key, 600, json.dumps(results, default=str))
    except Exception as e:
        logger.error(f"Redis set categories error: {e}")

    return results

@router.post("/categories", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    cat_in: CategoryCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    existing = session.query(ProductCategory).filter(ProductCategory.name == cat_in.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    
    db_cat = ProductCategory(**cat_in.model_dump())
    session.add(db_cat)
    session.commit()
    session.refresh(db_cat)

    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["categories"])
    return db_cat

@router.put("/categories/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: int,
    cat_in: CategoryUpdate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    db_cat = session.query(ProductCategory).filter(ProductCategory.id == category_id).first()
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
        
    update_data = cat_in.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != db_cat.name:
        existing = session.query(ProductCategory).filter(ProductCategory.name == update_data["name"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Category name already exists")
            
    for field, value in update_data.items():
        setattr(db_cat, field, value)
        
    session.commit()
    session.refresh(db_cat)

    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["categories"])
    return db_cat

@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    db_cat = session.query(ProductCategory).filter(ProductCategory.id == category_id).first()
    if not db_cat:
        raise HTTPException(status_code=404, detail="Category not found")
        
    # Check if there are active products using this category
    has_products = session.query(Product).filter(Product.category_id == category_id).first()
    if has_products:
        raise HTTPException(status_code=400, detail="Tidak dapat menghapus kategori yang masih memiliki produk")

    session.delete(db_cat)
    session.commit()

    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["categories"])
    return None

# ==========================================
# PRODUCT ENDPOINTS (GLOBAL MASTER)
# ==========================================

@router.get("/products", response_model=List[ProductResponse])
def get_products(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 1000,
    search: Optional[str] = None,
    category_id: Optional[int] = None
):
    # Cek setting stock maintenance (static vs dynamic) 1 kali untuk tenant
    setting = session.query(AppSetting).filter(
        AppSetting.tenant_id == current_user.tenant_id, 
        AppSetting.key == "stock_maintenance"
    ).first()
    is_static = setting.value.lower() == "true" if setting else False

    from sqlalchemy.orm import selectinload
    query = session.query(Product).options(selectinload(Product.unit_conversions)).filter(~Product.name.ilike('potongan%'))
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    
    products = query.order_by(Product.name).offset(skip).limit(limit).all()
    if not products:
        return []

    prod_ids = [p.id for p in products]

    # 1. Bulk Query TenantInventories (purchase price & static stock)
    tenant_inv_map = {
        ti.product_id: ti
        for ti in session.query(TenantInventory).filter(
            TenantInventory.tenant_id == current_user.tenant_id,
            TenantInventory.product_id.in_(prod_ids)
        ).all()
    }

    # 2. Bulk Query TenantProductPrices (sell price)
    from app.models.inventory import TenantProductPrice
    tenant_price_map = {
        tp.product_id: float(tp.amount or 0.0)
        for tp in session.query(TenantProductPrice).filter(
            TenantProductPrice.tenant_id == current_user.tenant_id,
            TenantProductPrice.product_id.in_(prod_ids)
        ).all()
    }

    # 3. Bulk Query Current Stock (1 Batch SQL Query)
    stock_map = {}
    if is_static:
        for p_id in prod_ids:
            ti = tenant_inv_map.get(p_id)
            stock_map[p_id] = float(ti.static_stock or 0.0) if ti else 0.0
    else:
        from sqlalchemy import case
        stock_query = session.query(
            InventoryLog.product_id,
            func.sum(case((InventoryLog.log_type == 'in', InventoryLog.quantity), else_=0)) -
            func.sum(case((InventoryLog.log_type == 'out', InventoryLog.quantity), else_=0))
        ).join(Transaction, Transaction.id == InventoryLog.transaction_id)\
         .filter(
             Transaction.tenant_id == current_user.tenant_id,
             InventoryLog.product_id.in_(prod_ids)
         )\
         .group_by(InventoryLog.product_id).all()

        stock_map = {row[0]: float(row[1] or 0.0) for row in stock_query}

    # 4. Bulk Query Has Transactions (1 Batch SQL Query)
    tx_prod_ids = set(
        r[0] for r in session.query(InventoryLog.product_id)
        .join(Transaction, Transaction.id == InventoryLog.transaction_id)
        .filter(
            Transaction.tenant_id == current_user.tenant_id,
            InventoryLog.product_id.in_(prod_ids)
        ).distinct().all()
    )

    # Try Redis Cache
    from app.core.redis import get_redis_client
    import json
    redis_client = None
    cache_key = f"products_list:{current_user.tenant_id}:{skip}:{limit}:{search or ''}:{category_id or ''}"
    try:
        redis_client = get_redis_client()
        if redis_client:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
    except Exception as e:
        logger.error(f"Redis get products error: {e}")

    results = []
    for p in products:
        ti = tenant_inv_map.get(p.id)
        purchase_price = float(ti.moving_average_cost or 0.0) if ti else 0.0
        sell_price = tenant_price_map.get(p.id, 0.0)
        stock_val = stock_map.get(p.id, 0.0)

        p_dict = {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "base_unit": p.base_unit,
            "category_id": p.category_id,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "unit_conversions": [
                {"id": uc.id, "unit_name": uc.unit_name, "multiplier": float(uc.multiplier or 1.0)}
                for uc in p.unit_conversions
            ] if p.unit_conversions else [],
            "purchase_price": purchase_price,
            "sell_price": sell_price,
            "current_stock": stock_val,
            "has_transactions": p.id in tx_prod_ids,
        }
        results.append(p_dict)

    # Save to Redis Cache for 10 minutes (600 seconds)
    try:
        if redis_client:
            redis_client.setex(cache_key, 600, json.dumps(results, default=str))
    except Exception as e:
        logger.error(f"Redis set products error: {e}")

    return results

def invalidate_tenant_products_cache(tenant_id: int = None):
    from app.core.redis import get_redis_client
    try:
        redis_client = get_redis_client()
        if redis_client:
            pattern = f"products_list:{tenant_id}:*" if tenant_id else "products_list:*"
            keys = redis_client.keys(pattern)
            if keys:
                redis_client.delete(*keys)
                logger.info(f"Invalidated Redis products cache ({pattern}): {len(keys)} keys")
    except Exception as e:
        logger.error(f"Redis invalidate_tenant_products_cache error: {e}")

# Cache global untuk kosakata produk di Redis (global scope)
def get_product_vocabulary(session) -> set:
    from app.core.redis import get_redis_client
    import json
    redis_client = None
    redis_key = "product_vocab:global"
    try:
        redis_client = get_redis_client()
        if redis_client:
            cached = redis_client.get(redis_key)
            if cached:
                return set(json.loads(cached))
    except Exception as e:
        logger.error(f"Redis get_product_vocabulary error: {e}")

    # Fallback ke database jika Redis offline / cache miss
    import re
    all_product_names = session.query(Product.name).all()
    vocab = set()
    for name_tuple in all_product_names:
        p_name = name_tuple[0]
        if p_name:
            for word in re.findall(r'\w+', p_name.lower()):
                if len(word) >= 2:
                    vocab.add(word)

    # Simpan ke Redis
    try:
        if redis_client:
            # Simpan cache selama 24 jam
            redis_client.setex(redis_key, 3600 * 24, json.dumps(list(vocab)))
            logger.info(f"Cached product vocabulary to Redis (global): {len(vocab)} words")
    except Exception as e:
        logger.error(f"Redis set_product_vocabulary error: {e}")

    return vocab

def invalidate_product_vocabulary_cache():
    from app.core.redis import get_redis_client
    redis_key = "product_vocab:global"
    try:
        redis_client = get_redis_client()
        if redis_client:
            redis_client.delete(redis_key)
            logger.info("Invalidated Redis product vocabulary cache (global)")
    except Exception as e:
        logger.error(f"Redis invalidate_product_vocabulary_cache error: {e}")


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    existing = session.query(Product).filter(Product.sku == product_in.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"SKU {product_in.sku} already exists globally")

    try:
        embedding = get_onnx_embedding(product_in.name, is_query=False)
    except Exception as e:
        logger.error(f"Local ONNX embedding generation failed: {e}")
        embedding = get_embedding(product_in.name)
        
    db_product = Product(**product_in.model_dump(), embedding=embedding)
    session.add(db_product)
    session.commit()
    session.refresh(db_product)
    invalidate_product_vocabulary_cache()
    invalidate_tenant_products_cache(current_user.tenant_id)
    return db_product

@router.put("/products/{sku}", response_model=ProductResponse)
def update_product(
    sku: str,
    product_in: ProductUpdate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    db_product = session.query(Product).filter(Product.sku == sku).first()
    if not db_product:
        raise HTTPException(status_code=404, detail=f"Product with sku {sku} not found")

    update_data = product_in.model_dump(exclude_unset=True)
    
    # If name is updated, update the embedding as well
    if "name" in update_data and update_data["name"] != db_product.name:
        try:
            embedding = get_onnx_embedding(update_data["name"], is_query=False)
        except Exception as e:
            logger.error(f"Local ONNX embedding generation failed during update: {e}")
            embedding = get_embedding(update_data["name"])
        db_product.embedding = embedding
        
    for field, value in update_data.items():
        setattr(db_product, field, value)
        
    session.commit()
    session.refresh(db_product)
    invalidate_product_vocabulary_cache()
    invalidate_tenant_products_cache(current_user.tenant_id)
    return db_product

@router.post("/products/merge", status_code=status.HTTP_200_OK)
def merge_products(
    payload: ProductMergeRequest,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    """
    Menggabungkan item master source ke item master target secara transaksional.
    Semua log persediaan, harga, dan relasi dialihkan, kemudian item source dihapus.
    """
    from app.models.inventory import Product, InventoryLog, TenantInventory, TenantProductPrice, TenantPricingRule
    
    # 1. Dapatkan source dan target product
    source_prod = session.query(Product).filter(Product.sku == payload.source_sku).first()
    target_prod = session.query(Product).filter(Product.sku == payload.target_sku).first()
    
    if not source_prod:
        raise HTTPException(status_code=404, detail=f"Produk sumber dengan SKU {payload.source_sku} tidak ditemukan")
    if not target_prod:
        raise HTTPException(status_code=404, detail=f"Produk target dengan SKU {payload.target_sku} tidak ditemukan")
        
    if source_prod.id == target_prod.id:
        raise HTTPException(status_code=400, detail="Produk sumber dan target tidak boleh sama")

    # 2. Alihkan seluruh InventoryLog
    session.query(InventoryLog).filter(InventoryLog.product_id == source_prod.id).update(
        {InventoryLog.product_id: target_prod.id}
    )

    # 3. Alihkan / gabungkan TenantInventory
    source_inventories = session.query(TenantInventory).filter(TenantInventory.product_id == source_prod.id).all()
    for source_inv in source_inventories:
        # Cek apakah target sudah memiliki inventory record di tenant ini
        target_inv = session.query(TenantInventory).filter(
            TenantInventory.tenant_id == source_inv.tenant_id,
            TenantInventory.product_id == target_prod.id
        ).first()
        
        if target_inv:
            # Akumulasikan static stock dan perbarui last purchase price
            target_inv.static_stock += source_inv.static_stock
            if source_inv.last_purchase_price > target_inv.last_purchase_price:
                target_inv.last_purchase_price = source_inv.last_purchase_price
            session.delete(source_inv)
        else:
            # Alihkan relasi produk langsung
            source_inv.product_id = target_prod.id

    # 4. Alihkan / gabungkan TenantProductPrice
    source_prices = session.query(TenantProductPrice).filter(TenantProductPrice.product_id == source_prod.id).all()
    for source_price in source_prices:
        target_price = session.query(TenantProductPrice).filter(
            TenantProductPrice.tenant_id == source_price.tenant_id,
            TenantProductPrice.product_id == target_prod.id
        ).first()
        
        if target_price:
            # Target yang menang, hapus data lama source
            session.delete(source_price)
        else:
            source_price.product_id = target_prod.id

    # 5. Alihkan TenantPricingRule
    session.query(TenantPricingRule).filter(TenantPricingRule.product_id == source_prod.id).update(
        {TenantPricingRule.product_id: target_prod.id}
    )

    # 6. Hapus master produk asal (source_prod)
    session.delete(source_prod)
    
    session.commit()
    invalidate_product_vocabulary_cache()
    return {"message": f"Produk {payload.source_sku} berhasil digabungkan ke {payload.target_sku}"}


@router.delete("/products/{sku}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    sku: str,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    db_product = session.query(Product).filter(Product.sku == sku).first()
    if not db_product:
        raise HTTPException(status_code=404, detail=f"Product with sku {sku} not found")
        
    session.delete(db_product)
    session.commit()
    invalidate_product_vocabulary_cache()
    return None

@router.post("/products/{sku}/adjust-stock")
def adjust_product_stock(
    sku: str,
    adjust_in: StockAdjustRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    from datetime import date
    from decimal import Decimal
    from app.models.accounting import Transaction, TransactionType, TransactionStatus
    
    product = session.query(Product).filter(Product.sku == sku).first()
    if not product:
        raise HTTPException(status_code=404, detail=f"Product with sku {sku} not found")
        
    qty = adjust_in.qty
    log_type = "in" if qty >= 0 else "out"
    abs_qty = abs(qty)
    
    # Create dummy posted transaction for this tenant
    tx = Transaction(
        tenant_id=current_user.tenant_id,
        transaction_date=date.today(),
        description=adjust_in.notes or f"Penyesuaian Stok: {product.name}",
        transaction_type=TransactionType.MANUAL,
        status=TransactionStatus.POSTED,
        total_amount=Decimal("0.00")
    )
    session.add(tx)
    session.flush()
    
    # Create inventory log
    log = InventoryLog(
        product_id=product.id,
        transaction_id=tx.id,
        quantity=Decimal(str(abs_qty)),
        price_per_unit=Decimal("0.00"),
        log_type=log_type
    )
    session.add(log)
    
    # Update static stock if maintenance is on
    InventoryService.update_stock_after_transaction(
        db=session,
        tenant_id=current_user.tenant_id,
        product_id=product.id,
        qty_change=Decimal(str(abs_qty)),
        log_type=log_type
    )
    
    session.commit()
    return {"status": "success", "new_stock": float(InventoryService.get_stock_level(session, current_user.tenant_id, product.id))}

# ==========================================
# UNIT CONVERSION ENDPOINTS (GLOBAL)
# ==========================================

@router.post("/unit-conversions", response_model=UnitConversionResponse)
def create_unit_conversion(
    conv_in: UnitConversionCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    db_conv = ProductUnitConversion(**conv_in.model_dump())
    session.add(db_conv)
    session.commit()
    session.refresh(db_conv)
    return db_conv

# ==========================================
# MY CATALOG (TENANT SPECIFIC)
# ==========================================

@router.get("/my-catalog")
def get_my_catalog(session: SessionDep, current_user: CurrentUser):
    """Get products subscribed by this tenant"""
    products = session.query(Product).join(TenantInventory).filter(
        TenantInventory.tenant_id == current_user.tenant_id,
        ~Product.name.ilike('potongan%')
    ).all()
    # Fetch active pricing rules for the tenant
    rules = session.query(TenantPricingRule).filter(
        TenantPricingRule.tenant_id == current_user.tenant_id,
        TenantPricingRule.is_active == True
    ).all()

    results = []
    for p in products:
        t_inv = next((ti for ti in p.tenant_inventories if ti.tenant_id == current_user.tenant_id), None)
        t_price = next((tp for tp in p.tenant_prices if tp.tenant_id == current_user.tenant_id), None)
        
        # Match pricing rule
        matched_rule = None
        for r in rules:
            if r.product_id == p.id:
                matched_rule = r
                break
        
        if not matched_rule:
            for r in rules:
                if r.product_id is None and r.rule_payload:
                    keyword = r.rule_payload.get('apply_to_keyword')
                    if keyword and keyword.lower() in p.name.lower():
                        matched_rule = r
                        break

        p_dict = {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "base_unit": p.base_unit,
            "category_id": p.category_id,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "unit_conversions": p.unit_conversions,
            "hpp": float(t_inv.moving_average_cost) if t_inv else 0.0,
            "purchase_price": float(t_inv.moving_average_cost) if t_inv else 0.0,
            "sell_price": float(t_price.amount) if t_price else 0.0,
            "stock": float(InventoryService.get_stock_level(session, current_user.tenant_id, p.id)),
            "current_stock": float(InventoryService.get_stock_level(session, current_user.tenant_id, p.id)),
            "has_transactions": len(p.inventory_logs) > 0,
            "auto_adjusted": t_price.auto_adjusted if t_price else False,
            "pricing_rule": {
                "id": matched_rule.id,
                "rule_type": matched_rule.rule_type,
                "rule_payload": matched_rule.rule_payload
            } if matched_rule else None,
        }
        results.append(p_dict)
    return results

@router.put("/my-catalog/{product_id}")
def update_my_catalog_item(product_id: int, payload: dict, session: SessionDep, current_user: CurrentUser):
    """Update tenant specific product price, COGS (HPP), and stock"""
    t_inv = session.query(TenantInventory).filter(
        TenantInventory.tenant_id == current_user.tenant_id,
        TenantInventory.product_id == product_id
    ).first()
    if not t_inv:
        raise HTTPException(status_code=404, detail="Item katalog tidak ditemukan")
        
    t_price = session.query(TenantProductPrice).filter(
        TenantProductPrice.tenant_id == current_user.tenant_id,
        TenantProductPrice.product_id == product_id
    ).first()
    if not t_price:
        t_price = TenantProductPrice(tenant_id=current_user.tenant_id, product_id=product_id)
        session.add(t_price)
        
    if "sell_price" in payload:
        t_price.amount = payload["sell_price"]
        t_price.auto_adjusted = False
    if "hpp" in payload:
        t_inv.moving_average_cost = payload["hpp"]
    if "stock" in payload:
        t_inv.static_stock = payload["stock"]
        
    if "pricing_rule_payload" in payload:
        rule = session.query(TenantPricingRule).filter(
            TenantPricingRule.tenant_id == current_user.tenant_id,
            TenantPricingRule.product_id == product_id,
            TenantPricingRule.is_active == True
        ).first()
        if rule:
            rule.rule_payload = payload["pricing_rule_payload"]
            session.add(rule)
        
    session.commit()
    return {"message": "Success"}

@router.post("/my-catalog/subscribe/{product_id}")
def subscribe_to_product(product_id: int, session: SessionDep, current_user: CurrentUser):
    """Link a global product to this tenant's inventory"""
    existing = session.query(TenantInventory).filter(
        TenantInventory.tenant_id == current_user.tenant_id,
        TenantInventory.product_id == product_id
    ).first()
    if existing:
        return {"message": "Product already in catalog"}
    
    ti = TenantInventory(tenant_id=current_user.tenant_id, product_id=product_id)
    tp = TenantProductPrice(tenant_id=current_user.tenant_id, product_id=product_id)
    
    session.add(ti)
    session.add(tp)
    session.commit()
    return {"message": "Success"}

# ==========================================
# REMAINING ENDPOINTS (ADAPTED)
# ==========================================

@router.post("/search", response_model=List[ProductResponse])
def search_products_semantically(
    search_query: ProductSearchQuery,
    session: SessionDep,
    current_user: CurrentUser
):
    query_embedding = get_embedding(search_query.query)
    if not query_embedding:
        raise HTTPException(status_code=503, detail="Ollama OFFLINE")

    return session.query(Product).filter(
        Product.embedding.isnot(None)
    ).order_by(
        Product.embedding.cosine_distance(query_embedding)
    ).limit(search_query.limit).all()

@router.post("/autocomplete-semantic", response_model=List[AutocompleteItemResponse])
def autocomplete_semantic(
    req: AutocompleteRequest,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Fast semantic search / autocomplete for items based on product name and SKU.
    Uses local ONNX embedding generation and pgvector HNSW cosine search.
    """
    query_text = req.query.strip()
    if not query_text:
        return []

    # 1. Ambil/bangun kosakata produk dari Redis RAM cache (global)
    product_vocabulary = get_product_vocabulary(session)

    # 2. Ekstrak kata dari kueri pencarian pengguna
    import re
    query_words = [w for w in re.findall(r'\w+', query_text.lower())]
    if not query_words:
        return []

    # 3. Validasi apakah ada kata dalam kueri yang merupakan awalan dari kosakata produk kita
    is_valid_product_query = any(
        any(v_w.startswith(q_w) for v_w in product_vocabulary) 
        for q_w in query_words
    )
    if not is_valid_product_query:
        # Jika kata yang diketik tidak bermakna nama barang yang kita miliki, jangan tampilkan dropdown
        return []

    try:
        query_vector = get_onnx_embedding(query_text, is_query=True)
    except Exception as e:
        logger.error(f"Local ONNX embedding generation failed: {e}")
        query_vector = get_embedding(query_text)
        
    if not query_vector:
        logger.warning("Embedding generation failed, falling back to standard text matching.")
        products = session.query(Product).filter(
            (Product.name.ilike(f"%{query_text}%") | Product.sku.ilike(f"%{query_text}%")) &
            (~Product.name.ilike('potongan%'))
        ).limit(req.limit).all()
        
        response_items = []
        for p in products:
            p_words = re.findall(r'\w+', p.name.lower())
            # Validasi pencocokan awalan kata
            if any(any(p_w.startswith(q_w) for p_w in p_words) for q_w in query_words):
                response_items.append(
                    AutocompleteItemResponse(
                        id=p.id,
                        sku=p.sku,
                        name=p.name,
                        category_id=p.category_id,
                        current_stock=InventoryService.get_stock_level(session, current_user.tenant_id, p.id),
                        sell_price=p.tenant_prices[0].amount if p.tenant_prices else 0.0,
                        score=1.0
                    )
                )
        return response_items

    results = (
        session.query(Product, Product.embedding.cosine_distance(query_vector).label("distance"))
        .filter(Product.embedding.isnot(None))
        .filter(~Product.name.ilike('potongan%'))
        .order_by("distance")
        .limit(req.limit * 3) # Ambil lebih banyak kandidat untuk difilter kata secara lokal
        .all()
    )

    response_items = []
    for p, distance in results:
        score = 1.0 - float(distance) if distance is not None else 0.0
        
        # Batasi skor kemiripan agar tidak memunculkan hasil acak yang terlalu jauh
        if score < 0.35:
            continue
            
        p_words = re.findall(r'\w+', p.name.lower())
        # Pastikan setidaknya ada kecocokan awalan salah satu kata pemicu
        if not any(any(p_w.startswith(q_w) for p_w in p_words) for q_w in query_words):
            continue

        stock = InventoryService.get_stock_level(session, current_user.tenant_id, p.id)
        sell_price = p.tenant_prices[0].amount if p.tenant_prices else 0.0
        
        response_items.append(
            AutocompleteItemResponse(
                id=p.id,
                sku=p.sku,
                name=p.name,
                category_id=p.category_id,
                current_stock=stock,
                sell_price=sell_price,
                score=score
            )
        )
        if len(response_items) >= req.limit:
            break

    return response_items

@router.get("/logs", response_model=List[InventoryLogResponse])
def get_inventory_logs(
    session: SessionDep,
    current_user: CurrentUser,
    product_id: Optional[int] = None,
    skip: int = 0, limit: int = 50
):
    # Logs are tenant specific but link to global products.
    # However, since logs don't have tenant_id (only via transaction/product rel), 
    # we filter by identifying products subscribed by tenant.
    query = session.query(InventoryLog).join(Product).join(TenantInventory).filter(
        TenantInventory.tenant_id == current_user.tenant_id
    )
    if product_id:
        query = query.filter(InventoryLog.product_id == product_id)
    return query.order_by(InventoryLog.created_at.desc()).offset(skip).limit(limit).all()

@router.get("/contacts", response_model=List[ContactResponse])
def get_contacts(
    session: SessionDep,
    current_user: CurrentUser,
    contact_type: Optional[str] = None,
    skip: int = 0, limit: int = 50
):
    query = session.query(Contact).filter(Contact.tenant_id == current_user.tenant_id)
    if contact_type:
        query = query.filter(Contact.contact_type == contact_type)
    
    contacts = query.order_by(Contact.name).offset(skip).limit(limit).all()
    
    # Hitung sisa hutang dinamis untuk supplier berdasarkan Jurnal Akuntansi (Double-Entry)
    from app.models.accounting import JournalEntry, Account, TransactionStatus
    from app.models.inventory import InventoryLog
    from sqlalchemy import func
    
    # Ambil akun Utang Usaha (2-1101) milik tenant atau global
    payable_account = session.query(Account).filter(
        Account.code == "2-1101",
        (Account.tenant_id == current_user.tenant_id) | (Account.tenant_id.is_(None))
    ).order_by(Account.tenant_id.desc()).first()
    
    for c in contacts:
        if c.contact_type == "supplier":
            if not payable_account:
                c.current_balance = 0.0
                continue
                
            # Ambil tx PEMBELIAN supplier yang masih OUTSTANDING (payment bukan 'lunas'/'cash'/'tunai')
            from app.models.accounting import Transaction as Tx
            from sqlalchemy import or_ as _or_
            outstanding_tx_ids = session.query(InventoryLog.transaction_id)\
                .join(Tx, Tx.id == InventoryLog.transaction_id)\
                .filter(
                    InventoryLog.contact_id == c.id,
                    InventoryLog.transaction_id.isnot(None),
                    InventoryLog.log_type == 'in',
                    Tx.tenant_id == current_user.tenant_id,
                    Tx.status == TransactionStatus.POSTED,
                    _or_(
                        Tx.payment_method.notin_(['lunas', 'cash', 'tunai']),
                        Tx.payment_method.is_(None)
                    )
                )\
                .distinct()\
                .all()
            outstanding_ids = [r[0] for r in outstanding_tx_ids]

            if not outstanding_ids:
                c.current_balance = 0.0
                continue

            # Hitung total kredit akun 2-1101 dari tx outstanding
            total_kredit = session.query(
                func.coalesce(func.sum(JournalEntry.credit), 0)
            ).filter(
                JournalEntry.transaction_id.in_(outstanding_ids),
                JournalEntry.account_id == payable_account.id
            ).scalar() or 0

            c.current_balance = float(total_kredit)
            
    return contacts


def _compute_supplier_balance(session, contact_id: int, tenant_id: int, payable_account) -> float:
    """
    Hitung saldo utang dagang supplier secara akurat dari jurnal akuntansi.

    Solusi: Filter transaksi pembelian yang payment_method BUKAN 'lunas'.
    Saat pelunasan diproses via endpoint /pay, original_tx.payment_method di-set = 'lunas'.
    Sehingga: outstanding_debt = SUM kredit akun 2-1101 dari tx pembelian yang masih outstanding.
    """
    from app.models.accounting import JournalEntry, Transaction, TransactionStatus
    from app.models.inventory import InventoryLog
    from sqlalchemy import func, and_, or_

    if not payable_account:
        return 0.0

    # Ambil transaction_id PEMBELIAN yang:
    # 1. Terkait supplier ini via InventoryLog (log_type='in')
    # 2. Status = POSTED
    # 3. payment_method BUKAN 'lunas' (masih outstanding)
    outstanding_tx_ids = session.query(InventoryLog.transaction_id)\
        .join(Transaction, Transaction.id == InventoryLog.transaction_id)\
        .filter(
            InventoryLog.contact_id == contact_id,
            InventoryLog.transaction_id.isnot(None),
            InventoryLog.log_type == 'in',
            Transaction.tenant_id == tenant_id,
            Transaction.status == TransactionStatus.POSTED,
            or_(
                Transaction.payment_method.notin_(['lunas', 'cash', 'tunai']),
                Transaction.payment_method.is_(None)
            )
        )\
        .distinct()\
        .all()
    outstanding_tx_ids = [r[0] for r in outstanding_tx_ids]

    if not outstanding_tx_ids:
        return 0.0

    # Hitung total kredit akun 2-1101 dari tx outstanding tersebut
    total_kredit = session.query(
        func.coalesce(func.sum(JournalEntry.credit), 0)
    ).filter(
        JournalEntry.transaction_id.in_(outstanding_tx_ids),
        JournalEntry.account_id == payable_account.id
    ).scalar() or 0

    return float(total_kredit)


@router.get("/contacts/{contact_id}", response_model=ContactResponse)
def get_contact_detail(
    contact_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """FIX #1: Endpoint baru untuk mendapat detail kontak tunggal dengan saldo utang yang dihitung fresh."""
    from app.models.accounting import Account

    db_contact = session.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == current_user.tenant_id
    ).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Kontak tidak ditemukan")

    # Hitung saldo utang fresh jika supplier
    if db_contact.contact_type == "supplier":
        payable_account = session.query(Account).filter(
            Account.code == "2-1101",
            (Account.tenant_id == current_user.tenant_id) | (Account.tenant_id.is_(None))
        ).order_by(Account.tenant_id.desc()).first()

        db_contact.current_balance = _compute_supplier_balance(
            session, contact_id, current_user.tenant_id, payable_account
        )

    return db_contact

@router.post("/contacts", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def create_contact(contact_in: ContactCreate, session: SessionDep, current_user: CurrentUser):
    db_contact = Contact(tenant_id=current_user.tenant_id, **contact_in.model_dump())
    session.add(db_contact)
    session.commit()
    session.refresh(db_contact)
    return db_contact

@router.put("/contacts/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: int,
    contact_in: ContactUpdate,
    session: SessionDep,
    current_user: CurrentUser
):
    from app.models.inventory import PurchasePlanItem
    
    db_contact = session.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == current_user.tenant_id
    ).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Kontak tidak ditemukan")
    
    new_name = contact_in.name
    if new_name and new_name.strip() != db_contact.name:
        # Cek jika ada kontak lain dengan nama sama (tipe sama, tenant sama)
        target_contact = session.query(Contact).filter(
            Contact.tenant_id == current_user.tenant_id,
            Contact.name == new_name.strip(),
            Contact.contact_type == db_contact.contact_type,
            Contact.id != contact_id
        ).first()
        
        if target_contact:
            # Lakukan Merger Otomatis ke target_contact!
            # 1. Alihkan log inventaris
            session.query(InventoryLog).filter(InventoryLog.contact_id == contact_id).update(
                {InventoryLog.contact_id: target_contact.id}
            )
            # 2. Alihkan preferred supplier produk di TenantInventory
            from app.models.inventory import TenantInventory
            session.query(TenantInventory).filter(TenantInventory.preferred_supplier_id == contact_id).update(
                {TenantInventory.preferred_supplier_id: target_contact.id}
            )
            # 3. Alihkan item rencana pembelian
            session.query(PurchasePlanItem).filter(PurchasePlanItem.supplier_contact_id == contact_id).update(
                {PurchasePlanItem.supplier_contact_id: target_contact.id}
            )
            
            # 4. Jumlahkan sisa saldo utang/piutang
            target_contact.current_balance += db_contact.current_balance
            
            # 5. Hapus kontak lama duplikat
            session.delete(db_contact)
            session.commit()
            session.refresh(target_contact)
            return target_contact

    # Proses update biasa jika tidak ada tabrakan nama
    update_data = contact_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "name" and value:
            value = value.strip()
        setattr(db_contact, field, value)
    
    session.add(db_contact)
    session.commit()
    session.refresh(db_contact)
    return db_contact

@router.delete("/contacts/{contact_id}")
def delete_contact(
    contact_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    from app.models.inventory import PurchasePlanItem
    
    db_contact = session.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == current_user.tenant_id
    ).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Kontak tidak ditemukan")
    
    # Periksa apakah kontak digunakan di log inventaris (transaksi stock)
    log_exists = session.query(InventoryLog).filter(InventoryLog.contact_id == contact_id).first()
    # Periksa apakah digunakan sebagai supplier utama di produk
    prod_exists = session.query(Product).filter(Product.preferred_supplier_id == contact_id).first()
    # Periksa apakah digunakan di rencana pembelian
    plan_exists = session.query(PurchasePlanItem).filter(PurchasePlanItem.supplier_contact_id == contact_id).first()
    
    if log_exists or prod_exists or plan_exists:
        raise HTTPException(
            status_code=400,
            detail="Kontak tidak dapat dihapus karena telah digunakan dalam riwayat transaksi atau katalog produk."
        )
    
    session.delete(db_contact)
    session.commit()
    return {"status": "success", "message": "Kontak berhasil dihapus"}

# ==========================================
# AI PRICING PARSER ENDPOINT
# ==========================================

@router.post("/pricing-rules/parse")
async def ai_parse_pricing_rule(
    text_in: dict, # {"text": "..."}
    session: SessionDep,
    current_user: CurrentUser
):
    """Parse natural language pricing story into JSON rule"""
    from app.services.mcp_client import mcp_client
    text = text_in.get("text", "")
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    result = await mcp_client.parse_pricing_rule(session, text)
    
    # Flatten: jika result berupa wrapper {parsed_data: {...}, processor: ...}
    # ambil parsed_data sebagai root agar frontend selalu dapat flat structure
    if isinstance(result, dict) and "parsed_data" in result and isinstance(result["parsed_data"], dict):
        flat = result["parsed_data"]
        flat["_processor"] = result.get("processor", "")
        return flat
    
    return result

from fastapi import Response

@router.get("/pricing-rules", response_model=List[TenantPricingRuleResponse])
def get_pricing_rules(
    session: SessionDep,
    current_user: CurrentUser
):
    """Get all pricing rules for the current tenant"""
    return session.query(TenantPricingRule).filter(TenantPricingRule.tenant_id == current_user.tenant_id).all()

@router.post("/pricing-rules", response_model=TenantPricingRuleResponse, status_code=status.HTTP_201_CREATED)
def create_pricing_rule(
    rule_in: TenantPricingRuleCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """Save a dynamic pricing rule. Link to product via product_id or fuzzy name match."""
    import re as _re

    def _normalize(s: str) -> str:
        """Hapus semua karakter non-alphanumeric dan lowercase untuk perbandingan."""
        return _re.sub(r'[^a-z0-9]', '', s.lower())

    product_id = rule_in.product_id
    if not product_id and rule_in.rule_payload:
        prod_name = rule_in.rule_payload.get("product_name")
        if prod_name:
            # Cari produk yang sudah ada di tenant ini dengan pencocokan nama
            products = session.query(Product).join(TenantInventory).filter(
                TenantInventory.tenant_id == current_user.tenant_id
            ).all()

            norm_search = _normalize(prod_name)
            matched_product = None
            best_score = 0

            for p in products:
                norm_p = _normalize(p.name)
                # Exact normalized match
                if norm_search == norm_p:
                    matched_product = p
                    break
                # Substring match (both directions) on normalized strings
                if norm_search in norm_p or norm_p in norm_search:
                    # Prefer longer match (more specific)
                    score = min(len(norm_search), len(norm_p))
                    if score > best_score:
                        best_score = score
                        matched_product = p

            if matched_product:
                product_id = matched_product.id
            # Jika tidak ditemukan, tetap simpan rule tanpa product_id
            # (rule bisa berlaku global atau di-link manual nanti)

    db_rule = TenantPricingRule(
        tenant_id=current_user.tenant_id,
        product_id=product_id,
        name=rule_in.name,
        rule_type=rule_in.rule_type,
        valid_from=rule_in.valid_from,
        valid_to=rule_in.valid_to,
        is_active=rule_in.is_active,
        rule_payload=rule_in.rule_payload
    )
    session.add(db_rule)
    session.commit()
    session.refresh(db_rule)
    return db_rule

@router.put("/pricing-rules/{rule_id}", response_model=TenantPricingRuleResponse)
def update_pricing_rule(
    rule_id: int,
    rule_in: TenantPricingRuleCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """Update a pricing rule"""
    db_rule = session.query(TenantPricingRule).filter(
        TenantPricingRule.id == rule_id,
        TenantPricingRule.tenant_id == current_user.tenant_id
    ).first()
    
    if not db_rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")
        
    db_rule.name = rule_in.name
    db_rule.rule_type = rule_in.rule_type
    db_rule.product_id = rule_in.product_id
    db_rule.valid_from = rule_in.valid_from
    db_rule.valid_to = rule_in.valid_to
    db_rule.is_active = rule_in.is_active
    db_rule.rule_payload = rule_in.rule_payload
    
    if db_rule.product_id:
        existing_ti = session.query(TenantInventory).filter(
            TenantInventory.tenant_id == current_user.tenant_id,
            TenantInventory.product_id == db_rule.product_id
        ).first()
        if not existing_ti:
            ti = TenantInventory(tenant_id=current_user.tenant_id, product_id=db_rule.product_id)
            tp = TenantProductPrice(tenant_id=current_user.tenant_id, product_id=db_rule.product_id)
            session.add(ti)
            session.add(tp)
    
    session.commit()
    session.refresh(db_rule)
    return db_rule

@router.delete("/pricing-rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pricing_rule(
    rule_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """Delete a pricing rule"""
    db_rule = session.query(TenantPricingRule).filter(
        TenantPricingRule.id == rule_id,
        TenantPricingRule.tenant_id == current_user.tenant_id
    ).first()
    if not db_rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")
    session.delete(db_rule)
    session.commit()
    return None

# ==========================================
# UOM ENDPOINTS (GLOBAL)
# ==========================================

@router.get("/uoms", response_model=List[UomResponse])
def list_uoms(session: SessionDep, current_user: CurrentUser):
    """List all global units of measure"""
    from app.core.redis import get_redis_client
    import json
    cache_key = "uoms_list:global"
    try:
        redis_client = get_redis_client()
        if redis_client:
            cached = redis_client.get(cache_key)
            if cached:
                return json.loads(cached)
    except Exception as e:
        logger.error(f"Redis get uoms error: {e}")

    uoms = session.query(Uom).all()
    results = [UomResponse.model_validate(u).model_dump(mode="json") for u in uoms]

    try:
        redis_client = get_redis_client()
        if redis_client:
            redis_client.setex(cache_key, 600, json.dumps(results, default=str))
    except Exception as e:
        logger.error(f"Redis set uoms error: {e}")

    return results

@router.post("/uoms", response_model=UomResponse)
def create_uom(
    uom_in: UomCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    """Create a new global unit of measure"""
    existing = session.query(Uom).filter(Uom.code == uom_in.code.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="UoM dengan kode tersebut sudah terdaftar")
        
    db_uom = Uom(
        code=uom_in.code.lower(),
        name=uom_in.name,
        category=uom_in.category,
        description=uom_in.description,
        status=uom_in.status
    )
    session.add(db_uom)
    session.commit()
    session.refresh(db_uom)

    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["uoms"])
    return db_uom

@router.put("/uoms/{uom_id}", response_model=UomResponse)
def update_uom(
    uom_id: int,
    uom_in: UomUpdate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    """Update a global unit of measure"""
    db_uom = session.query(Uom).filter(Uom.id == uom_id).first()
    if not db_uom:
        raise HTTPException(status_code=404, detail="UoM tidak ditemukan")
        
    update_data = uom_in.model_dump(exclude_unset=True)
    if "code" in update_data:
        update_data["code"] = update_data["code"].lower()
        
    for key, value in update_data.items():
        setattr(db_uom, key, value)
        
    session.commit()
    session.refresh(db_uom)

    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["uoms"])
    return db_uom

@router.delete("/uoms/{uom_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_uom(
    uom_id: int,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    """Delete a global unit of measure"""
    db_uom = session.query(Uom).filter(Uom.id == uom_id).first()
    if not db_uom:
        raise HTTPException(status_code=404, detail="UoM tidak ditemukan")
    session.delete(db_uom)
    session.commit()

    from app.core.redis import invalidate_tenant_cache
    invalidate_tenant_cache(current_user.tenant_id, ["uoms"])
    return None

@router.get("/public/stock")
def get_public_stock(phone: str, query: str, session: SessionDep):
    """Public endpoint for MCP / WhatsApp Bizeto to search product stock, prices, and rules matrix by store phone number"""
    # Clean phone number (remove +, spaces) for robustness
    clean_phone = phone.replace("+", "").replace(" ", "").strip()
    
    # 1. Cari Tenant berdasarkan store_phone
    setting = session.query(AppSetting).filter(
        AppSetting.key == "store_phone",
        (AppSetting.value == phone) | (AppSetting.value == clean_phone)
    ).first()
    
    if not setting:
        raise HTTPException(status_code=404, detail="Nomor telepon toko tidak terdaftar")
        
    tenant_id = setting.tenant_id
    
    # 2. Cari produk matching query (case-insensitive)
    db_products = session.query(Product).join(TenantInventory).filter(
        TenantInventory.tenant_id == tenant_id,
        Product.name.ilike(f"%{query}%")
    ).all()
    
    results = []
    for p in db_products:
        t_inv = next((ti for ti in p.tenant_inventories if ti.tenant_id == tenant_id), None)
        t_price = next((tp for tp in p.tenant_prices if tp.tenant_id == tenant_id), None)
        
        # Cari pricing rules aktif untuk produk ini
        pricing_rules = session.query(TenantPricingRule).filter(
            TenantPricingRule.tenant_id == tenant_id,
            TenantPricingRule.product_id == p.id,
            TenantPricingRule.is_active == True
        ).all()
        
        rules_payload = []
        for rule in pricing_rules:
            rules_payload.append({
                "rule_type": rule.rule_type,
                "name": rule.name,
                "rule_payload": rule.rule_payload
            })
            
        results.append({
            "id": p.id,
            "name": p.name,
            "sku": p.sku,
            "base_unit": p.base_unit,
            "sell_price": float(t_price.amount) if t_price else 0.0,
            "stock": float(InventoryService.get_stock_level(session, tenant_id, p.id)),
            "pricing_matrix": rules_payload
        })
        
    return results

