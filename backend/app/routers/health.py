"""Health data endpoints: steps, heart rate, SpO2."""
from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device, HealthRecord, Role, Student, User
from ..security import get_current_user


router = APIRouter(prefix="/api", tags=["health"])


class HealthOut(BaseModel):
    id: int
    device_id: int
    heart_rate: int | None
    spo2: float | None
    steps: int | None
    recorded_at: str

    class Config:
        from_attributes = True


@router.get("/students/{student_id}/health", response_model=list[HealthOut])
def get_health(
    student_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    date_str: str = Query(default="", alias="date", description="Дата YYYY-MM-DD, по умолчанию сегодня"),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    if user.role == Role.PARENT.value and student.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not student.device:
        return []

    target_date = date.today()
    if date_str:
        try:
            target_date = date.fromisoformat(date_str)
        except ValueError:
            raise HTTPException(status_code=400, detail="Неверный формат даты")

    start = datetime(target_date.year, target_date.month, target_date.day, tzinfo=timezone.utc)
    end = datetime(target_date.year, target_date.month, target_date.day, 23, 59, 59, tzinfo=timezone.utc)

    records = db.execute(
        select(HealthRecord)
        .where(HealthRecord.device_id == student.device.id)
        .where(HealthRecord.recorded_at >= start)
        .where(HealthRecord.recorded_at <= end)
        .order_by(HealthRecord.recorded_at.asc())
    ).scalars().all()

    return records
