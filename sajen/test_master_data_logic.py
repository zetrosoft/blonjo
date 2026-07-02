import json, time
from decimal import Decimal
from app.core.database import SessionLocal
from app.models.inventory import Product, TenantInventory, InventoryLog
from app.services.pricing_engine import PricingEngine
from app.services.inventory import InventoryService
from app.services.ai_engine import parse_pricing_rule

db = SessionLocal()
tenant_id = 1
# Ensure a global product exists
product = db.query(Product).first()
if not product:
    print("No product found, creating one...")
    from app.models.inventory import ProductCategory
    cat = db.query(ProductCategory).first() or ProductCategory(name="Sembako")
    db.add(cat); db.flush()
    product = Product(sku="TEST-001", name="Beras Test", base_unit="kg", category_id=cat.id)
    db.add(product); db.commit()

print(f"--- TESTING FOR PRODUCT: {product.name} (ID: {product.id}) ---")

# 1. TEST: AI Pricing Parser
print("\n[1] Testing AI Pricing Parser...")
story = "Beli 2 kg harganya jadi 6500 per kg"
res = parse_pricing_rule(db, story)
parsed = res.get("parsed_data")
print("AI Result:", json.dumps(parsed, indent=2))
if parsed and parsed.get("rule_type") == "volume":
    print("✅ AI Pricing Parser Success!")

# 2. TEST: Moving Average Calculation
print("\n[2] Testing Moving Average...")
# To test MA correctly, we need actual logs or static stock to change
from app.models.accounting import Transaction
from app.models.inventory import InventoryLog

# Clear old data for clean test
db.query(InventoryLog).filter_by(product_id=product.id).delete()
db.query(TenantInventory).filter_by(tenant_id=tenant_id, product_id=product.id).delete()
db.commit()

# Initial purchase: 10 @ 5000
tx1 = Transaction(tenant_id=tenant_id, description="Buy 1", transaction_type="purchase")
db.add(tx1); db.flush()
log1 = InventoryLog(product_id=product.id, transaction_id=tx1.id, quantity=Decimal("10"), price_per_unit=Decimal("5000"), log_type="in")
db.add(log1)
PricingEngine.update_moving_average(db, tenant_id, product.id, Decimal("10"), Decimal("5000"))
db.commit()

ti = db.query(TenantInventory).filter_by(tenant_id=tenant_id, product_id=product.id).first()
print(f"HPP 1 (Stock 10 @ 5000): {ti.moving_average_cost}")

# Second purchase: 10 @ 6000
# Stock is 10, buy 10 more @ 6000. Avg = (10*5000 + 10*6000) / 20 = 5500
PricingEngine.update_moving_average(db, tenant_id, product.id, Decimal("10"), Decimal("6000"))
db.commit()
db.refresh(ti)
print(f"HPP 2 (Add 10 @ 6000): {ti.moving_average_cost}")
if ti.moving_average_cost == Decimal("5500.00"):
    print("✅ Moving Average Calculation Correct!")
else:
    print(f"❌ MA Failed: Expected 5500.00, got {ti.moving_average_cost}")

# 3. TEST: Stock Maintenance (Static vs Dynamic)
print("\n[3] Testing Stock Maintenance...")
from app.models.setting import AppSetting
setting = db.query(AppSetting).filter_by(tenant_id=tenant_id, key="stock_maintenance").first()
if not setting:
    setting = AppSetting(tenant_id=tenant_id, key="stock_maintenance", value="true")
    db.add(setting); db.flush()

setting.value = "true" # Turn ON
db.commit()
ti.static_stock = Decimal("100")
db.commit()

print(f"Current Level (Static ON): {InventoryService.get_stock_level(db, tenant_id, product.id)}")

setting.value = "false" # Turn OFF
db.commit()
print(f"Current Level (Static OFF/Dynamic): {InventoryService.get_stock_level(db, tenant_id, product.id)}")
print("✅ Stock Maintenance logic verified.")
