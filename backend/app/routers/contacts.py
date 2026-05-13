from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..device_commands import send_command
from ..models import CONTACT_TYPE_TO_VENDOR, Contact, ContactType, Device, Role, User
from ..schemas import ContactCreate, ContactOut
from ..security import require_roles


router = APIRouter(prefix="/api/contacts", tags=["contacts"])


def _valid_types() -> set[str]:
    return {t.value for t in ContactType}


def _push_contacts_for_type(db: Session, device: Device, contact_type: str) -> None:
    """Build 0x03D0 payload for given contact_type and publish through gateway."""
    if not device.imei:
        return
    rows = db.execute(
        select(Contact)
        .where(Contact.device_id == device.id, Contact.contact_type == contact_type)
        .order_by(Contact.serial_no.asc(), Contact.id.asc())
    ).scalars().all()

    vendor_type = CONTACT_TYPE_TO_VENDOR[contact_type]
    typelist = [
        {
            "number": r.number,
            "disname": r.display_name,
            "serialNo": r.serial_no or (idx + 1),
        }
        for idx, r in enumerate(rows)
    ]
    payload = {
        "req": {
            "pkId": 0,
            "pkCount": 1,
            "list": [{"type": str(vendor_type), "typelist": typelist}],
        }
    }
    send_command(device.imei, 0x03D0, payload)


@router.get("", response_model=list[ContactOut])
def list_contacts(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
    device_id: int = Query(...),
):
    return db.execute(
        select(Contact).where(Contact.device_id == device_id).order_by(Contact.contact_type, Contact.serial_no)
    ).scalars().all()


@router.post("", response_model=ContactOut, status_code=201)
def create_contact(
    payload: ContactCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    if payload.contact_type not in _valid_types():
        raise HTTPException(status_code=400, detail="Недопустимый тип контакта")
    device = db.get(Device, payload.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Устройство не найдено")

    if payload.contact_type in (ContactType.FAMILY.value, ContactType.SOS.value):
        count = db.execute(
            select(Contact).where(
                Contact.device_id == device.id,
                Contact.contact_type == payload.contact_type,
            )
        ).all()
        if len(count) >= 3:
            raise HTTPException(status_code=400, detail="Можно не более 3 номеров этого типа")

    contact = Contact(
        device_id=payload.device_id,
        contact_type=payload.contact_type,
        number=payload.number,
        display_name=payload.display_name,
        serial_no=payload.serial_no,
    )
    db.add(contact)
    db.commit()
    db.refresh(contact)
    _push_contacts_for_type(db, device, payload.contact_type)
    return contact


@router.delete("/{contact_id}", status_code=204)
def delete_contact(
    contact_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    contact = db.get(Contact, contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Не найдено")
    device = db.get(Device, contact.device_id)
    contact_type = contact.contact_type
    db.delete(contact)
    db.commit()
    if device:
        _push_contacts_for_type(db, device, contact_type)
