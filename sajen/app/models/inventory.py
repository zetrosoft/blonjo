from sqlalchemy import Column, Integer, String, ForeignKey, Numeric, UniqueConstraint, Boolean, JSON, Date
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.models.base import Base
from datetime import date

class ProductCategory(Base):
    """
    Global Product Categories (One Item Category to Many Items).
    No tenant_id as it is a global catalog.
    """
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True, index=True)
    description = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)

    products = relationship("Product", back_populates="category")

class Uom(Base):
    """
    Global Unit of Measure (UoM) Master Data.
    """
    __tablename__ = "uoms"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), nullable=False, unique=True, index=True)
    name = Column(String(100), nullable=False)
    category = Column(String(50), nullable=False, default="count") # 'weight', 'volume', 'count', 'length'
    description = Column(String(255), nullable=True)
    status = Column(String(20), nullable=False, default="active") # 'active', 'inactive'

class Product(Base):
    """
    Global Product Master Data (Identitas Murni).
    No tenant_id and no transactional values (stock/price).
    """
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), index=True, nullable=False, unique=True) # Global unique SKU
    name = Column(String(100), nullable=False, index=True)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=True)
    base_unit = Column(String(20), default="pcs", nullable=False)
    
    # Embedding for pgvector semantic search
    embedding = Column(Vector(3072), nullable=True)

    category = relationship("ProductCategory", back_populates="products")
    unit_conversions = relationship("ProductUnitConversion", back_populates="product", cascade="all, delete-orphan")
    inventory_logs = relationship("InventoryLog", back_populates="product", cascade="all, delete-orphan")
    tenant_inventories = relationship("TenantInventory", back_populates="product", cascade="all, delete-orphan")
    tenant_prices = relationship("TenantProductPrice", back_populates="product", cascade="all, delete-orphan")
    tenant_pricing_rules = relationship("TenantPricingRule", back_populates="product", cascade="all, delete-orphan")

class ProductUnitConversion(Base):
    """
    Global Unit Conversions per Product (e.g., 1 Box = 24 Pcs).
    """
    __tablename__ = "product_unit_conversions"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    unit_name = Column(String(20), nullable=False) # e.g., "Lusin"
    multiplier = Column(Numeric(15, 2), nullable=False) # e.g., 12.00

    product = relationship("Product", back_populates="unit_conversions")

class TenantInventory(Base):
    """
    Tenant-specific Inventory Data (Value & Stock Maintenance).
    """
    __tablename__ = "tenant_inventories"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    
    last_purchase_price = Column(Numeric(15, 2), default=0.00)
    moving_average_cost = Column(Numeric(15, 2), default=0.00)
    
    # Static stock column, used ONLY if Stock Maintenance is ON (Checked)
    static_stock = Column(Numeric(15, 2), default=0.00)

    # Material Control Parameters
    safety_stock = Column(Numeric(15, 2), default=0.00, server_default='0', nullable=False)
    reorder_point = Column(Numeric(15, 2), default=0.00, server_default='0', nullable=False)
    max_stock = Column(Numeric(15, 2), default=0.00, server_default='0', nullable=False)
    preferred_supplier_id = Column(Integer, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    shelf_location = Column(String(50), nullable=True)

    tenant = relationship("Tenant")
    product = relationship("Product", back_populates="tenant_inventories")
    preferred_supplier = relationship("Contact")

    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", name="uq_tenant_inventory_product"),
    )

class TenantProductPrice(Base):
    """
    Tenant-specific Basic Pricing Configuration.
    """
    __tablename__ = "tenant_product_prices"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # 'value' (Fixed Price) or 'margin' (% from HPP)
    pricing_method = Column(String(20), default="value", nullable=False)
    amount = Column(Numeric(15, 2), default=0.00, nullable=False)
    auto_adjusted = Column(Boolean, default=False, nullable=True)

    tenant = relationship("Tenant")
    product = relationship("Product", back_populates="tenant_prices")

    __table_args__ = (
        UniqueConstraint("tenant_id", "product_id", name="uq_tenant_price_product"),
    )

