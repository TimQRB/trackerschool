"""Boot-up config pull endpoint per HC02 protocol spec.

Device hits this on power-on to retrieve whitelist / SOS / family numbers / classroom mode.
No auth — device authenticates by IMEI. Should be on the same public host as TCP gateway.
"""
from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Contact, ContactType, Device


router = APIRouter(tags=["device-boot"])


class DevParamRequest(BaseModel):
    identity: str  # IMEI
    type: str      # "2" whitelist | "3" classroom | "5" family | "6" SOS


def _contacts(db: Session, device_id: int, contact_type: str) -> list[Contact]:
    return db.execute(
        select(Contact)
        .where(Contact.device_id == device_id, Contact.contact_type == contact_type)
        .order_by(Contact.serial_no.asc(), Contact.id.asc())
    ).scalars().all()


def _serialize(rows: list[Contact]) -> list[dict]:
    return [
        {
            "number": r.number,
            "serialnumber": str(idx),
            "name": r.display_name,
            "url": None,
        }
        for idx, r in enumerate(rows)
    ]


@router.post("/getDevParam")
def get_dev_param(payload: DevParamRequest, db: Annotated[Session, Depends(get_db)]):
    device = db.execute(select(Device).where(Device.imei == payload.identity)).scalar_one_or_none()
    if not device:
        return {"success": "false", "message": "Device not found"}

    t = payload.type
    if t == "2":  # whitelist
        rows = _contacts(db, device.id, ContactType.WHITELIST.value)
        return {"whiteNumber": _serialize(rows), "success": "true", "message": "Operation successful"}
    if t == "5":  # family
        rows = _contacts(db, device.id, ContactType.FAMILY.value)
        return {"success": "true", "familyNumber": _serialize(rows), "message": "Operation successful"}
    if t == "6":  # SOS
        rows = _contacts(db, device.id, ContactType.SOS.value)
        return {"success": "true", "sosNumber": _serialize(rows), "message": "Operation successful"}
    if t == "3":  # classroom mode (not modeled yet — return empty)
        return {"timeList": [], "success": "true", "swit": 0, "message": "Operation successful"}

    return {"success": "false", "message": f"Unknown type {t}"}
