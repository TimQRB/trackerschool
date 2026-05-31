from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginRequest, TokenResponse, UserOut
from ..security import create_access_token, get_current_user, verify_password


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    token = create_access_token(user.id, user.role)
    return TokenResponse(
        access_token=token,
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
        school_id=user.school_id
    )

@router.post("/swagger-login", include_in_schema=False)
def swagger_login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: Annotated[Session, Depends(get_db)]
):
    user = db.execute(select(User).where(User.email == form_data.username)).scalar_one_or_none()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
        
    token = create_access_token(user.id, user.role)
    return {
        "access_token": token,
        "token_type": "bearer"
    }

@router.get("/me", response_model=UserOut)
def me(user: Annotated[User, Depends(get_current_user)]):
    return user
