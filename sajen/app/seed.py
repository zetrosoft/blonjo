from app.core.database import SessionLocal
from app.models.tenant import Tenant
from app.models.user import User, UserRole
from app.models.permission import Permission
from app.models.accounting import Account, AccountType
from app.models.role import Role
from app.models.setting import AppSetting
from app.models.inventory import Product, Contact
from app.models.ocr import OCRTask
from app.core.security import get_password_hash

MASTER_PERMISSIONS = [
    {"name": "create:product", "description": "Menambah produk baru ke inventaris"},
    {"name": "edit:product", "description": "Mengubah data produk inventaris"},
    {"name": "delete:product", "description": "Menghapus produk dari inventaris"},
    {"name": "view:product", "description": "Melihat daftar produk inventaris"},
    {"name": "manage:users", "description": "Mengelola akun user dan role kustom tenant"},
    {"name": "manage:billing", "description": "Mengelola langganan dan billing tenant"},
    {"name": "view:financial_report", "description": "Melihat laporan keuangan dan jurnal akuntansi"},
    {"name": "edit:store_settings", "description": "Mengubah setelan profil toko dan printer struk"}
]

COA_TEMPLATES = [
    # ASET (ASSET)
    {"code": "1-1000", "name": "Kas Utama", "account_type": AccountType.ASSET},
    {"code": "1-1100", "name": "Kas Kecil", "account_type": AccountType.ASSET},
    {"code": "1-1200", "name": "Bank Mandiri", "account_type": AccountType.ASSET},
    {"code": "1-2000", "name": "Piutang Usaha", "account_type": AccountType.ASSET},
    {"code": "1-3000", "name": "Persediaan Barang Dagang", "account_type": AccountType.ASSET},
    {"code": "1-4000", "name": "Perlengkapan Kantor", "account_type": AccountType.ASSET},
    {"code": "1-5000", "name": "Aset Tetap - Peralatan", "account_type": AccountType.ASSET},
    {"code": "1-5100", "name": "Akumulasi Penyusutan Aset Tetap", "account_type": AccountType.ASSET},

    # KEWAJIBAN / LIABILITAS (LIABILITY)
    {"code": "2-1000", "name": "Utang Usaha", "account_type": AccountType.LIABILITY},
    {"code": "2-2000", "name": "Utang Bank Jangka Panjang", "account_type": AccountType.LIABILITY},

    # EKUITAS (EQUITY)
    {"code": "3-1000", "name": "Modal Pemilik", "account_type": AccountType.EQUITY},
    {"code": "3-2000", "name": "Laba Ditahan", "account_type": AccountType.EQUITY},
    {"code": "3-3000", "name": "Laba Tahun Berjalan", "account_type": AccountType.EQUITY},

    # PENDAPATAN (REVENUE)
    {"code": "4-1000", "name": "Pendapatan Penjualan", "account_type": AccountType.REVENUE},
    {"code": "4-2000", "name": "Pendapatan Jasa", "account_type": AccountType.REVENUE},
    {"code": "4-9000", "name": "Pendapatan Lain-lain", "account_type": AccountType.REVENUE},

    # BEBAN (EXPENSE)
    {"code": "5-1000", "name": "Harga Pokok Penjualan (HPP)", "account_type": AccountType.EXPENSE},
    {"code": "5-2000", "name": "Beban Gaji & Upah", "account_type": AccountType.EXPENSE},
    {"code": "5-3000", "name": "Beban Sewa", "account_type": AccountType.EXPENSE},
    {"code": "5-4000", "name": "Beban Listrik, Air & Internet", "account_type": AccountType.EXPENSE},
    {"code": "5-5000", "name": "Beban Penyusutan Aset Tetap", "account_type": AccountType.EXPENSE},
    {"code": "5-9000", "name": "Beban Operasional Lainnya", "account_type": AccountType.EXPENSE}
]

def seed_database():
    db = SessionLocal()
    
    # 1. Seed Default Tenant
    default_tenant = db.query(Tenant).filter(Tenant.id == 1).first()
    if not default_tenant:
        default_tenant = Tenant(
            id=1,
            name="Toko Default Blonjo",
            subdomain="default",
            status="active",
            ocr_quota_monthly=1000
        )
        db.add(default_tenant)
        db.commit()
        db.refresh(default_tenant)
        print("Default Tenant (ID: 1) created successfully!")
    else:
        print("Default Tenant already exists.")

    # 2. Seed Master Permissions
    for perm in MASTER_PERMISSIONS:
        existing_perm = db.query(Permission).filter(Permission.name == perm["name"]).first()
        if not existing_perm:
            new_perm = Permission(
                name=perm["name"],
                description=perm["description"],
                is_system_only=False
            )
            db.add(new_perm)
            print(f"Permission '{perm['name']}' seeded.")
    db.commit()

    # 3. Seed Super Admin User (SaaS Owner)
    admin_email = "admin@blonjo.com"
    existing_admin = db.query(User).filter(User.email == admin_email).first()
    if not existing_admin:
        new_admin = User(
            email=admin_email,
            hashed_password=get_password_hash("blonjo123!"),
            full_name="Super Admin Blonjo",
            role=UserRole.ADMIN,
            is_active=True,
            is_superuser=True, # Set as SaaS Owner / Superuser
            tenant_id=1,       # Associated with Default Tenant
            preferred_language="ID"
        )
        db.add(new_admin)
        db.commit()
        print("Super Admin user seeded successfully!")
    else:
        # Update existing admin to be superuser and associated with tenant 1
        existing_admin.is_superuser = True
        existing_admin.tenant_id = 1
        db.commit()
        print("Super Admin user updated to Superuser and Tenant 1.")

    # 4. Seed Standard PSAK / SAK EMKM COA (Chart of Accounts)
    coa_seeded_count = 0
    for coa in COA_TEMPLATES:
        existing_coa = db.query(Account).filter(
            Account.tenant_id == 1,
            Account.code == coa["code"]
        ).first()
        if not existing_coa:
            new_account = Account(
                tenant_id=1,
                code=coa["code"],
                name=coa["name"],
                account_type=coa["account_type"],
                is_active=True
            )
            db.add(new_account)
            coa_seeded_count += 1
    
    if coa_seeded_count > 0:
        db.commit()
        print(f"Seeded {coa_seeded_count} COA EMKM accounts successfully for Tenant 1!")
    else:
        print("COA EMKM accounts already exist for Tenant 1.")

    db.close()

if __name__ == "__main__":
    seed_database()
