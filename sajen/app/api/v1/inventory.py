import os
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from ollama import Client

from app.api.deps import SessionDep, CurrentUser, check_role
from app.models.user import UserRole, User
from app.models.inventory import Product, InventoryLog, Contact
from app.schemas.inventory import (
    ProductCreate, ProductResponse, ProductUpdate, ProductSearchQuery,
    InventoryLogCreate, InventoryLogResponse,
    ContactCreate, ContactResponse
)

# Logger setup
logger = logging.getLogger("sajen.inventory")

# Router initialization
router = APIRouter()

# Ollama Client setup
OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://host.docker.internal:11434")
ollama_client = Client(host=OLLAMA_HOST)
EMBEDDING_MODEL = "nomic-embed-text"


def _generate_embedding(text: str) -> Optional[List[float]]:
    """
    Helper function to generate embedding using Ollama.
    Returns None if Ollama is offline or fails.
    """
    try:
        response = ollama_client.embeddings(model=EMBEDDING_MODEL, prompt=text)
        return response.get("embedding")
    except Exception as e:
        logger.warning(f"Failed to generate embedding via Ollama: {str(e)}")
        return None


# ==========================================
# PRODUCT ENDPOINTS (MASTER DATA)
# ==========================================

@router.get("/products", response_model=List[ProductResponse])
def get_products(
    session: SessionDep,
    current_user: CurrentUser,
    skip: int = 0,
    limit: int = 50,
    search: Optional[str] = None
):
    """
    Retrieve list of master products with standard search filter and pagination for active tenant.
    """
    query = session.query(Product).filter(Product.tenant_id == current_user.tenant_id)
    if search:
        query = query.filter(Product.name.ilike(f"%{search}%") | Product.sku.ilike(f"%{search}%"))
    return query.order_by(Product.name).offset(skip).limit(limit).all()


@router.post("/products", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    product_in: ProductCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Create a new product for the active tenant.
    Tries to generate name embedding using Ollama if online.
    """
    # Check for duplicate SKU within the same tenant
    existing_product = session.query(Product).filter(
        Product.sku == product_in.sku,
        Product.tenant_id == current_user.tenant_id
    ).first()
    if existing_product:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Product with SKU '{product_in.sku}' already exists in your store."
        )

    # Generate embedding
    embedding = _generate_embedding(product_in.name)

    db_product = Product(
        tenant_id=current_user.tenant_id,
        sku=product_in.sku,
        name=product_in.name,
        unit=product_in.unit,
        current_stock=product_in.current_stock,
        min_stock_level=product_in.min_stock_level,
        embedding=embedding
    )

    session.add(db_product)
    session.commit()
    session.refresh(db_product)
    return db_product


@router.get("/products/{product_id}", response_model=ProductResponse)
def get_product_by_id(
    product_id: int,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Get detailed information about a single product by ID for the active tenant.
    """
    product = session.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == current_user.tenant_id
    ).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with ID {product_id} not found."
        )
    return product


@router.put("/products/{product_id}", response_model=ProductResponse)
def update_product(
    product_id: int,
    product_update: ProductUpdate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Update an existing product under active tenant.
    Regenerates semantic embedding if the product name changes.
    """
    product = session.query(Product).filter(
        Product.id == product_id,
        Product.tenant_id == current_user.tenant_id
    ).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with ID {product_id} not found."
        )

    update_data = product_update.model_dump(exclude_unset=True)

    # If name changes, regenerate embedding
    if "name" in update_data and update_data["name"] != product.name:
        embedding = _generate_embedding(update_data["name"])
        product.embedding = embedding

    for field, value in update_data.items():
        setattr(product, field, value)

    session.commit()
    session.refresh(product)
    return product


# ==========================================
# SEMANTIC SEARCH ENDPOINT (pgvector)
# ==========================================

@router.post("/search", response_model=List[ProductResponse])
def search_products_semantically(
    search_query: ProductSearchQuery,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Semantic Search using pgvector cosine similarity.
    Retrieves vector embedding for search query via Ollama and queries similar products for the active tenant.
    """
    try:
        response = ollama_client.embeddings(model=EMBEDDING_MODEL, prompt=search_query.query)
        query_embedding = response.get("embedding")
        
        if not query_embedding:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Ollama service is active but failed to generate embedding vector."
            )
            
    except Exception as e:
        logger.error(f"Ollama offline or failed during semantic search: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Semantic search currently unavailable: Ollama service is OFFLINE."
        )

    # Perform pgvector cosine distance search restricted to active tenant_id
    similar_products = session.query(Product).filter(
        Product.tenant_id == current_user.tenant_id,
        Product.embedding.isnot(None)
    ).order_by(
        Product.embedding.cosine_distance(query_embedding)
    ).limit(search_query.limit).all()

    return similar_products


