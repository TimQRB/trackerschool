"""Batch & single device commands.

Sends commands to device(s) through the gateway via Redis Pub/Sub.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..device_commands import send_command
from ..models import Device, Role, Student, User
from ..security import get_current_user, require_roles


router = APIRouter(prefix="/api/commands", tags=["commands"])


class BatchCommandRequest(BaseModel):
    student_ids: list[int]
    command: str  # lesson_mode | locate_now | set_gps_interval | set_heart_rate_interval | set_sms_block
    payload: dict = {}


# Protocol type lookup for HC02 commands
COMMAND_PROTO_MAP: dict[str, int] = {
    "lesson_mode": 0x03D7,
    "locate_now": 0x03DD,
    "set_gps_interval": 0x03D1,
    "set_sms_block": 0x1015,
    "set_heart_rate_interval": 0x110D,
}


@router.post("/batch")
def batch_command(
    payload: BatchCommandRequest,
    db: Annotated[Session, Depends(get_db)],
    user: Annotated[User, Depends(require_roles(Role.SCHOOL.value, Role.ADMIN.value))],
):
    """Send a command to multiple students' devices at once.

    Supported commands (units match HC02 manufacturer spec):
      - lesson_mode:  { swit: 0|1|3, list: [{ week: "0,1,2,...", timeList: [{ begTime: "0800", endTime: "1600" }] }] }
                      swit: 0=off, 1=on (no SOS calls), 3=on (SOS allowed)
                      week: comma-separated digits where 0=Sunday, 1=Monday, ..., 6=Saturday
      - locate_now:   {}
      - set_gps_interval:    { posPeriod: "5" }      # MINUTES (1-60), not seconds
      - set_heart_rate_interval: { heartRatePeriod: "60" }  # MINUTES (5-120)
      - set_sms_block: { interceptorMode: "1"|"2"|"3" }
                       1=no block, 2=family+whitelist only, 3=block all
    """
    proto_type = COMMAND_PROTO_MAP.get(payload.command)
    if proto_type is None:
        raise HTTPException(status_code=400, detail=f"Неизвестная команда: {payload.command}")

    devices = db.execute(
        select(Device).where(
            Device.student_id.in_(payload.student_ids),
            Device.is_active.is_(True),
            Device.imei.isnot(None),
        )
    ).scalars().all()

    if not devices:
        raise HTTPException(status_code=404, detail="Нет устройств для отправки команды")

    results = []
    for device in devices:
        subscribers = send_command(device.imei, proto_type, {"req": payload.payload})
        results.append({
            "device_id": device.id,
            "imei": device.imei,
            "student_id": device.student_id,
            "sent": subscribers > 0,
        })

    return {"ok": True, "results": results}
