from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Role, Student, User
from ..schemas import DeviceOut, StudentCreate, StudentOut
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/api/students", tags=["students"])


def _to_out(s: Student) -> StudentOut:
    return StudentOut(
        id=s.id,
        full_name=s.full_name,
        class_name=s.class_name,
        parent_id=s.parent_id,
        device=DeviceOut.model_validate(s.device) if s.device else None,
    )


@router.get("", response_model=list[StudentOut])
def list_students(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    q = select(Student).options(selectinload(Student.device))
    if user.role == Role.PARENT.value:
        q = q.where(Student.parent_id == user.id)
    students = db.execute(q).scalars().all()
    return [_to_out(s) for s in students]


@router.post("", response_model=StudentOut, status_code=201)
def create_student(
    payload: StudentCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    if payload.parent_id is not None:
        parent = db.get(User, payload.parent_id)
        if not parent or parent.role != Role.PARENT.value:
            raise HTTPException(status_code=400, detail="parent_id должен указывать на родителя")
    student = Student(
        full_name=payload.full_name,
        class_name=payload.class_name,
        parent_id=payload.parent_id,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return _to_out(student)
