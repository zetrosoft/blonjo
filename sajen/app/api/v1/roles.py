from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import SessionDep, check_role
from app.models.user import User, UserRole
from app.models.role import Role
from app.models.permission import Permission
from app.schemas.role import RoleCreate, RoleResponse, PermissionResponse

router = APIRouter()

@router.get("", response_model=List[RoleResponse])
def list_roles(db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Mendapatkan seluruh kustom role yang terdaftar di tenant aktif.
    Akses: Tenant Admin & SaaS Owner.
    """
    return db.query(Role).filter(Role.tenant_id == current_user.tenant_id).all()

@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
def create_role(role_in: RoleCreate, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Membuat role kustom baru untuk tenant aktif dan memetakan permissions terpilih.
    Akses: Tenant Admin & SaaS Owner.
    """
    # Cek apakah nama role sudah ada di tenant ini
    existing = db.query(Role).filter(
        Role.tenant_id == current_user.tenant_id,
        Role.name == role_in.name
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Role dengan nama '{role_in.name}' sudah ada di tenant ini."
        )

    # Dapatkan objek permission dari nama-namanya
    permissions = db.query(Permission).filter(Permission.name.in_(role_in.permissions)).all()
    if len(permissions) != len(role_in.permissions):
        # Cari mana yang tidak valid
        found_names = {p.name for p in permissions}
        invalid_names = set(role_in.permissions) - found_names
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Beberapa izin akses tidak valid: {', '.join(invalid_names)}"
        )

    # Buat role baru
    new_role = Role(
        tenant_id=current_user.tenant_id,
        name=role_in.name,
        permissions=permissions
    )
    db.add(new_role)
    db.commit()
    db.refresh(new_role)
    return new_role

@router.put("/{role_id}", response_model=RoleResponse)
def update_role(role_id: int, role_in: RoleCreate, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Memperbarui nama role kustom dan memetakan ulang permissions-nya di tenant aktif.
    Akses: Tenant Admin & SaaS Owner.
    """
    role = db.query(Role).filter(
        Role.id == role_id,
        Role.tenant_id == current_user.tenant_id
    ).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role tidak ditemukan di tenant Anda."
        )

    # Cek nama role baru (jika ganti nama)
    if role.name != role_in.name:
        existing = db.query(Role).filter(
            Role.tenant_id == current_user.tenant_id,
            Role.name == role_in.name
        ).first()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Role dengan nama '{role_in.name}' sudah terdaftar."
            )
        role.name = role_in.name

    # Dapatkan objek permission baru
    permissions = db.query(Permission).filter(Permission.name.in_(role_in.permissions)).all()
    if len(permissions) != len(role_in.permissions):
        found_names = {p.name for p in permissions}
        invalid_names = set(role_in.permissions) - found_names
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Beberapa izin akses tidak valid: {', '.join(invalid_names)}"
        )

    role.permissions = permissions
    db.commit()
    db.refresh(role)
    return role

@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Menghapus role kustom dari tenant aktif.
    Akses: Tenant Admin & SaaS Owner.
    """
    role = db.query(Role).filter(
        Role.id == role_id,
        Role.tenant_id == current_user.tenant_id
    ).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role tidak ditemukan di tenant Anda."
        )

    db.delete(role)
    db.commit()
    return None

@router.get("/permissions", response_model=List[PermissionResponse])
def list_permissions(db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))):
    """
    Mendapatkan daftar seluruh Master Permission yang tersedia untuk dikonfigurasi pada role tenant.
    Akses: Tenant Admin, Tenant Manager, & SaaS Owner.
    """
    # Tenant biasa hanya boleh melihat permission yang non-is_system_only
    if current_user.is_superuser:
        return db.query(Permission).all()
    return db.query(Permission).filter(Permission.is_system_only == False).all()
