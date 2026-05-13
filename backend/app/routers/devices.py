import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Device, Role, Student, User
from ..schemas import DeviceCreate, DeviceOut
from ..security import require_roles


router = APIRouter(prefix="/api/devices", tags=["devices"])


@router.get("", response_model=list[DeviceOut])
def list_devices(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value, Role.SCHOOL.value))],
):
    return db.execute(select(Device)).scalars().all()


@router.post("", response_model=DeviceOut, status_code=201)
def create_device(
    payload: DeviceCreate,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    if db.execute(select(Device).where(Device.identifier == payload.identifier)).scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Устройство с таким идентификатором уже есть")
    if payload.student_id is not None:
        student = db.get(Student, payload.student_id)
        if not student:
            raise HTTPException(status_code=400, detail="Ученик не найден")
        if student.device:
            raise HTTPException(status_code=409, detail="У ученика уже есть устройство")
    device = Device(
        identifier=payload.identifier,
        student_id=payload.student_id,
        api_key=secrets.token_urlsafe(24),
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return device


@router.post("/{device_id}/assign/{student_id}", response_model=DeviceOut)
def assign_device(
    device_id: int,
    student_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_roles(Role.ADMIN.value))],
):
    device = db.get(Device, device_id)
    student = db.get(Student, student_id)
    if not device or not student:
        raise HTTPException(status_code=404, detail="Не найдено")
    if student.device and student.device.id != device.id:
        raise HTTPException(status_code=409, detail="У ученика уже есть устройство")
    device.student_id = student_id
    db.commit()
    db.refresh(device)
    return device
