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


TYPE_TO_CONTACT: dict[str, str] = {
    "2": ContactType.WHITELIST.value,
    "5": ContactType.FAMILY.value,
    "6": ContactType.SOS.value,
}
TYPE_TO_RESPONSE_KEY: dict[str, str] = {
    "2": "whiteNumber",
    "5": "familyNumber",
    "6": "sosNumber",
}


@router.post("/getDevParam")
def get_dev_param(payload: DevParamRequest, db: Annotated[Session, Depends(get_db)]):
    """HC02 boot-up config pull (spec section 5). Identification by IMEI only.

    Per spec, the platform always replies success=true with an empty list when
    there is no data, never an error — otherwise the device firmware may abort
    its boot sequence. So we return empty results for unknown IMEI as well.
    """
    device = db.execute(select(Device).where(Device.imei == payload.identity)).scalar_one_or_none()

    if payload.type == "3":
        # Classroom mode pull. MVP: schedule isn't persisted per device yet — return empty.
        return {"timeList": [], "success": "true", "swit": 0, "message": "Operation successful"}

    contact_type = TYPE_TO_CONTACT.get(payload.type)
    response_key = TYPE_TO_RESPONSE_KEY.get(payload.type)
    if not contact_type or not response_key:
        return {"success": "false", "message": f"Unknown type {payload.type}"}

    rows = _contacts(db, device.id, contact_type) if device else []
    return {response_key: _serialize(rows), "success": "true", "message": "Operation successful"}
