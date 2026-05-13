"""Geofence checks via PostGIS + transition detection."""
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import (
    Device,
    DeviceZoneState,
    Event,
    EventType,
    Geofence,
    Severity,
    Student,
)


def check_transitions(
    db: Session,
    device: Device,
    student: Student,
    lat: float,
    lon: float,
) -> list[Event]:
    """For every geofence relevant to this student, detect enter/exit transitions
    against stored DeviceZoneState. Returns newly created Event rows (not yet flushed)."""
    fences = db.execute(
        select(Geofence).where(
            (Geofence.student_id == student.id) | (Geofence.student_id.is_(None))
        )
    ).scalars().all()

    if not fences:
        return []

    new_events: list[Event] = []

    for fence in fences:
        is_inside = db.execute(
            select(
                func.ST_Covers(
                    fence.polygon,
                    func.ST_SetSRID(func.ST_MakePoint(lon, lat), 4326),
                )
            )
        ).scalar()

        state = db.execute(
            select(DeviceZoneState).where(
                DeviceZoneState.device_id == device.id,
                DeviceZoneState.geofence_id == fence.id,
            )
        ).scalar_one_or_none()

        if state is None:
            state = DeviceZoneState(
                device_id=device.id,
                geofence_id=fence.id,
                is_inside=bool(is_inside),
            )
            db.add(state)
            continue

        if bool(is_inside) == state.is_inside:
            continue

        evt_type = EventType.ENTER_ZONE if is_inside else EventType.EXIT_ZONE
        action = "вошёл в" if is_inside else "вышел из"
        msg = f"{student.full_name} {action} зону «{fence.name}»"
        severity = Severity.INFO if fence.zone_type in ("school", "home") and is_inside else Severity.WARNING

        evt = Event(
            student_id=student.id,
            event_type=evt_type.value,
            severity=severity.value,
            geofence_id=fence.id,
            message=msg,
            lat=lat,
            lon=lon,
        )
        db.add(evt)
        new_events.append(evt)

        state.is_inside = bool(is_inside)
        state.updated_at = datetime.now(timezone.utc)

    return new_events
