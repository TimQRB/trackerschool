"""Attendance module for school role.

Auto-tracking: when a student enters/exits a school-zone geofence, the system
automatically creates/updates attendance_logs. Manual marking is also available.
"""
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AttendanceLog, EventType, Role, Student, User
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/api/attendance", tags=["attendance"])


class AttendanceOut(BaseModel):
    student_id: int
    full_name: str
    class_name: str
    date: str
    enter_time: str | None
    exit_time: str | None
    status: str

    class Config:
        from_attributes = True


class MarkAttendanceRequest(BaseModel):
    student_id: int
    date: str  # YYYY-MM-DD
    status: str = "present"  # present | absent | late
    enter_time: str | None = None  # HH:MM
    exit_time: str | None = None


def parse_date(d: str) -> date:
    try:
        return date.fromisoformat(d)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты, используйте YYYY-MM-DD")


@router.get("/class", response_model=list[AttendanceOut])
def get_class_attendance(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    class_name: str = Query(default="", description="Фильтр по классу, напр. 5А"),
    date_str: str = Query(default="", alias="date", description="Дата YYYY-MM-DD, по умолчанию сегодня"),
):
    target_date = parse_date(date_str) if date_str else date.today()

    q = select(Student)
    if user.role == Role.PARENT.value:
        q = q.where(Student.parent_id == user.id)
    if class_name:
        q = q.where(Student.class_name == class_name)
    students = db.execute(q).scalars().all()

    result = []
    for s in students:
        log = db.execute(
            select(AttendanceLog).where(
                AttendanceLog.student_id == s.id,
                AttendanceLog.date == target_date,
            )
        ).scalar_one_or_none()

        result.append(AttendanceOut(
            student_id=s.id,
            full_name=s.full_name,
            class_name=s.class_name,
            date=target_date.isoformat(),
            enter_time=log.enter_time.isoformat() if log and log.enter_time else None,
            exit_time=log.exit_time.isoformat() if log and log.exit_time else None,
            status=log.status if log else "unknown",
        ))

    return result


@router.post("/mark")
def mark_attendance(
    payload: MarkAttendanceRequest,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.SCHOOL.value, Role.ADMIN.value))],
):
    target_date = parse_date(payload.date)

    student = db.get(Student, payload.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")

    log = db.execute(
        select(AttendanceLog).where(
            AttendanceLog.student_id == payload.student_id,
            AttendanceLog.date == target_date,
        )
    ).scalar_one_or_none()

    if log is None:
        log = AttendanceLog(
            student_id=payload.student_id,
            date=target_date,
        )
        db.add(log)

    log.status = payload.status

    if payload.enter_time:
        try:
            h, m = payload.enter_time.split(":")
            log.enter_time = datetime(
                target_date.year, target_date.month, target_date.day,
                int(h), int(m), tzinfo=timezone.utc,
            )
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Неверный формат enter_time, используйте HH:MM")

    if payload.exit_time:
        try:
            h, m = payload.exit_time.split(":")
            log.exit_time = datetime(
                target_date.year, target_date.month, target_date.day,
                int(h), int(m), tzinfo=timezone.utc,
            )
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="Неверный формат exit_time, используйте HH:MM")

    db.commit()
    return {"ok": True}
