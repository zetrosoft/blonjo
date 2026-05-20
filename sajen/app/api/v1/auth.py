from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import Annotated
from app.api.deps import SessionDep, CurrentUser
from app.schemas.token import Token
from app.schemas.user import UserResponse
from app.models.user import User
from app.core.security import verify_password, create_access_token
from app.core.config import settings
from datetime import timedelta

router = APIRouter()

@router.post("/login", response_model=Token)
def login_access_token(
    session: SessionDep, form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
) -> Token:
    """
    OAuth2 compatible token login, get an access token for future requests.
    """
    user = session.query(User).filter(User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    elif not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
        
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.id, expires_delta=access_token_expires
    )
    return Token(
        access_token=access_token,
        token_type="bearer",
        role=user.role,
        preferred_language=user.preferred_language
    )

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: CurrentUser) -> UserResponse:
    """
    Get current user information.
    """
    return current_user
