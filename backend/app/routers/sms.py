"""SMS log read endpoint. SMS records are ingested from the device via the
TCP gateway (protocol 0x1016) and stored in `sms_logs`."""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Role, SmsLog, Student, User
from ..security import get_current_user


router = APIRouter(prefix="/api", tags=["sms"])


class SmsOut(BaseModel):
    id: int
    device_id: int
    number: str
    content: str
    sent_at: datetime

    class Config:
        from_attributes = True


@router.get("/students/{student_id}/sms", response_model=list[SmsOut])
def list_sms(
    student_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    limit: int = Query(default=50, ge=1, le=500),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    if user.role == Role.PARENT.value and student.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not student.device:
        return []
    return db.execute(
        select(SmsLog)
        .where(SmsLog.device_id == student.device.id)
        .order_by(SmsLog.sent_at.desc())
        .limit(limit)
    ).scalars().all()
