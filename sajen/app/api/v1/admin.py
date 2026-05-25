from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import SessionDep, require_saas_owner
from app.models.tenant import Tenant
from app.models.accounting import Account
from app.schemas.tenant import TenantCreate, TenantResponse

router = APIRouter()

@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(tenant_in: TenantCreate, db: SessionDep, current_user = Depends(require_saas_owner)):
    """
    Mendaftarkan tenant baru dan secara otomatis menyalin 22 COA template standar PSAK EMKM dari Tenant 1.
    Hanya dapat diakses oleh SaaS Owner.
    """
    # Periksa apakah subdomain sudah digunakan
    if tenant_in.subdomain:
        existing = db.query(Tenant).filter(Tenant.subdomain == tenant_in.subdomain).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Subdomain '{tenant_in.subdomain}' sudah digunakan oleh tenant lain."
            )
            
    # 1. Simpan Tenant baru
    new_tenant = Tenant(
        name=tenant_in.name,
        subdomain=tenant_in.subdomain,
        status=tenant_in.status,
        ocr_quota_monthly=tenant_in.ocr_quota_monthly
    )
    db.add(new_tenant)
    db.commit()
    db.refresh(new_tenant)
    
    # 2. Salin COA template PSAK dari Tenant 1 ke Tenant baru
    template_accounts = db.query(Account).filter(Account.tenant_id == 1).all()
    
    # Simpan mapping id lama ke instansi akun baru
    old_to_new_accounts = {}
    
    for old_acc in template_accounts:
        new_acc = Account(
            tenant_id=new_tenant.id,
            code=old_acc.code,
            name=old_acc.name,
            account_type=old_acc.account_type,
            is_active=old_acc.is_active
        )
        db.add(new_acc)
        old_to_new_accounts[old_acc.id] = new_acc
        
    db.commit() # Commit agar new_acc mendapat ID baru
    
    # 3. Sinkronisasikan parent_id (hirarki COA)
    for old_id, new_acc in old_to_new_accounts.items():
        old_acc = next((x for x in template_accounts if x.id == old_id), None)
        if old_acc and old_acc.parent_id is not None:
            # Cari akun baru yang memetakan parent_id lama
            new_parent = old_to_new_accounts.get(old_acc.parent_id)
            if new_parent:
                new_acc.parent_id = new_parent.id
                
    db.commit() # Commit pembaruan parent_id
    
    return new_tenant

@router.get("", response_model=List[TenantResponse])
def get_tenants(db: SessionDep, current_user = Depends(require_saas_owner)):
    """
    Mendapatkan seluruh daftar tenant di sistem.
    Hanya dapat diakses oleh SaaS Owner.
    """
    return db.query(Tenant).all()
