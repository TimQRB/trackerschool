from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..bus import publish
from ..database import get_db
from ..geofence_service import check_transitions
from ..models import Device, Event, EventType, LocationPoint, Role, Severity, Student, User
from ..schemas import LocationIngest, LocationOut
from ..security import get_current_user


router = APIRouter(prefix="/api", tags=["locations"])


@router.post("/ingest/location", status_code=201)
def ingest(
    payload: LocationIngest,
    db: Annotated[Session, Depends(get_db)],
    x_api_key: Annotated[str | None, Header(alias="X-API-Key")] = None,
):
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Требуется X-API-Key")
    device = db.execute(select(Device).where(Device.api_key == x_api_key)).scalar_one_or_none()
    if not device or not device.is_active:
        raise HTTPException(status_code=401, detail="Устройство не зарегистрировано или отключено")
    if not device.student_id:
        raise HTTPException(status_code=400, detail="Устройство не привязано к ученику")

    student = db.get(Student, device.student_id)

    point = LocationPoint(
        device_id=device.id,
        lat=payload.lat,
        lon=payload.lon,
        accuracy=payload.accuracy,
        speed=payload.speed,
        battery=payload.battery,
    )
    db.add(point)

    device.last_seen_at = datetime.now(timezone.utc)
    if payload.battery is not None:
        device.last_battery = payload.battery

    new_events = check_transitions(db, device, student, payload.lat, payload.lon)

    if payload.battery is not None and payload.battery <= 15:
        # Don't spam: only fire low-battery if no recent low-battery event
        recent = db.execute(
            select(Event).where(
                Event.student_id == student.id,
                Event.event_type == EventType.LOW_BATTERY.value,
                Event.created_at > datetime.now(timezone.utc) - timedelta(hours=1),
            )
        ).first()
        if not recent:
            evt = Event(
                student_id=student.id,
                event_type=EventType.LOW_BATTERY.value,
                severity=Severity.WARNING.value,
                message=f"Низкий заряд устройства ученика {student.full_name}: {payload.battery}%",
                lat=payload.lat,
                lon=payload.lon,
            )
            db.add(evt)
            new_events.append(evt)

    if payload.sos:
        evt = Event(
            student_id=student.id,
            event_type=EventType.SOS.value,
            severity=Severity.CRITICAL.value,
            message=f"SOS! Ученик {student.full_name} нажал тревожную кнопку",
            lat=payload.lat,
            lon=payload.lon,
        )
        db.add(evt)
        new_events.append(evt)

    db.commit()
    db.refresh(point)

    publish({
        "type": "location",
        "payload": {
            "student_id": student.id,
            "student_name": student.full_name,
            "device_id": device.id,
            "lat": point.lat,
            "lon": point.lon,
            "battery": point.battery,
            "speed": point.speed,
            "recorded_at": point.recorded_at.isoformat(),
        },
    })

    for evt in new_events:
        publish({
            "type": "event",
            "payload": {
                "id": evt.id,
                "student_id": evt.student_id,
                "student_name": student.full_name,
                "event_type": evt.event_type,
                "severity": evt.severity,
                "message": evt.message,
                "lat": evt.lat,
                "lon": evt.lon,
                "created_at": evt.created_at.isoformat(),
            },
        })

    return {"ok": True, "events_created": len(new_events)}


@router.get("/students/{student_id}/track", response_model=list[LocationOut])
def get_track(
    student_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
    hours: int = Query(default=24, ge=1, le=168),
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    if user.role == Role.PARENT.value and student.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not student.device:
        return []
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    points = db.execute(
        select(LocationPoint)
        .where(LocationPoint.device_id == student.device.id)
        .where(LocationPoint.recorded_at >= since)
        .order_by(LocationPoint.recorded_at.asc())
    ).scalars().all()
    return points


@router.get("/students/{student_id}/last-location", response_model=LocationOut | None)
def last_location(
    student_id: int,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(get_current_user)],
):
    student = db.get(Student, student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Ученик не найден")
    if user.role == Role.PARENT.value and student.parent_id != user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
    if not student.device:
        return None
    return db.execute(
        select(LocationPoint)
        .where(LocationPoint.device_id == student.device.id)
        .order_by(LocationPoint.recorded_at.desc())
        .limit(1)
    ).scalar_one_or_none()
