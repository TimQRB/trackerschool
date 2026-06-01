from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Role, User
from ..schemas import UserCreate, UserOut
from ..security import hash_password, require_roles


router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    if current_user.role == Role.SCHOOL.value:
        return db.execute(select(User).where(User.role == Role.PARENT.value)).scalars().all()
    
    return db.execute(select(User)).scalars().all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    if payload.role not in {r.value for r in Role}:
        raise HTTPException(status_code=400, detail="Недопустимая роль")
    if db.execute(select(User).where(User.email == payload.email)).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже существует")
    if payload.role == Role.SCHOOL.value:
        if not payload.school_id:
            raise HTTPException(
                status_code=400, 
                detail="Для пользователя с ролью 'school' необходимо указать school_id"
            )
        from ..models import School
        if not db.get(School, payload.school_id):
            raise HTTPException(status_code=400, detail="Указанный school_id не существует")
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=payload.role,
        school_id=payload.school_id if payload.role == Role.SCHOOL.value else None
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