class TenantPricingRule(Base):
    """
    Tenant-specific AI-Parsed Dynamic Pricing Rules.
    """
    __tablename__ = "tenant_pricing_rules"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=True, index=True) # Can be null for bundles
    
    name = Column(String(100), nullable=True) # Human readable name from AI parse
    rule_type = Column(String(50), nullable=False) # 'discount', 'volume', 'bundle', 'formula'
    
    valid_from = Column(Date, default=date.today)
    valid_to = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    
    # JSONB Payload for storing the parsed logic
    rule_payload = Column(JSON, nullable=False)

    tenant = relationship("Tenant")
    product = relationship("Product", back_populates="tenant_pricing_rules")

class InventoryLog(Base):
    """
    Tracking stock movement & COGS (HPP)
    """
    __tablename__ = "inventory_logs"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, index=True)
    transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True, index=True)
    contact_id = Column(Integer, ForeignKey("contacts.id"), nullable=True, index=True)
    quantity = Column(Numeric(15, 2), nullable=False)
    price_per_unit = Column(Numeric(15, 2), nullable=False)
    
    log_type = Column(String(10), nullable=False)

    product = relationship("Product", back_populates="inventory_logs")
    transaction = relationship("Transaction", back_populates="inventory_logs")
    contact = relationship("Contact")

class Contact(Base):
    """
    Customers & Suppliers (Tenant-specific)
    """
    __tablename__ = "contacts"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    contact_type = Column(String(20), nullable=False) 
    phone = Column(String(20), nullable=True)
    address = Column(String(255), nullable=True)
    current_balance = Column(Numeric(15, 2), default=0.00, nullable=False)

    tenant = relationship("Tenant")

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", "contact_type", name="uq_contact_tenant_name_type"),
    )

class PurchasePlan(Base):
    """
    Purchase Planning / Auto-Replenishment Proposal for Purchasing Department.
    """
    __tablename__ = "purchase_plans"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(50), default="DRAFT", nullable=False) # 'DRAFT', 'APPROVED', 'COMPLETED'
    send_via_wa = Column(Boolean, default=False, nullable=False)
    send_via_email = Column(Boolean, default=False, nullable=False)
    total_amount = Column(Numeric(15, 2), default=0.00, nullable=False)
    planned_date = Column(Date, default=date.today, nullable=False)
    created_at = Column(Date, default=date.today, nullable=False)

    tenant = relationship("Tenant")
    items = relationship("PurchasePlanItem", back_populates="purchase_plan", cascade="all, delete-orphan")

class PurchasePlanItem(Base):
    """
    Detailed Items proposed inside a PurchasePlan.
    """
    __tablename__ = "purchase_plan_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_plan_id = Column(Integer, ForeignKey("purchase_plans.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    supplier_contact_id = Column(Integer, ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True)
    qty = Column(Numeric(15, 2), nullable=False)
    unit_price = Column(Numeric(15, 2), nullable=False)
    subtotal = Column(Numeric(15, 2), nullable=False)

    purchase_plan = relationship("PurchasePlan", back_populates="items")
    product = relationship("Product")
    supplier = relationship("Contact")

class StockDiscard(Base):
    """
    Tracking wasted, expired, or spoiled raw materials and finished goods.
    Triggers automated PSAK adjusting journal (Beban Kerusakan Persediaan).
    """
    __tablename__ = "stock_discards"

    id = Column(Integer, primary_key=True, index=True)
    tenant_id = Column(Integer, ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    qty = Column(Numeric(15, 2), nullable=False)
    reason = Column(String(50), nullable=False) # 'EXPIRED', 'DAMAGED', 'SPOILED'
    created_at = Column(Date, default=date.today, nullable=False)

    tenant = relationship("Tenant")
    product = relationship("Product")
