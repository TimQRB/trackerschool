from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Event, Role, Student, User
from ..schemas import EventOut
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("", response_model=list[EventOut])
def list_events(
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    hours: int = Query(default=24, ge=1, le=168),
    only_unack: bool = False,
):
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    q = select(Event).where(Event.created_at >= since).order_by(Event.created_at.desc())
    if only_unack:
        q = q.where(Event.acknowledged.is_(False))
    if user.role == Role.PARENT.value:
        student_ids = [s.id for s in user.students]
        if not student_ids:
            return []
        q = q.where(Event.student_id.in_(student_ids))
    return db.execute(q).scalars().all()


@router.post("/{event_id}/ack", response_model=EventOut)
def ack_event(
    event_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.SCHOOL.value, Role.ADMIN.value))],
):
    evt = db.get(Event, event_id)
    if not evt:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    evt.acknowledged = True
    db.commit()
    db.refresh(evt)
    return evt
