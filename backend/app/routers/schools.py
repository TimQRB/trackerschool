from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Role, School, User
from ..schemas import SchoolCreate, SchoolOut
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


@router.delete("/{school_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_school(
    school_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    school = db.get(School, school_id)
    if not school:
        raise HTTPException(status_code=404, detail="Школа не найдена")
    db.delete(school)
    db.commit()
    return None