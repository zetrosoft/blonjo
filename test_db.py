from app.db.session import SessionLocal
from app.models.inventory import TenantPricingRule

db = SessionLocal()
rule = db.query(TenantPricingRule).first()
if rule:
    print("Rule ID:", rule.id)
    print("Rule Payload Type:", type(rule.rule_payload))
    print("Rule Payload:", rule.rule_payload)
else:
    print("No rules found")
