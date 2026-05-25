from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import SessionDep, check_role
from app.models.user import User, UserRole
from app.models.setting import AppSetting
from app.schemas.setting import AppSettingCreate, AppSettingResponse

router = APIRouter()

@router.get("", response_model=List[AppSettingResponse])
def get_tenant_settings(db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))):
    """
    Mendapatkan seluruh konfigurasi pengaturan toko untuk tenant aktif.
    Akses: Tenant Admin, Tenant Manager, & SaaS Owner.
    """
    return db.query(AppSetting).filter(AppSetting.tenant_id == current_user.tenant_id).all()

@router.post("", response_model=AppSettingResponse)
def upsert_tenant_setting(setting_in: AppSettingCreate, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Membuat atau memperbarui (Upsert) pengaturan toko berdasarkan key tertentu untuk tenant aktif.
    Akses: Tenant Admin & SaaS Owner.
    """
    # Cari apakah key sudah diset untuk tenant ini
    setting = db.query(AppSetting).filter(
        AppSetting.tenant_id == current_user.tenant_id,
        AppSetting.key == setting_in.key
    ).first()

    if setting:
        # Update nilai yang ada
        setting.value = setting_in.value
        if setting_in.description:
            setting.description = setting_in.description
    else:
        # Buat baru
        setting = AppSetting(
            tenant_id=current_user.tenant_id,
            key=setting_in.key,
            value=setting_in.value,
            description=setting_in.description
        )
        db.add(setting)

    db.commit()
    db.refresh(setting)
    return setting

@router.get("/{key}", response_model=AppSettingResponse)
def get_tenant_setting_by_key(key: str, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))):
    """
    Mendapatkan nilai pengaturan toko secara spesifik berdasarkan Key untuk tenant aktif.
    Akses: Tenant Admin, Tenant Manager, & SaaS Owner.
    """
    setting = db.query(AppSetting).filter(
        AppSetting.tenant_id == current_user.tenant_id,
        AppSetting.key == key
    ).first()

    if not setting:
        # Jika belum ada di tenant, coba cari global (tenant_id == NULL) sebagai fallback default
        global_setting = db.query(AppSetting).filter(
            AppSetting.tenant_id.is_(None),
            AppSetting.key == key
        ).first()
        
        if not global_setting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pengaturan dengan kunci '{key}' tidak ditemukan."
            )
        return global_setting

    return setting
