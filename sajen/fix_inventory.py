from app.db.session import SessionLocal
from app.db.models import TenantPricingRule, TenantInventory, TenantProductPrice

db = SessionLocal()
try:
    rules = db.query(TenantPricingRule).filter(TenantPricingRule.product_id.isnot(None)).all()
    count = 0
    for rule in rules:
        ti = db.query(TenantInventory).filter(
            TenantInventory.tenant_id == rule.tenant_id,
            TenantInventory.product_id == rule.product_id
        ).first()
        if not ti:
            new_ti = TenantInventory(tenant_id=rule.tenant_id, product_id=rule.product_id)
            new_tp = TenantProductPrice(tenant_id=rule.tenant_id, product_id=rule.product_id)
            db.add(new_ti)
            db.add(new_tp)
            count += 1
    db.commit()
    print(f"Fixed {count} rules")
finally:
    db.close()
