from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, Body
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from ..database import get_db
from ..models import Role, School, User
from ..schemas import SchoolCreate, SchoolOut, SchoolUpdate
from ..security import require_roles, get_current_user

router = APIRouter(prefix="/api/schools", tags=["schools"])

@router.get("", response_model=list[SchoolOut])
def list_schools(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    return db.execute(select(School)).scalars().all()


@router.post("", response_model=SchoolOut, status_code=201)
def create_school(
    payload: SchoolCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    existing = db.execute(select(School).where(School.name == payload.name)).scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=409, 
            detail="Школа с таким названием уже зарегистрирована"
        )
        
    school = School(name=payload.name, address=payload.address)
    db.add(school)
    db.commit()
    db.refresh(school)
    return school

@router.patch("/{school_id}", response_model=SchoolOut)
def patch_school(
    school_id: int,
    payload: SchoolUpdate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    school = db.get(School, school_id)
    if not school:
        raise HTTPException(status_code=404, detail="Школа не найдена")

    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(school, key, value)

    db.commit()
    db.refresh(school)
    return school

@router.delete("/{school_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_school(
    school_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    school = db.get(School, school_id)
    if not school:
        raise HTTPException(status_code=404, detail="Школа не найдена")
    
    try:
        db.delete(school)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Нельзя удалить школу, так как к ней привязаны ученики, геозоны или сотрудники. Сначала удалите или перенесите связанные данные."
        )
    return None

@router.post("/bulk-delete", status_code=status.HTTP_200_OK)
def bulk_delete_schools(
    payload: list[int],
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Список ID для удаления пуст"
        )
        
    statement = delete(School).where(School.id.in_(payload))
    result = db.execute(statement)
    db.commit()
    
    return {
        "status": "success",
        "message": f"Успешно удалено школ: {result.rowcount}"
    }