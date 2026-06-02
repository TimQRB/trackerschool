from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy import select, delete
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Role, User, School
from ..schemas import UserCreate, UserOut, UserUpdate
from ..security import hash_password, require_roles
from ..mail_service import send_onboarding_email
from sqlalchemy.exc import IntegrityError



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
    background_tasks: BackgroundTasks,
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
        if not db.get(School, payload.school_id):
            raise HTTPException(status_code=400, detail="Указанный school_id не существует")

    # Сохраняем "чистый" пароль для отправки в письме, прежде чем захешировать
    raw_password = payload.password 

    user = User(
        email=payload.email,
        password_hash=hash_password(raw_password),
        full_name=payload.full_name,
        role=payload.role,
        school_id=payload.school_id if payload.role == Role.SCHOOL.value else None,
        must_change_password=True,
        is_onboarded=False
    )
    
    db.add(user)
    db.commit()
    db.refresh(user)

    allowed_roles_for_email = {Role.PARENT.value, Role.SCHOOL.value, Role.ADMIN.value}
    
    if user.role in allowed_roles_for_email:
        background_tasks.add_task(send_onboarding_email, user.email, raw_password)

    return user

@router.patch("/{user_id}", response_model=UserOut)
def patch_user(
    user_id: int,
    payload: UserUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    update_data = payload.model_dump(exclude_unset=True)
    
    if "password" in update_data:
        target_user.password_hash = hash_password(update_data.pop("password"))
    
    for key, value in update_data.items():
        setattr(target_user, key, value)

    try:
        db.commit()
        db.refresh(target_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Ошибка обновления: возможно email уже занят")
    
    return target_user

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Нельзя удалить самого себя")
        
    target_user = db.get(User, user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    
    db.delete(target_user)
    db.commit()
    return None

@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_users(
    payload: list[int],
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Список ID для удаления пуст"
        )
    
    ids_to_delete = [i for i in payload if i != admin.id]
    
    if not ids_to_delete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Невозможно удалить выбранных пользователей (вы выбрали только себя)"
        )

    statement = delete(User).where(User.id.in_(ids_to_delete))
    result = db.execute(statement)
    db.commit()
    
    return {
        "status": "success",
        "message": f"Успешно удалено пользователей: {result.rowcount}"
    }