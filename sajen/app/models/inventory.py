from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, UniqueConstraint
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.models.base import Base

class Product(Base):
    """
    Item master data with vector embedding for semantic search.
    Supports multi-tenancy.
    """
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    sku = Column(String(50), index=True, nullable=False) # Removed global unique
    name = Column(String(100), nullable=False, index=True)
    unit = Column(String(20), default="pcs", nullable=False)
    current_stock = Column(Numeric(15, 2), default=0.00, nullable=False)
    min_stock_level = Column(Numeric(15, 2), default=0.00, nullable=False)
    
    # Embedding for pgvector semantic search (768 dimensions e.g. for nomic-embed-text)
    embedding = Column(Vector(768), nullable=True)

    tenant = relationship("Tenant")
    inventory_logs = relationship("InventoryLog", back_populates="product", cascade="all, delete-orphan")

    # Prevent duplicate SKU within the same tenant
    __table_args__ = (
        UniqueConstraint("tenant_id", "sku", name="uq_product_tenant_sku"),
    )


class InventoryLog(Base):
    """
    Tracking stock movement & COGS (HPP)
    """
    __tablename__ = "inventory_logs"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True, index=True)
    quantity = Column(Numeric(15, 2), nullable=False)
    price_per_unit = Column(Numeric(15, 2), nullable=False)
    
    # "in" (pembelian/retur masuk) or "out" (penjualan/penyesuaian keluar)
    log_type = Column(String(10), nullable=False)

    product = relationship("Product", back_populates="inventory_logs")
    transaction = relationship("Transaction")


class Contact(Base):
    """
    Customers & Suppliers
    Supports multi-tenancy.
    """
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    contact_type = Column(String(20), nullable=False) # "customer" or "supplier"
    phone = Column(String(20), nullable=True)
    
    # Store current balance (receivables for customer, payables for supplier)
    current_balance = Column(Numeric(15, 2), default=0.00, nullable=False)

    tenant = relationship("Tenant")

    # Prevent duplicate contact names of the same type within the same tenant
    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "contact_type", name="uq_contact_tenant_name_type"),
    )
