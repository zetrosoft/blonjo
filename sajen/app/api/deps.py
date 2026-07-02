from typing import Generator, Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.config import settings
from app.models.user import User, UserRole
from app.schemas.token import TokenPayload

from app.core import context

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.API_V1_STR}/auth/login")

def get_db() -> Generator:
    """Dependency to provide a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

SessionDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str, Depends(oauth2_scheme)]

def get_current_user(session: SessionDep, token: TokenDep) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        token_data = TokenPayload(**payload)
        if token_data.sub is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    user = session.query(User).filter(User.id == int(token_data.sub)).first()
    if not user:
        raise credentials_exception
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    
    # Set Implicit Global Context
    context.set_tenant_context(user.tenant_id)
    context.set_user_context(user.id)
    
    return user

CurrentUser = Annotated[User, Depends(get_current_user)]

def get_current_active_admin(current_user: CurrentUser) -> User:
    if current_user.role != UserRole.ADMIN and not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="The user doesn't have enough privileges"
        )
    return current_user

def check_role(allowed_roles: list[UserRole]):
    """
    Dependency to dynamically check if the authenticated user has one of the allowed roles.
    """
    def role_checker(current_user: CurrentUser) -> User:
        if current_user.is_superuser:
            return current_user
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Anda tidak memiliki hak akses yang cukup untuk melakukan tindakan ini."
            )
        return current_user
    return role_checker

def require_saas_owner(current_user: CurrentUser) -> User:
    """
    Dependency to ensure the current authenticated user is the system-wide SaaS Superuser (Owner).
    """
    if not current_user.is_superuser:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tindakan ini hanya dapat dilakukan oleh SaaS Owner."
        )
    return current_user

class PermissionChecker:
    """
    FastAPI dependency to dynamically check for a specific permission in the user's role set.
    Allows SaaS Owner bypass automatically.
    """
    def __init__(self, required_permission: str):
        self.required_permission = required_permission

    def __call__(self, current_user: CurrentUser) -> User:
        if current_user.is_superuser:
            return current_user
            
        # Extract all permission names from all roles assigned to this user
        user_permissions = {p.name for role in current_user.roles for p in role.permissions}
        
        if self.required_permission not in user_permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Anda tidak memiliki izin akses yang diperlukan: {self.required_permission}"
            )
        return current_user


