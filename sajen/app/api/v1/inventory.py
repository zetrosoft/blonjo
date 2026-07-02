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
    CategoryCreate, CategoryResponse,
    ProductCreate, ProductResponse, ProductUpdate, ProductSearchQuery,
    UnitConversionCreate, UnitConversionResponse,
    InventoryLogCreate, InventoryLogResponse,
    ContactCreate, ContactResponse, ContactUpdate,
    TenantPricingRuleCreate, TenantPricingRuleResponse,
    UomCreate, UomResponse, UomUpdate
)
from app.services.ai_engine import get_embedding
from app.models.setting import AppSetting

# Logger setup
logger = logging.getLogger("sajen.inventory")

# Router initialization
router = APIRouter()

# ==========================================
# CATEGORY ENDPOINTS (GLOBAL MASTER)
# ==========================================

@router.get("/categories", response_model=List[CategoryResponse])
def get_categories(session: SessionDep, skip: int = 0, limit: int = 100):
    return session.query(ProductCategory).offset(skip).limit(limit).all()

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
    return db_cat

# ==========================================
# PRODUCT ENDPOINTS (GLOBAL MASTER)
# ==========================================

@router.get("/products", response_model=List[ProductResponse])
def get_products(
    session: SessionDep,
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None,
    category_id: Optional[int] = None
):
    query = session.query(Product)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    
    products = query.order_by(Product.name).offset(skip).limit(limit).all()
    results = []
    for p in products:
        p_dict = {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "base_unit": p.base_unit,
            "category_id": p.category_id,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "unit_conversions": p.unit_conversions,
            "purchase_price": p.tenant_inventories[0].moving_average_cost if p.tenant_inventories else 0.0,
            "sell_price": p.tenant_prices[0].amount if p.tenant_prices else 0.0,
            "current_stock": p.tenant_inventories[0].static_stock if p.tenant_inventories else 0.0,
            "has_transactions": len(p.inventory_logs) > 0,
        }
        results.append(p_dict)
    return results

@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    existing = session.query(Product).filter(Product.sku == product_in.sku).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"SKU {product_in.sku} already exists globally")

    embedding = get_embedding(product_in.name)
    db_product = Product(**product_in.model_dump(), embedding=embedding)
    session.add(db_product)
    session.commit()
    session.refresh(db_product)
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
        embedding = get_embedding(update_data["name"])
        db_product.embedding = embedding
        
    for field, value in update_data.items():
        setattr(db_product, field, value)
        
    session.commit()
    session.refresh(db_product)
    return db_product

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
    return None

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
        TenantInventory.tenant_id == current_user.tenant_id
    ).all()
    results = []
    for p in products:
        t_inv = next((ti for ti in p.tenant_inventories if ti.tenant_id == current_user.tenant_id), None)
        t_price = next((tp for tp in p.tenant_prices if tp.tenant_id == current_user.tenant_id), None)
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
            "stock": float(t_inv.static_stock) if t_inv else 0.0,
            "current_stock": float(t_inv.static_stock) if t_inv else 0.0,
            "has_transactions": len(p.inventory_logs) > 0,
            "auto_adjusted": t_price.auto_adjusted if t_price else False,
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
    return query.order_by(Contact.name).offset(skip).limit(limit).all()

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
    db_contact = session.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == current_user.tenant_id
    ).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Kontak tidak ditemukan")
    
    update_data = contact_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
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
    db_contact = session.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == current_user.tenant_id
    ).first()
    if not db_contact:
        raise HTTPException(status_code=404, detail="Kontak tidak ditemukan")
    
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
    """Save a dynamic pricing rule and optionally auto-create product if not exists"""
    product_id = rule_in.product_id
    if not product_id and rule_in.rule_payload:
        prod_name = rule_in.rule_payload.get("product_name")
        if prod_name:
            product = session.query(Product).filter(Product.name.ilike(prod_name)).first()
            if not product:
                import uuid
                product = Product(
                    sku=f"PRD-{str(uuid.uuid4())[:6].upper()}",
                    name=prod_name,
                    base_unit="pcs"
                )
                session.add(product)
                session.flush()
            product_id = product.id

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
    return session.query(Uom).all()

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
            "stock": float(t_inv.static_stock) if t_inv else 0.0,
            "pricing_matrix": rules_payload
        })
        
    return results
