from app.core.database import SessionLocal
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.permission import Permission
from app.models.accounting import Account, AccountType, JournalEntry, Transaction
from app.models.role import Role
from app.models.setting import AppSetting
from app.models.inventory import Product, Contact, InventoryLog
from app.models.ocr import OCRTask
from decimal import Decimal

PRODUCTS_DATA = []

CONTACTS_DATA = []

def seed_master_data():
    db = SessionLocal()
    try:
        # Seeding Products
        product_count = 0
        for prod in PRODUCTS_DATA:
            existing = db.query(Product).filter(Product.tenant_id == 1, Product.sku == prod["sku"]).first()
            if not existing:
                new_prod = Product(
                    tenant_id=1,
                    sku=prod["sku"],
                    name=prod["name"],
                    unit=prod["unit"],
                    current_stock=prod["current_stock"],
                    min_stock_level=prod["min_stock_level"]
                )
                db.add(new_prod)
                product_count += 1
        
        # Seeding Contacts
        contact_count = 0
        for cont in CONTACTS_DATA:
            existing = db.query(Contact).filter(
                Contact.tenant_id == 1, 
                Contact.name == cont["name"], 
                Contact.contact_type == cont["contact_type"]
            ).first()
            if not existing:
                new_cont = Contact(
                    tenant_id=1,
                    name=cont["name"],
                    contact_type=cont["contact_type"],
                    phone=cont["phone"],
                    current_balance=cont["current_balance"]
                )
                db.add(new_cont)
                contact_count += 1
                
        db.commit()
        print(f"Seeding selesai! Menambahkan {product_count} produk baru dan {contact_count} kontak baru ke database.")
    except Exception as e:
        db.rollback()
        print(f"Terjadi kesalahan saat seeding: {str(e)}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_master_data()
