from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from app.api.deps import SessionDep, check_role
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserUpdate, UserResponse
from app.core.security import get_password_hash

router = APIRouter()

@router.get("", response_model=List[UserResponse])
def list_tenant_users(db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MANAGER]))):
    """
    Mendapatkan daftar seluruh karyawan di tenant aktif.
    Akses: Tenant Admin, Tenant Manager, & SaaS Owner.
    """
    return db.query(User).filter(User.tenant_id == current_user.tenant_id).all()

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_tenant_user(user_in: UserCreate, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Mendaftarkan karyawan baru pada tenant aktif saat ini.
    Akses: Tenant Admin & SaaS Owner.
    """
    # Cek apakah email sudah terdaftar di sistem
    existing = db.query(User).filter(User.email == user_in.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email sudah terdaftar di sistem."
        )

    # Buat user baru
    new_user = User(
        email=user_in.email,
        hashed_password=get_password_hash(user_in.password),
        full_name=user_in.full_name,
        role=user_in.role,
        is_active=True,
        tenant_id=current_user.tenant_id,
        preferred_language=user_in.preferred_language
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.put("/{user_id}", response_model=UserResponse)
def update_tenant_user(user_id: int, user_in: UserUpdate, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Memperbarui detail profil, role, status aktif, atau password karyawan di tenant aktif.
    Akses: Tenant Admin & SaaS Owner.
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == current_user.tenant_id
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Karyawan tidak ditemukan di toko Anda."
        )

    # Larang admin menonaktifkan dirinya sendiri
    if user.id == current_user.id and user_in.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anda tidak dapat menonaktifkan akun Anda sendiri."
        )

    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.role is not None:
        user.role = user_in.role
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
    if user_in.preferred_language is not None:
        user.preferred_language = user_in.preferred_language
    if user_in.password is not None and user_in.password.strip() != "":
        user.hashed_password = get_password_hash(user_in.password)

    db.commit()
    db.refresh(user)
    return user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant_user(user_id: int, db: SessionDep, current_user: User = Depends(check_role([UserRole.ADMIN]))):
    """
    Menghapus akun karyawan dari tenant aktif.
    Akses: Tenant Admin & SaaS Owner.
    """
    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == current_user.tenant_id
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Karyawan tidak ditemukan di toko Anda."
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Anda tidak dapat menghapus akun Anda sendiri."
        )

    db.delete(user)
    db.commit()
    return None