# ==========================================
# STOCK MOVEMENT & HPP ENDPOINTS
# ==========================================

@router.get("/logs", response_model=List[InventoryLogResponse])
def get_inventory_logs(
    session: SessionDep,
    current_user: CurrentUser,
    product_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50
):
    """
    Get inventory stock logs and HPP movement tracking for the active tenant.
    """
    query = session.query(InventoryLog).join(Product).filter(
        Product.tenant_id == current_user.tenant_id
    )
    if product_id:
        query = query.filter(InventoryLog.product_id == product_id)
    return query.order_by(InventoryLog.created_at.desc(), InventoryLog.id.desc()).offset(skip).limit(limit).all()


@router.post("/adjust-stock", response_model=InventoryLogResponse, status_code=status.HTTP_201_CREATED)
def adjust_product_stock(
    log_in: InventoryLogCreate,
    session: SessionDep,
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))
):
    """
    Manually adjust product stock level.
    Creates an InventoryLog entry and atomically updates product's current_stock under active tenant.
    """
    product = session.query(Product).filter(
        Product.id == log_in.product_id,
        Product.tenant_id == current_user.tenant_id
    ).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Product with ID {log_in.product_id} not found."
        )

    # Calculate new stock level
    if log_in.log_type == "in":
        new_stock = product.current_stock + log_in.quantity
    elif log_in.log_type == "out":
        if product.current_stock < log_in.quantity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Insufficient stock for product '{product.name}'. Current: {product.current_stock}, Requested: {log_in.quantity}"
            )
        new_stock = product.current_stock - log_in.quantity
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid log_type. Must be either 'in' or 'out'."
        )

    # Atomic database update
    db_log = InventoryLog(
        product_id=log_in.product_id,
        transaction_id=log_in.transaction_id,
        quantity=log_in.quantity,
        price_per_unit=log_in.price_per_unit,
        log_type=log_in.log_type
    )
    product.current_stock = new_stock

    session.add(db_log)
    session.commit()
    session.refresh(db_log)
    return db_log


# ==========================================
# CONTACT ENDPOINTS (SUPPLIER & CUSTOMER)
# ==========================================

@router.get("/contacts", response_model=List[ContactResponse])
def get_contacts(
    session: SessionDep,
    current_user: CurrentUser,
    contact_type: Optional[str] = None,
    skip: int = 0,
    limit: int = 50
):
    """
    Get list of suppliers or customers for the active tenant.
    """
    query = session.query(Contact).filter(Contact.tenant_id == current_user.tenant_id)
    if contact_type:
        query = query.filter(Contact.contact_type == contact_type)
    return query.order_by(Contact.name).offset(skip).limit(limit).all()


@router.post("/contacts", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def create_contact(
    contact_in: ContactCreate,
    session: SessionDep,
    current_user: CurrentUser
):
    """
    Create a new customer or supplier contact for the active tenant.
    """
    if contact_in.contact_type not in ["customer", "supplier"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contact type must be either 'customer' or 'supplier'."
        )

    # Check duplicate contact name of same type for this tenant
    existing = session.query(Contact).filter(
        Contact.name == contact_in.name,
        Contact.contact_type == contact_in.contact_type,
        Contact.tenant_id == current_user.tenant_id
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Contact '{contact_in.name}' ({contact_in.contact_type}) already exists in your store."
        )

    db_contact = Contact(
        tenant_id=current_user.tenant_id,
        name=contact_in.name,
        contact_type=contact_in.contact_type,
        phone=contact_in.phone,
        current_balance=contact_in.current_balance
    )

    session.add(db_contact)
    session.commit()
    session.refresh(db_contact)
    return db_contact
